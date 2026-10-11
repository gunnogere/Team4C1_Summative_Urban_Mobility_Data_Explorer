import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as shapefile from 'shapefile';
import proj4 from 'proj4';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const RAW = path.join(ROOT, 'raw_data');
const OUT = path.join(ROOT, 'cleaned_json_data');
const DOCS = path.resolve(ROOT, '..', 'docs');

const TRIP_FILE = path.join(RAW, 'yellow_tripdata_2019-01.csv');
const LOOKUP_FILE = path.join(RAW, 'taxi_zone_lookup.csv');
const SHP_FILE = path.join(RAW, 'taxi_zones', 'taxi_zones.shp');
const DBF_FILE = path.join(RAW, 'taxi_zones', 'taxi_zones.dbf');
const PRJ_FILE = path.join(RAW, 'taxi_zones', 'taxi_zones.prj');

// Reference month of the file; records outside it are temporal anomalies.
const MONTH_START = Date.UTC(2019, 0, 1);
const MONTH_END = Date.UTC(2019, 1, 1);
const MAX_LOCATION_ID = 265;

const LIMITS = {
  maxDistanceMi: 100,
  maxFare: 500,
  maxTotal: 1000,
  maxDurationMin: 24 * 60,
  minDurationSec: 30,
  maxSpeedMph: 100,
  maxPassengers: 6,
  totalToleranceUsd: 1,
};

const VENDORS = [
  { vendor_id: 1, vendor_name: 'Creative Mobile Technologies, LLC' },
  { vendor_id: 2, vendor_name: 'VeriFone Inc.' },
  { vendor_id: 4, vendor_name: 'Vendor 4 (undocumented in 2019 data dictionary)' },
];
const RATE_CODES = [
  { rate_code_id: 1, description: 'Standard rate' },
  { rate_code_id: 2, description: 'JFK' },
  { rate_code_id: 3, description: 'Newark' },
  { rate_code_id: 4, description: 'Nassau or Westchester' },
  { rate_code_id: 5, description: 'Negotiated fare' },
  { rate_code_id: 6, description: 'Group ride' },
];
const PAYMENT_TYPES = [
  { payment_type_id: 1, description: 'Credit card' },
  { payment_type_id: 2, description: 'Cash' },
  { payment_type_id: 3, description: 'No charge' },
  { payment_type_id: 4, description: 'Dispute' },
  { payment_type_id: 5, description: 'Unknown' },
  { payment_type_id: 6, description: 'Voided trip' },
];

// ---------- helpers ----------

class Writer {
  constructor(file) {
    this.stream = fs.createWriteStream(file);
  }
  async write(s) {
    if (!this.stream.write(s)) await new Promise((r) => this.stream.once('drain', r));
  }
  end() {
    return new Promise((r) => this.stream.end(r));
  }
}

// Writes a valid JSON array with one record per line.
class JsonArrayWriter extends Writer {
  constructor(file) {
    super(file);
    this.first = true;
    this.count = 0;
  }
  async open() {
    await this.write('[\n');
  }
  async push(obj) {
    await this.write((this.first ? '' : ',\n') + JSON.stringify(obj));
    this.first = false;
    this.count++;
  }
  async close() {
    await this.write('\n]\n');
    await this.end();
  }
}

async function writeJson(name, data) {
  const w = new JsonArrayWriter(path.join(OUT, name));
  await w.open();
  for (const r of data) await w.push(r);
  await w.close();
  return data.length;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const round = (v, d) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

// Parses 'YYYY-MM-DD HH:MM:SS' strictly; returns epoch ms (treated as local wall-clock) or NaN.
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
function parseTs(s) {
  const m = TS_RE.exec(s);
  if (!m) return NaN;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  const t = Date.UTC(y, mo - 1, d, h, mi, se);
  const dt = new Date(t);
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? t : NaN;
}
const isoLocal = (t) => new Date(t).toISOString().slice(0, 19);

const num = (s) => (s === '' || s === undefined ? NaN : Number(s));
const intOrNaN = (s) => {
  const n = num(s);
  return Number.isInteger(n) ? n : NaN;
};

// ---------- dimension: zone lookup ----------

function loadLookup() {
  const lines = fs.readFileSync(LOOKUP_FILE, 'utf8').split(/\r?\n/).filter(Boolean).slice(1);
  const zones = [];
  for (const line of lines) {
    const cells = [...line.matchAll(/"((?:[^"]|"")*)"|([^,]*)(?:,|$)/g)]
      .slice(0, 4)
      .map((m) => (m[1] !== undefined ? m[1].replace(/""/g, '"') : m[2]).trim());
    const [id, borough, zone, service] = cells;
    const nullable = (v) => (!v || /^(n\/a|na|null)$/i.test(v) ? null : v);
    zones.push({
      location_id: Number(id),
      borough: nullable(borough),
      zone: nullable(zone),
      service_zone: nullable(service),
    });
  }
  return zones;
}

