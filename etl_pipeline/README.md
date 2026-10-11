# ETL Pipeline

Task: ETL - Data Engineer
Author: Joshua Gunnogere Mulongo
GitHub Username: @gunnogere
School email: j.mulongo@alustudent.com
Team: Team4C1

Task sheet: https://docs.google.com/spreadsheets/d/1WCFntWARypndTvvnE96RubS0UG_TBQ_wbSkPMJvA4II/edit?gid=0#gid=0

Team Planning Doc: https://docs.google.com/document/d/1jQuOwPN_1ZjwMtXqNTbaHISczCsolq53KYHSFq-uKns/edit?tab=t.0

This folder cleans the raw NYC Yellow Taxi data and saves it as JSON files, one file per database table.

**ETL** means:
- **Extract**: read the raw files in `raw_data/`.
- **Transform**: clean, validate and add new columns.
- **Load**: write the result to `cleaned_json_data/` (ready to be loaded into a database).

## 1. Requirements

| Tool | Version | Check with |
|---|---|---|
| Node.js | 18 or newer (we used 24) | `node -v` |
| npm | comes with Node.js | `npm -v` |
| Free RAM | about 4 GB | |
| Free disk space | about 6 GB (the output is large) | |

Install Node.js from https://nodejs.org if `node -v` fails.


## 2. Get the project and the raw data

```bash
git clone https://github.com/gunnogere/Team4C1_Summative_Urban_Mobility_Data_Explorer
cd Team4C1_Summative_Urban_Mobility_Data_Explorer/etl_pipeline
```

The big CSV files are not stored in git (GitHub has a 100 MB file limit), so download them from the
[NYC TLC Trip Record page](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page) and put them
in `raw_data/` like this:

```
raw_data/
  yellow_tripdata_2019-01.csv
  taxi_zone_lookup.csv
  taxi_zones/
    taxi_zones.shp
    taxi_zones.dbf
    taxi_zones.prj
    taxi_zones.shx
```

If you only have `taxi_zones.zip`, unzip it into the `taxi_zones/` folder:

```bash
unzip raw_data/taxi_zones.zip -d raw_data/taxi_zones
```

(If the zip creates an extra subfolder, move the files up so the paths above are correct.)

Note: our trip file is a **CSV**, not parquet, so the pipeline reads CSV.

## 3. Install dependencies

Run this once, inside `etl_pipeline/`:

```bash
npm install
```

This installs two packages listed in `package.json`:
- `shapefile` reads the zone map files (`.shp` / `.dbf`).
- `proj4` converts the map coordinates to normal latitude/longitude.

If `node_modules/` is missing or something looks broken, reinstall:

```bash
rm -rf node_modules
npm install
```

## 4. Run the ETL

```bash
npm run etl
```

This runs `node --max-old-space-size=4096 src/etl.js` (the flag gives Node 4 GB of memory so it does not
run out). It takes about 2 minutes and prints progress every 1,000,000 rows, then a summary.

### Re-running

Just run `npm run etl` again. The output files are overwritten, so it is safe to repeat. Re-run it
whenever you change the cleaning rules in `src/etl.js` or replace the raw data.

### Check that it worked

```bash
ls -lh cleaned_json_data
head -c 600 cleaned_json_data/trips.json
```

You should see 6 `.json` files. `docs/Exclusion_Log.csv` and `docs/Exclusion_Summary.json` are also updated.

### Common problems

| Problem | Fix |
|---|---|
| `ENOENT ... raw_data/...` | A raw file is missing or in the wrong folder. Check section 2. |
| `Cannot find package 'shapefile'` | Run `npm install` first. |
| `JavaScript heap out of memory` | Use `npm run etl` (not plain `node`), and close other programs. |
| `ENOSPC` | Not enough disk space. Free up about 6 GB. |

## 5. What we did (steps)

1. **Load the zone lookup** (`taxi_zone_lookup.csv`) and turn `N/A` values into `null`.
2. **Load the zone map** (`taxi_zones` shapefile). Convert the coordinates to WGS84 (latitude/longitude), and
   calculate each zone's centre point and area. Zones with several polygons are saved as a MultiPolygon.
