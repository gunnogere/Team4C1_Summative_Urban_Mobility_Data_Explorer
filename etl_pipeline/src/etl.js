// this is the primary Node.js ETL script for the Urban Mobility Data explory project 
//data was extracted from the SUmmative link https://alueducation.instructure.com/courses/3138/assignments/44952 for the NYC dataset

//Author: Joshua Mulongo 
//GitHUb Username: @gunnogere
//GItHub Repo: Team4C1_Summative_Urban_Mobility_Data_Explorer

//The goal of this script is to extract, transform, and load (stage) the NYC taxi trip data into a cleaned JSON data format 
//from the JSON format, this data can then be easily loaded into a database  by the team mate handling  teh database tasks of the group assignement 

//I chose to go with Node.js and not python because my familiarity with it but also because of its non-blocking input/output model which is important for handling large datasets more efficiently comapred to Python.


//import modules needed for the ETL process
import fs from 'node:fs'; // import the Node.js file system module to be used for writing and reading files
import path from 'node:path'; // this module provides utilitoes for working with files and directory paths 
import readline from 'node:readline'; // to provide an interface for reading data from a data stream
import crypto from 'node:crypto'; // for cryptopgrahic operations suc as hasing
import { fileURLToPath } from 'node:url'; // convert file URLs to a file path
import * as shapefile from 'shapefile'; //shapefile module for reading shapefiles in the NYC provided datasets
import proj4 from 'proj4'; // for coordinate system transformations 


//declare constants to use acrross the entire ETL pipeline
const here = path.dirname(fileURLToPath(import.meta.url)); 
const ROOT = path.resolve(here, '..'); 
const RAW = path.join(ROOT, 'raw_data'); 
const OUT = path.join(ROOT, 'cleaned_json_data'); 
const DOCS = path.resolve(ROOT, '..', 'docs'); 
const TRIP_FILE = path.join(RAW, 'yellow_tripdata_2019-01.csv'); //source file for trip data. the file is quite large and ehence excluded from commit (version control)
const LOOKUP_FILE = path.join(RAW, 'taxi_zone_lookup.csv'); //this is the timezone look up file joined for better understanding of dthe code.

//Variables to store .shp , .dbf, .prj files 
const SHP_FILE = path.join(RAW, 'taxi_zones', 'taxi_zones.shp');  
const DBF_FILE = path.join(RAW, 'taxi_zones', 'taxi_zones.dbf'); 
const PRJ_FILE = path.join(RAW, 'taxi_zones', 'taxi_zones.prj'); 

// Reference month of the file; records outside it are temporal anomalies.
// define the start and end of reference month
const MONTH_START = Date.UTC(2019, 0, 1); // 
const MONTH_END = Date.UTC(2019, 1, 1); 

// limits and constraints for validating trip data
// such as maximum distance, fare, total amount, duration, speed and number of passesngers 
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

// reference data for vendors, rates codes and payment types as from anaylsis of .CSV file
const VENDORS = [
  { vendor_id: 1, vendor_name: 'Creative Mobile Technologies, LLC' },
  { vendor_id: 2, vendor_name: 'VeriFone Inc.' },
  { vendor_id: 4, vendor_name: 'Vendor 4 (undocumented in 2019 data dictionary)' },
];

// reference data for rate codes as from the analysis of the CSv file
// each rate code corresponds to a specific type of fare calculation used in the trip data
const RATE_CODES = [
  { rate_code_id: 1, description: 'Standard rate' },
  { rate_code_id: 2, description: 'JFK' },
  { rate_code_id: 3, description: 'Newark' },
  { rate_code_id: 4, description: 'Nassau or Westchester' },
  { rate_code_id: 5, description: 'Negotiated fare' },
  { rate_code_id: 6, description: 'Group ride' },
];

// reference data for the payment types as from the analysis of the CSV file
const PAYMENT_TYPES = [
  { payment_type_id: 1, description: 'Credit card' },
  { payment_type_id: 2, description: 'Cash' },
  { payment_type_id: 3, description: 'No charge' },
  { payment_type_id: 4, description: 'Dispute' },
  { payment_type_id: 5, description: 'Unknown' },
  { payment_type_id: 6, description: 'Voided trip' },
];

// ---------- helper functions ----------
// this method writes data into a the specified file
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
//one record per lines avoids trying to overload memory by attempting to load the entire array ata once
// this was optimsied after the ETL froze due to memory oveload 
//this was recalled from the class meeting about time and memory complexities 
//JsonArrayWriter is an inbuilt Node.js class that extends the Writer class to handle JSON array writing efficienlty

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

