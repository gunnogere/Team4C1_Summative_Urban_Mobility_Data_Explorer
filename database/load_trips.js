// load_trips.js - copies the cleaned data (etl_pipeline/cleaned_json_data) into MySQL:
// first the small tables (zones, vendors, payment types, rate codes, zone geometries),
// then the big "trips" table.
// Run from the main project folder:
//   node database/load_trips.js 100000     (test: only the first 100,000 trips)
//   node database/load_trips.js            (all trips, takes a while)
// It uses the same login details as the backend (backend/config.env).
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// use the libraries that are installed in the backend folder
const backendRequire = require("module").createRequire(path.join(__dirname, "..", "backend", "server.js"));
const mysql = backendRequire("mysql2/promise");
backendRequire("dotenv").config({ path: path.join(__dirname, "..", "backend", "config.env") });

const DATA = path.join(__dirname, "..", "etl_pipeline", "cleaned_json_data");
const FILE = path.join(DATA, "trips.json");
const BATCH = 5000;                          // trips sent to MySQL in one go
const LIMIT = Number(process.argv[2]) || Infinity;

const COLUMNS = [
  "trips_id", "vendor_id", "pickup_datetime", "dropoff_datetime", "passenger_count",
  "trip_distance_miles", "rate_code_id", "store_and_fwd_flag", "pu_location_id", "do_location_id",
  "Payment_type_id", "fare_amount", "extra", "mta_tax", "trip_amount", "tolls_amount",
  "improvement_surcharge", "congestion_surcharge", "total_amount", "trip_duration_min",
  "avg_speed_mph", "fare_per_mile", "pickup_day_of_Week", "is_weekend", "tip_pct",
  "pickup_hour", "is_rush_hour", "is_cross_borough"
];

// turns one trip from trips.json into one row for the table (same order as COLUMNS)
function toRow(t) {
  return [
    t.trip_id, t.vendor_id,
    t.pickup_datetime.replace("T", " "), t.dropoff_datetime.replace("T", " "),
    t.passenger_count, t.trip_distance_miles, t.rate_code_id, t.store_and_fwd_flag,
    t.pu_location_id, t.do_location_id, t.payment_type_id,
    t.fare_amount, t.extra, t.mta_tax,
    t.tip_amount,                              // the schema calls this column trip_amount
    t.tolls_amount, t.improvement_surcharge, t.congestion_surcharge, t.total_amount,
    t.trip_duration_min, t.avg_speed_mph,
    t.fare_per_mile == null ? 0 : t.fare_per_mile,  // the table does not allow empty values
    t.pickup_day_of_week, t.is_weekend ? 1 : 0,
    t.tip_pct == null ? 0 : t.tip_pct,
    t.pickup_hour, t.is_rush_hour ? 1 : 0, t.is_cross_borough ? 1 : 0
  ];
}

// loads one small table: reads a json file and inserts every row
async function loadSmallTable(db, file, table, columns, toRow) {
  const items = JSON.parse(fs.readFileSync(path.join(DATA, file)));
  await db.query("REPLACE INTO " + table + " (" + columns.join(", ") + ") VALUES ?", [items.map(toRow)]);
  console.log("Loaded " + items.length + " rows into " + table);
}

async function loadSmallTables(db) {
  await loadSmallTable(db, "zones.json", "zones",
    ["location_id", "borough", "zone", "service_zone"],
    (z) => [z.location_id, z.borough, z.zone, z.service_zone]);
  await loadSmallTable(db, "vendors.json", "vendors",
    ["vendor_id", "vendors_name"],
    (v) => [v.vendor_id, v.vendor_name]);
  await loadSmallTable(db, "payment_types.json", "Payment_type",
    ["Payment_type_id", "description"],
    (p) => [p.payment_type_id, p.description]);
  await loadSmallTable(db, "rate_codes.json", "rate_codes",
    ["rate_code_id", "description"],
    (r) => [r.rate_code_id, r.description]);
  await loadSmallTable(db, "zone_geometries.json", "zone_geometries",
    ["location_id", "centroid_lat", "centroid_lon", "area_sq_km", "geometry"],
    (g) => [g.location_id, g.centroid_lat, g.centroid_lon, g.area_sq_km, JSON.stringify(g.geometry)]);
  await db.commit();
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "urban_mobility"
  });
  // faster loading: skip the checks, and save to disk in bigger steps
  await db.query("SET foreign_key_checks = 0, unique_checks = 0, autocommit = 0");

  await loadSmallTables(db);

  const sql = "INSERT IGNORE INTO trips (" + COLUMNS.join(", ") + ") VALUES ?";
  let rows = [], read = 0, saved = 0, batches = 0;

  async function flush() {
    if (rows.length === 0) return;
    const [result] = await db.query(sql, [rows]);
    saved += result.affectedRows;
    batches++;
    if (batches % 10 === 0) await db.commit();   // save to disk every 10 batches
    console.log(read + " trips read, " + saved + " saved");
    rows = [];
  }

  const rl = readline.createInterface({ input: fs.createReadStream(FILE), crlfDelay: Infinity });
  for await (let line of rl) {
    line = line.trim();
    if (line === "[" || line === "]" || line === "") continue;   // skip the brackets
    if (line.endsWith(",")) line = line.slice(0, -1);            // remove the comma at the end
    rows.push(toRow(JSON.parse(line)));
    read++;
    if (rows.length >= BATCH) await flush();
    if (read >= LIMIT) break;
  }
  await flush();
  await db.commit();
  await db.end();
  console.log("Done. " + read + " trips read, " + saved + " new trips saved.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