// ---------- spatial metadata: taxi_zones shapefile -> WGS84 GeoJSON ----------

function ringStats(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cr = x0 * y1 - x1 * y0;
    a += cr;
    cx += (x0 + x1) * cr;
    cy += (y0 + y1) * cr;
  }
  return { a: a / 2, cx, cy };
}

async function loadGeometries() {
  const wkt = fs.readFileSync(PRJ_FILE, 'utf8');
  const toWgs = proj4(wkt, 'EPSG:4326');
  const fc = await shapefile.read(SHP_FILE, DBF_FILE);
  const FT2_TO_KM2 = (0.3048006096012192 ** 2) / 1e6;

  const byId = new Map();
  for (const f of fc.features) {
    const id = Number(f.properties.LocationID);
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const entry = byId.get(id) ?? { polys: [], A: 0, CX: 0, CY: 0 };
    for (const poly of polys) {
      entry.polys.push(poly);
      for (const ring of poly) {
        const { a, cx, cy } = ringStats(ring);
        entry.A += a;
        entry.CX += cx / 6; // equals centroid_x * area summed over rings
        entry.CY += cy / 6;
      }
    }
    byId.set(id, entry);
  }

  const result = [];
  for (const [id, e] of [...byId].sort((x, y) => x[0] - y[0])) {
    const [lon, lat] = toWgs.forward([e.CX / e.A, e.CY / e.A]);
    const proj = e.polys.map((poly) =>
      poly.map((ring) => ring.map((p) => toWgs.forward(p).map((v) => round(v, 6)))),
    );
    result.push({
      location_id: id,
      centroid_lat: round(lat, 6),
      centroid_lon: round(lon, 6),
      area_sq_km: round(Math.abs(e.A) * FT2_TO_KM2, 4),
      geometry: proj.length === 1
        ? { type: 'Polygon', coordinates: proj[0] }
        : { type: 'MultiPolygon', coordinates: proj },
    });
  }
  return result;
}

// ---------- fact: trips ----------