// JsonArrayWriter function writes an array of JSON objectins into thespecified file one record at a time
//this per line write is important as it prevent memory overload as mentioned above
//  this fucntion is used across the ETL pipeline whenever JSON array writing is needed
async function writeJson(name, data) {
  const w = new JsonArrayWriter(path.join(OUT, name));
  await w.open();
  for (const r of data) await w.push(r);
  await w.close();
  return data.length;
}

//helper fucntion for CSV cell escaping and rounding numbers 
//it escapes the CSV cell by doubling any exsiting double quotes within the cell 
//  the round fucntion rounds a number to the specified number of decima places 
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const round = (v, d) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

// Parses 'YYYY-MM-DD HH:MM:SS' strictly; returns epoch ms (treated as local wall-clock) or NaN.
// data cleaning and parsing fucntion for timestamp and numeric values
//toISOString is used to convert the local wall-clock time to a standardised ISO string 
// TS_RE in this context is a custom REGEX pattern used to strictly match the 'YYYY-MM-DD HH:MM:SS' format for timestamps

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

const num = (s) => (s === '' || s === undefined ? NaN  : Number(s));
const intOrNaN = (s) => {
  const n = num(s);
  return Number.isInteger(n) ? n : NaN;
};

// ---------- dimension: zone lookup ----------
// loda timezone lookup from the CSV file containing the zone information from the downloaded files
// it reads the file and parses the data into an array of zone objects 

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
// convert taxi_zone shapefile into geojson
// A custom utility funtion to calculate the area and centroid of a polygon ring
function ringStats(ring){
  let a=0;
  let cx = 0;
  let cy = 0;
  for (let i=0; i<ring.length-1; i++){
    const [x0,y0] =ring[i];
    const [x1,y1] =ring[i+1];
    const cr = x0*y1-x1*y0;
    a+=cr;
    cx+=(x0+x1)*cr;
    cy+=(y0+y1)*cr;
  }
  return {a:a/2,cx,cy};
}

// load geometrics from shapefile and convert to WGS84 GeoJSON
// this fuction loads the geomtrics from the shapefile and convert thwm to WGS84 GeoJSON
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

  // convert the aggregated geometrics to GeoJSON featues
  // this helps with converting the aggregated geomtrics into a GeoJSON format ready for use in mapping visialisations 
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
// load the trip data and process it into json while applying exclusions and corections 
// this is impportant for ensuring that the trpi data is cleaned based on the rules in this ETL Pipeline
// an example of an exclusion is a row that has a an invalid timestamp or  missing column value 
// a correction in his case might inlude the fixing for an invliade timepat, or eplace a blank vaule with a default null instead
// cleanups are improtant and a baseline for data analysis
//hnce this step in the ETL process is critical. 

async function processTripData(zoneMapData) {
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
    if (!zoneMapData.has(puLoc) || !zoneMapData.has(doLoc)) { await exclude('INVALID_LOCATION_ID', `PU=${puLoc} DO=${doLoc}`); continue; }

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
    // correctble fields are those thatr can be fixed or  set to a default value instead of dropping the entore trip row
    // examples include invalid passenger count as a it wpuld not be a trip at all if there was no passender (null or zero)
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
    // these are records we suspsect might have issues but are not outrightly invalid
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
  // derive additonal features from the existing trip data
    const pDate = new Date(pickup);
    const hour = pDate.getUTCHours();
    const dow = pDate.getUTCDay(); // 0=Sunday
    const weekend = dow === 0 || dow === 6;
    const rush = !weekend && ((hour >= 7 && hour < 10) || (hour >= 16 && hour < 20));
    const puBorough = zoneMapData.get(puLoc).borough, doBorough = zoneMapData.get(doLoc).borough;

    // from teh .csv analysis: these are the derived features we want to include in the output JSON file
    await tripsOut.push({
      trip_id: rowNo, vendor_id: vendor,
      pickup_datetime: isoLocal(pickup), dropoff_datetime: isoLocal(dropoff),
      passenger_count: pax, trip_distance_miles: round(dist, 2),
      rate_code_id: rate, store_and_fwd_flag: flag, pu_location_id: puLoc,do_location_id: doLoc,
      payment_type_id: pay,fare_amount: round(fare, 2),
      extra: round(extra, 2),mta_tax: round(mta, 2),
      tip_amount: round(tip, 2), tolls_amount: round(tolls, 2), improvement_surcharge: round(imp, 2),
      congestion_surcharge: round(cong, 2), total_amount: round(total, 2),
      trip_duration_min: round(durMin, 2), avg_speed_mph: round(speed, 2),
      fare_per_mile: round(fare / dist, 2),pickup_day_of_week: dow, is_weekend: weekend,
      tip_pct: pay === 1 && fare > 0 ? round((tip / fare) * 100, 2) : null, pickup_hour: hour,
      is_rush_hour: rush, is_cross_borough: puBorough !== doBorough,
    });
    stats.rows_kept++;
  }

  await tripsOut.close();
  await log.end();
  return stats;
}

