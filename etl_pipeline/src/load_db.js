// Interactive loader: cleaned_json_data/*.json -> MySQL (schema from database/schema.sql).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const DATA = path.join(ROOT, 'cleaned_json_data');
// setup_db.sh writes the shared project credentials to the repository root.
const ENV_FILE = [path.join(ROOT, '.env'), path.resolve(ROOT, '..', '.env')]
  .find((file) => fs.existsSync(file)) ?? path.join(ROOT, '.env');
const BATCH = 5000;

// ---------- terminal helpers ----------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
const origWrite = rl._writeToOutput.bind(rl);
rl._writeToOutput = (s) => (muted ? origWrite(s.includes('\n') || s.includes('\r') ? s : '') : origWrite(s));

const ask = (q, def = '') =>
  new Promise((res) => rl.question(def ? `${q} [${def}]: ` : `${q}: `, (a) => res(a.trim() || def)));
const askSecret = (q, def = '') =>
  new Promise((res) => {
    muted = true;
    rl.question(`${q}${def ? ' [saved in .env]' : ''}: `, (a) => {
      muted = false;
      console.log();
      res(a || def);
    });
  });
const confirm = async (q, def = 'y') => /^y/i.test(await ask(`${q} (y/n)`, def));

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    fs.readFileSync(ENV_FILE, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
  );
}

// ---------- loading ----------
// Each file is a JSON array with one record per line (see JsonArrayWriter in etl.js).
async function* readRecords(file) {
  const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const raw of lines) {
    const line = raw.replace(/,$/, '').trim();
    if (line === '' || line === '[' || line === ']') continue;
    yield JSON.parse(line);
  }
}

const TABLES = [
  { file: 'zones.json', table: 'zones', cols: ['location_id', 'borough', 'zone', 'service_zone'] },
  { file: 'zone_geometries.json', table: 'zone_geometries', cols: ['location_id', 'centroid_lat', 'centroid_lon', 'area_sq_km', 'geometry'], json: ['geometry'] },
  { file: 'vendors.json', table: 'vendors', cols: ['vendor_id', 'vendor_name'] },
  { file: 'payment_types.json', table: 'payment_types', cols: ['payment_type_id', 'description'] },
  { file: 'rate_codes.json', table: 'rate_codes', cols: ['rate_code_id', 'description'] },
  {
    file: 'trips.json', table: 'trips',
    cols: [
      'trip_id', 'vendor_id', 'pickup_datetime', 'dropoff_datetime', 'passenger_count', 'trip_distance_miles',
      'rate_code_id', 'store_and_fwd_flag', 'pu_location_id', 'do_location_id', 'payment_type_id',
      'fare_amount', 'extra', 'mta_tax', 'tip_amount', 'tolls_amount', 'improvement_surcharge',
      'congestion_surcharge', 'total_amount', 'trip_duration_min', 'avg_speed_mph', 'fare_per_mile',
      'pickup_day_of_week', 'is_weekend', 'tip_pct', 'pickup_hour', 'is_rush_hour', 'is_cross_borough',
    ],
    bool: ['is_weekend', 'is_rush_hour', 'is_cross_borough'],
  },
];

async function loadTable(conn, spec) {
  const file = path.join(DATA, spec.file);
  const size = fs.statSync(file).size;
  const sql = `INSERT INTO \`${spec.table}\` (${spec.cols.map((c) => `\`${c}\``).join(',')}) VALUES ?`;
  const toRow = (r) => spec.cols.map((c) => {
    const v = r[c] ?? null;
    if (spec.json?.includes(c)) return JSON.stringify(v);
    if (spec.bool?.includes(c)) return v ? 1 : 0;
    return v;
  });

  let batch = [], total = 0;
  const t0 = Date.now();
  const flush = async () => {
    if (!batch.length) return;
    await conn.query(sql, [batch]);
    total += batch.length;
    batch = [];
    const pct = Math.min(100, (total / (spec.expected ?? Infinity)) * 100);
    process.stdout.write(`\r  ${spec.table}: ${total.toLocaleString()} rows${Number.isFinite(pct) ? ` (${pct.toFixed(0)}%)` : ''} ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
  };

  for await (const rec of readRecords(file)) {
    batch.push(toRow(rec));
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  console.log(`\r  ${spec.table}: ${total.toLocaleString()} rows loaded from ${(size / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s   `);
  return total;
}