async function processTrips(zoneMap) {
  const tripsOut = new JsonArrayWriter(path.join(OUT, 'trips.json'));
  await tripsOut.open();
  const log = new Writer(path.join(DOCS, 'Exclusion_Log.csv'));
  await log.write('source_row,action,reason_code,detail,raw_record\n');

  const stats = {
    rows_read: 0,
    rows_kept: 0,
    rows_excluded: 0,
    excluded_by_reason: {},
    corrected_by_reason: {},
    flagged_by_reason: {},
  };
  const bump = (obj, k) => (obj[k] = (obj[k] ?? 0) + 1);
  const seen = new Set();

  const rl = readline.createInterface({ input: fs.createReadStream(TRIP_FILE), crlfDelay: Infinity });
  let rowNo = 0;
  let header = null;

  for await (const line of rl) {
    if (header === null) { header = line.split(','); continue; }
    if (line.trim() === '') continue;
    rowNo++;
    stats.rows_read++;
    if (rowNo % 1_000_000 === 0) console.log(`  ${rowNo.toLocaleString()} rows processed`);

    const events = []; // [action, code, detail] for CORRECTED / FLAGGED
    const exclude = async (code, detail) => {
      stats.rows_excluded++;
      bump(stats.excluded_by_reason, code);
      await log.write(`${rowNo},EXCLUDED,${code},${csvCell(detail)},${csvCell(line)}\n`);
    };

    const c = line.split(',');
    if (c.length !== header.length) { await exclude('MALFORMED_ROW', `expected ${header.length} columns, got ${c.length}`); continue; }

    const [vendorS, puS, doS, paxS, distS, rateS, flagS, puLocS, doLocS, payS, fareS, extraS, mtaS, tipS, tollsS, impS, totalS, congS] = c;

    // required fields
    const pickup = parseTs(puS), dropoff = parseTs(doS);
    if (Number.isNaN(pickup) || Number.isNaN(dropoff)) { await exclude('INVALID_TIMESTAMP', `pickup='${puS}' dropoff='${doS}'`); continue; }
    const vendor = intOrNaN(vendorS), puLoc = intOrNaN(puLocS), doLoc = intOrNaN(doLocS), pay = intOrNaN(payS);
    const dist = num(distS), fare = num(fareS), total = num(totalS);
    if ([vendor, puLoc, doLoc, pay, dist, fare, total].some(Number.isNaN)) { await exclude('MISSING_OR_NON_NUMERIC_REQUIRED', 'vendor/location/payment/distance/fare/total missing or invalid'); continue; }

    // categorical validity
    if (!VENDORS.some((v) => v.vendor_id === vendor)) { await exclude('INVALID_VENDOR', `VendorID=${vendor}`); continue; }
    if (!PAYMENT_TYPES.some((p) => p.payment_type_id === pay)) { await exclude('INVALID_PAYMENT_TYPE', `payment_type=${pay}`); continue; }
    if (!zoneMap.has(puLoc) || !zoneMap.has(doLoc)) { await exclude('INVALID_LOCATION_ID', `PU=${puLoc} DO=${doLoc}`); continue; }

    // optional charges: blank -> 0 (congestion_surcharge did not exist before Feb 2019)
    const opt = (s) => { const n = num(s); return Number.isNaN(n) ? 0 : n; };
    const extra = opt(extraS), mta = opt(mtaS), tip = opt(tipS), tolls = opt(tollsS), imp = opt(impS), cong = opt(congS);
    const amounts = [fare, extra, mta, tip, tolls, imp, cong, total];
    if (amounts.some((v) => v < 0)) { await exclude('NEGATIVE_AMOUNT', `fare=${fare} total=${total} (refund/adjustment)`); continue; }
    if (fare === 0 || total === 0) { await exclude('ZERO_FARE', `fare=${fare} total=${total}`); continue; }
    if (fare > LIMITS.maxFare || total > LIMITS.maxTotal) { await exclude('FARE_OUTLIER', `fare=${fare} total=${total}`); continue; }

    // distance
    if (dist <= 0) { await exclude('NON_POSITIVE_DISTANCE', `distance=${dist}`); continue; }
    if (dist > LIMITS.maxDistanceMi) { await exclude('DISTANCE_OUTLIER', `distance=${dist} mi`); continue; }

    // temporal
    if (pickup < MONTH_START || pickup >= MONTH_END) { await exclude('PICKUP_OUT_OF_RANGE', `pickup=${puS}`); continue; }
    const durSec = (dropoff - pickup) / 1000;
    if (durSec <= 0) { await exclude('NON_POSITIVE_DURATION', `pickup=${puS} dropoff=${doS}`); continue; }
    if (durSec < LIMITS.minDurationSec) { await exclude('DURATION_TOO_SHORT', `${durSec}s`); continue; }
    if (durSec / 60 > LIMITS.maxDurationMin) { await exclude('DURATION_OUTLIER', `${round(durSec / 3600, 1)}h`); continue; }
    const durMin = durSec / 60;
    const speed = dist / (durMin / 60);
    if (speed > LIMITS.maxSpeedMph) { await exclude('SPEED_OUTLIER', `${round(speed, 1)} mph`); continue; }

    // duplicates: exact repeats of a valid raw record
    const h = crypto.createHash('md5').update(line).digest();
    const key = (h.readUInt32LE(0) & 0x1fffff) * 4294967296 + h.readUInt32LE(4);
    if (seen.has(key)) { await exclude('DUPLICATE', 'exact duplicate of an earlier record'); continue; }
    seen.add(key);

    // correctable fields: set to null instead of dropping the trip
    let pax = intOrNaN(paxS);
    if (Number.isNaN(pax) || pax < 1 || pax > LIMITS.maxPassengers) {
      events.push(['CORRECTED', 'PASSENGER_COUNT_INVALID', `passenger_count='${paxS}' set to NULL`]);
      pax = null;
    }
    let rate = intOrNaN(rateS);
    if (!RATE_CODES.some((r) => r.rate_code_id === rate)) {
      events.push(['CORRECTED', 'RATE_CODE_INVALID', `RatecodeID='${rateS}' set to NULL`]);
      rate = null;
    }
    let flag = flagS.trim().toUpperCase();
    if (flag !== 'Y' && flag !== 'N') {
      events.push(['CORRECTED', 'STORE_FWD_FLAG_INVALID', `store_and_fwd_flag='${flagS}' set to NULL`]);
      flag = null;
    }

    // suspicious but kept
    const computed = fare + extra + mta + tip + tolls + imp + cong;
    if (Math.abs(computed - total) > LIMITS.totalToleranceUsd) {
      events.push(['FLAGGED', 'TOTAL_MISMATCH', `sum of components=${round(computed, 2)} total_amount=${total}`]);
    }
    if (puLoc === 264 || puLoc === 265 || doLoc === 264 || doLoc === 265) {
      events.push(['FLAGGED', 'UNKNOWN_ZONE', `PU=${puLoc} DO=${doLoc}`]);
    }

    for (const [action, code, detail] of events) {
      bump(action === 'CORRECTED' ? stats.corrected_by_reason : stats.flagged_by_reason, code);
      await log.write(`${rowNo},${action},${code},${csvCell(detail)},${csvCell(line)}\n`);
    }

    // derived features
    const pDate = new Date(pickup);
    const hour = pDate.getUTCHours();
    const dow = pDate.getUTCDay(); // 0=Sunday
    const weekend = dow === 0 || dow === 6;
    const rush = !weekend && ((hour >= 7 && hour < 10) || (hour >= 16 && hour < 20));
    const puBorough = zoneMap.get(puLoc).borough, doBorough = zoneMap.get(doLoc).borough;

    await tripsOut.push({
      trip_id: rowNo,
      vendor_id: vendor,
      pickup_datetime: isoLocal(pickup),
      dropoff_datetime: isoLocal(dropoff),
      passenger_count: pax,
      trip_distance_miles: round(dist, 2),
      rate_code_id: rate,
      store_and_fwd_flag: flag,
      pu_location_id: puLoc,
      do_location_id: doLoc,
      payment_type_id: pay,
      fare_amount: round(fare, 2),
      extra: round(extra, 2),
      mta_tax: round(mta, 2),
      tip_amount: round(tip, 2),
      tolls_amount: round(tolls, 2),
      improvement_surcharge: round(imp, 2),
      congestion_surcharge: round(cong, 2),
      total_amount: round(total, 2),
      trip_duration_min: round(durMin, 2),
      avg_speed_mph: round(speed, 2),
      fare_per_mile: round(fare / dist, 2),
      tip_pct: pay === 1 && fare > 0 ? round((tip / fare) * 100, 2) : null,
      pickup_hour: hour,
      pickup_day_of_week: dow,
      is_weekend: weekend,
      is_rush_hour: rush,
      is_cross_borough: puBorough !== doBorough,
    });
    stats.rows_kept++;
  }

  await tripsOut.close();
  await log.end();
  return stats;
}