3. **Read the trips file line by line** (streaming), so the 687 MB file never has to fit in memory at once.
4. **Check every trip** against the cleaning rules below. Bad trips are written to the exclusion log.
5. **Add derived features** to the good trips.
6. **Write the JSON files** and the summary.

## 6. Output files (`cleaned_json_data/`)

Each file is a JSON array with one record per line. Each file maps to one database table.

| File | Table | Key |
|---|---|---|
| `trips.json` | trips (fact table, about 7.59 million rows, about 4.5 GB) | `trip_id` (source row number) |
| `zones.json` | zones | `location_id` |
| `zone_geometries.json` | zone_geometries (GeoJSON, centroid, area) | `location_id` (links to zones) |
| `vendors.json` | vendors | `vendor_id` |
| `rate_codes.json` | rate_codes | `rate_code_id` |
| `payment_types.json` | payment_types | `payment_type_id` |

`trips.pu_location_id` and `trips.do_location_id` link to `zones.location_id`.

Logs:
- `docs/Exclusion_Log.csv`: every excluded, corrected or flagged record, with the reason and the raw line.
- `docs/Exclusion_Summary.json`: the count for each reason.

## 7. Why we stage to JSON before loading into the database

We do not write straight from the raw CSV into the database. The JSON files are a middle step ("staging") because:

- **Safe and repeatable**: if the database load fails, we reload the JSON. We do not repeat the 2-minute cleaning.
- **Separation**: cleaning bugs and database bugs are found separately.
- **Easy to inspect**: we can open the files, check them and share them with the team without a running database.
- **Not tied to one database**: the same files can be loaded into MySQL, PostgreSQL, SQLite or MongoDB.
- **Right shape**: one file per table, with fixed column names and types, so the load step is simple.
- **Spatial data fits**: polygons are naturally GeoJSON, which JSON stores without any conversion.

## 8. Cleaning rules

**Excluded** (row is removed and logged):
- malformed rows, invalid timestamps, missing required fields
- unknown vendor, payment type or location ID
- negative or zero fares, fare over $500, total over $1,000
- distance of 0 or less, or over 100 miles
- pickup outside January 2019
- duration under 30 seconds, 0 or less, or over 24 hours
- average speed over 100 mph
- exact duplicate rows (none were found)

**Corrected** (value set to `null`, trip kept, logged):
- `passenger_count` outside 1-6
- invalid `RatecodeID`
- invalid `store_and_fwd_flag`

Blank charge columns become `0` (`congestion_surcharge` did not exist in January 2019).

**Flagged** (kept, logged):
- unknown zones 264 and 265
- `total_amount` that differs from the sum of its parts by more than $1

**Standard formats**:
- Timestamps are ISO 8601, NYC local time, e.g. `2019-01-01T00:46:40`.
- Money is rounded to 2 decimals.
- IDs are integers.
- Yes/no values are `true` / `false`.

**Known gap**: zones 57, 104, 105, 264 and 265 have no polygon in the shapefile, so they only appear in `zones.json`.

Results from our run (7,667,792 rows read): **7,590,347 kept, 77,445 excluded**.

## 9. Derived features

| Feature | Formula | Why it is useful |
|---|---|---|
| `trip_duration_min` | dropoff time - pickup time | How long trips take. |
| `avg_speed_mph` | distance / duration in hours | A traffic and congestion measure. Also catches impossible trips. |
| `fare_per_mile` | `fare_amount` / distance | Compares price between routes and times. |
| `tip_pct` | `tip_amount` / `fare_amount` x 100 (card payments only) | Passenger behaviour. Cash tips are not recorded, so cash trips are `null`. |
| `pickup_hour`, `pickup_day_of_week` (0 = Sunday), `is_weekend` | from pickup time | Demand by time of day and week. |
| `is_rush_hour` | weekday, 07:00-09:59 or 16:00-19:59 | Compares peak and off-peak trips. |
| `is_cross_borough` | pickup borough differs from dropoff borough | Separates local trips from trips between boroughs. |

## 10. Project layout

```
etl_pipeline/
  package.json          dependencies and the "etl" command
  src/etl.js            the whole pipeline
  raw_data/             input files (not in git)
  cleaned_json_data/    output files (trips.json is not in git)
```

Duplicate detection uses a hash of each raw line, so a collision is theoretically possible but extremely unlikely.