async function main() {
  console.log('\n=== Urban Mobility: load cleaned JSON into MySQL ===\n');
  const env = loadEnv();

  for (const t of TABLES) {
    if (!fs.existsSync(path.join(DATA, t.file))) throw new Error(`Missing ${t.file}. Run "npm run etl" first.`);
  }

  const cfg = {
    host: await ask('Host', env.DB_HOST || 'localhost'),
    port: Number(await ask('Port', env.DB_PORT || '3306')),
    user: await ask('User', env.DB_USER || 'urban_app'),
    password: await askSecret('Password', env.DB_PASSWORD),
    database: await ask('Database', env.DB_NAME || 'urban_mobility'),
  };

  let conn;
  try {
    conn = await mysql.createConnection(cfg);
  } catch (e) {
    throw new Error(`Cannot connect: ${e.message}. Run ./setup_db.sh first?`);
  }
  console.log('Connected.\n');

  // existing data check
  const counts = {};
  for (const t of TABLES) {
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t.table}\``);
    counts[t.table] = n;
  }
  const hasData = Object.values(counts).some((n) => n > 0);
  if (hasData) {
    console.log('Tables already contain data:', counts);
    if (!(await confirm('Truncate all tables and reload?', 'n'))) {
      console.log('Aborted; nothing changed.');
      await conn.end();
      rl.close();
      return;
    }
  }

  let selected = TABLES;
  if (!hasData) {
    const names = TABLES.map((t) => t.table);
    const ans = await ask(`Tables to load, comma-separated, or "all" (${names.join(', ')})`, 'all');
    if (ans !== 'all') {
      const want = new Set(ans.split(',').map((s) => s.trim()));
      selected = TABLES.filter((t) => want.has(t.table));
      if (!selected.length) throw new Error('No valid tables selected.');
    }
  }

  if (!(await confirm(`Load ${selected.map((t) => t.table).join(', ')} into ${cfg.database}@${cfg.host}?`))) {
    await conn.end();
    rl.close();
    return;
  }
  rl.close();

  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  if (hasData) for (const t of [...TABLES].reverse()) await conn.query(`TRUNCATE TABLE \`${t.table}\``);
  await conn.query('SET UNIQUE_CHECKS=0');

  const results = {};
  const start = Date.now();
  for (const t of selected) {
    try {
      await conn.beginTransaction();
      results[t.table] = await loadTable(conn, t);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.error(`\nFailed loading ${t.table}: ${e.message}`);
      await conn.query('SET FOREIGN_KEY_CHECKS=1');
      await conn.end();
      process.exit(1);
    }
  }
  await conn.query('SET UNIQUE_CHECKS=1');
  await conn.query('SET FOREIGN_KEY_CHECKS=1');

  console.log('\nVerifying...');
  for (const t of selected) {
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t.table}\``);
    console.log(`  ${t.table.padEnd(16)} json=${results[t.table].toLocaleString().padStart(10)}  db=${n.toLocaleString().padStart(10)}  ${n === results[t.table] ? 'OK' : 'MISMATCH'}`);
  }
  if (selected.some((t) => t.table === 'trips')) {
    const [[{ n }]] = await conn.query(
      'SELECT COUNT(*) AS n FROM trips t LEFT JOIN zones z ON z.location_id = t.pu_location_id WHERE z.location_id IS NULL',
    );
    console.log(`  orphan trips (no pickup zone): ${n}`);
  }
  console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  await conn.end();
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
