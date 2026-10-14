// insights.js - reads the cleaned trips and computes the numbers for the report.
// Run from the main project folder:  node analysis/insights.js
const fs = require("fs");
const readline = require("readline");

const DATA = "etl_pipeline/cleaned_json_data/";

// zone id -> name and borough
const zones = {};
for (const z of JSON.parse(fs.readFileSync(DATA + "zones.json"))) {
  zones[z.location_id] = { zone: z.zone, borough: z.borough };
}
function zoneOf(id) {
  return zones[id] || { zone: "Unknown", borough: "Unknown" };
}

// running totals
let total = 0, sumFare = 0, sumDist = 0, sumDur = 0, sumSpeed = 0;
let airport = 0, cross = 0;
const byHour = Array.from({ length: 24 }, () => ({ n: 0, speed: 0 }));
const byBorough = {};
const pickupZones = {};

const rl = readline.createInterface({ input: fs.createReadStream(DATA + "trips.json") });

rl.on("line", (line) => {
  line = line.trim();
  if (line === "[" || line === "]" || line === "") return; // skip the brackets
  if (line.endsWith(",")) line = line.slice(0, -1);        // remove the comma at the end
  const t = JSON.parse(line);
  const pu = zoneOf(t.pu_location_id);
  const dof = zoneOf(t.do_location_id);

  total++;
  sumFare += t.fare_amount;
  sumDist += t.trip_distance_miles;
  sumDur += t.trip_duration_min;
  sumSpeed += t.avg_speed_mph;
  if (t.is_cross_borough) cross++;
  if (/airport/i.test(pu.zone) || /airport/i.test(dof.zone)) airport++;

  byHour[t.pickup_hour].n++;
  byHour[t.pickup_hour].speed += t.avg_speed_mph;

  if (t.fare_per_mile !== null && t.fare_per_mile !== undefined) {
    if (!byBorough[pu.borough]) byBorough[pu.borough] = { n: 0, fpm: 0 };
    byBorough[pu.borough].n++;
    byBorough[pu.borough].fpm += t.fare_per_mile;
  }
  pickupZones[pu.zone] = (pickupZones[pu.zone] || 0) + 1;
});

rl.on("close", () => {
  const r2 = (x) => Math.round(x * 100) / 100;
  const result = {
    summary: {
      total_trips: total,
      avg_fare: r2(sumFare / total),
      avg_distance_miles: r2(sumDist / total),
      avg_duration_min: r2(sumDur / total),
      avg_speed_mph: r2(sumSpeed / total),
      airport_trips: airport,
      cross_borough_trips: cross
    },
    trips_by_hour: byHour.map((h, i) => ({ hour: i, trips: h.n })),
    speed_by_hour: byHour.map((h, i) => ({ hour: i, avg_speed_mph: h.n ? r2(h.speed / h.n) : 0 })),
    fare_per_mile_by_borough: Object.entries(byBorough)
      .map(([b, v]) => ({ borough: b, trips: v.n, avg_fare_per_mile: r2(v.fpm / v.n) }))
      .sort((a, b) => b.trips - a.trips),
    top_pickup_zones: Object.entries(pickupZones)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([zone, trips]) => ({ zone, trips }))
  };
  fs.writeFileSync("analysis/insights.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
});