// ---------- main ----------

// purpose: the function is the 'big boy' that orchestrated the entire ETL process for the trip data
// it uses the custom fucntions codes above  and loads the ETL pipeline for processing the tip data
// it also genearates summary stattistics ad wrotes them into the exclusion summary json file
// 


async function main() {
  fs.mkdirSync(OUT, { recursive: true }); 
  fs.mkdirSync(DOCS, { recursive: true });
  const t0 = Date.now();

  console.log('Loading zone lookup and spatial metadata...');
  const zones = loadLookup();
  const zoneMapData = new Map(zones.map((z) => [z.location_id, z]));
  const geoms = await loadGeometries();
  const geomIds = new Set(geoms.map((g) => g.location_id));

  //create a summary of the spatial metadata for the ETL process
  // this summary helps in understanding the completelness of the spatial metadata for the ETL process 
  const spatial = {
    lookup_zones: zones.length,
    zones_with_geometry: geoms.length,
    lookup_zones_without_geometry: zones.filter((z) => !geomIds.has(z.location_id)).map((z) => z.location_id),
    geometry_ids_not_in_lookup: [...geomIds].filter((id) => !zoneMapData.has(id)),
  };

  await writeJson('zones.json', zones); //  write zone lookups into its outpu file
  await writeJson('zone_geometries.json', geoms); // write zone geometrics into its outpu file
  await writeJson('vendors.json', VENDORS); // write vendor lookups into their json file
  await writeJson('rate_codes.json', RATE_CODES); // write rate code lookups into their respective json file
  await writeJson('payment_types.json', PAYMENT_TYPES); // write payment type lookups into their respective jsn file


  // i added some messages for the user as they wait the trip data to be proceeded 
  // this is simply a beautifier and not essential to the ETL pricess itself for data processing 
  console.log('Processing trips from file;; hangtight this might take a minute...\n'); // write to terminal for UI feel 
    
    //fun facts about New York City Taxis
    let funNYCFactsArray =[
      'The iconic yellow taxis started operations as far back as the ealry 1900s.',
      'The Iconic "Medallion" system was created during the Greate Depression in 1937 to limit the number of taxis on the Street',
      'Taci driver must undergo a background check and complete specialied traiing, inclusing learning NYC geography, before getting licesnses.',
      'Before electronic meters, NYC taxicab fars were claculated by distance counters mounted on the front wheels'
    ]

    //pick 2 random unique facts to show to the user on terminal
    const shuffledFacts = [...funNYCFactsArray].sort(()=>0.5 -Math.random());
    const selectedFacts = shuffledFacts.slice(0,2);

    console.log('As you wait, here are two fun facts about NYC Taxis:');
    selectedFacts.forEach((fact,index) =>{
      console.log (` ${index+1}. Did you know? ${fact}`);
    }
    );
    
    // add spacing line before processing finishes
  console.log('');
  
  // i used awit to ensure that the trip processing completes before moving on to the next step
  // this (awaits) ensures clean error handling
  const stats = await processTripData(zoneMapData); 

  // create a summary object that will be written to the Exclusion_Summary.json file 
  // this summary includes metadata about the ETL run as well as the processed statistics 
  // it combines the current timestamps, source file information, ETL Limits and processes statisctcs 
  const summary = { generated_at: new Date().toISOString(), source: path.basename(TRIP_FILE), limits: LIMITS, spatial, ...stats };
  fs.writeFileSync(path.join(DOCS, 'Exclusion_Summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Done in ${round((Date.now() - t0) / 1000, 1)}s`);
}


// the is the entry point for the ETL process 
// it calls the main fucntion and handles any uncaught errors by logging them and exiting the process
// this ensures that unhandles errrors are propely loggd and  the process exits gracefully 
main().catch((e) => { console.error(e); process.exit(1); });