// ---------- main ----------

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(DOCS, { recursive: true });
  const t0 = Date.now();

  console.log('Loading zone lookup and spatial metadata...');
  const zones = loadLookup();
  const zoneMap = new Map(zones.map((z) => [z.location_id, z]));
  const geoms = await loadGeometries();

  const geomIds = new Set(geoms.map((g) => g.location_id));
  const spatial = {
    lookup_zones: zones.length,
    zones_with_geometry: geoms.length,
    lookup_zones_without_geometry: zones.filter((z) => !geomIds.has(z.location_id)).map((z) => z.location_id),
    geometry_ids_not_in_lookup: [...geomIds].filter((id) => !zoneMap.has(id)),
  };

  await writeJson('zones.json', zones);
  await writeJson('zone_geometries.json', geoms);
  await writeJson('vendors.json', VENDORS);
  await writeJson('rate_codes.json', RATE_CODES);
  await writeJson('payment_types.json', PAYMENT_TYPES);

  console.log('Processing trips...');
  const stats = await processTrips(zoneMap);

  const summary = { generated_at: new Date().toISOString(), source: path.basename(TRIP_FILE), limits: LIMITS, spatial, ...stats };
  fs.writeFileSync(path.join(DOCS, 'Exclusion_Summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Done in ${round((Date.now() - t0) / 1000, 1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
