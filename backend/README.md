# Urban Mobility Data Explorer — Backend

This backend provides a REST API for exploring NYC yellow taxi data stored in MySQL. It returns trip records, taxi zones, map boundaries, and summary data for the frontend dashboard.

The backend uses Node.js and Express. Database queries are written directly inside the routers, following a simple structure.

## Technologies

- **Node.js:** runs the backend.
- **Express:** defines API routes and middleware.
- **MySQL:** stores trips and related data.
- **mysql2:** connects Node.js to MySQL using a connection pool.
- **Joi:** validates query parameters.
- **dotenv:** loads local configuration from `config.env`.
- **cors:** allows the frontend to make requests from another origin.
- **body-parser:** parses request bodies.

The separate database-loading script uses Python, `mysql-connector-python`, and `python-dotenv`.

## Folder Structure

```text
backend/
├── models/
│   └── database.js
├── routers/
│   ├── trips-router.js
│   ├── zones-router.js
│   └── insights-router.js
├── .gitignore
├── config.env.example
├── package.json
├── package-lock.json
├── README.md
└── server.js
```

`config.env` is included with the Aiven connection values; no edits are needed.

- `server.js` loads configuration, validates filters, mounts routers, and starts the server.
- `models/database.js` creates the MySQL connection pool.
- `trips-router.js` retrieves filtered, sorted, and paginated trips.
- `zones-router.js` retrieves zone information and GeoJSON boundaries.
- `insights-router.js` retrieves summary and chart data.

## Requirements

Before starting, install:

- Node.js 18 or newer and npm.
- MySQL Server.
- Python 3, if using the database-loading script.

MySQL must be running, and your MySQL account must have access to the `urban_mobility` database.

## Setup

Run the following steps from the project root unless stated otherwise.

### 1. Configure the Database Connection

`backend/config.env` is included in the repository with the Aiven connection values, so the app connects without any changes. Both the Node.js backend and Python database loader read this file.

> **Note:** `config.env` is committed only for easy setup. It will be added to `.gitignore` for production.

### 2. Create the Database Tables

For a fresh database:

1. Open MySQL Workbench and connect to MySQL.
2. Open `database/schema.sql`.
3. Execute the script.

The script creates `urban_mobility` and the following tables:

- `zones`
- `zone_geometries`
- `vendors`
- `Payment_type`
- `rate_codes`
- `trips`

The script is intended for initial setup. Its table-creation statements are not migrations for an existing database.

### 3. Prepare the Cleaned Data

The database loader reads JSON files from:

```text
etl_pipeline/cleaned_json_data/
```

Its current required files are:

```text
zones.json
zone_geometries.json
vendors.json
payment_types.json
rate_codes.json
```

See `../etl_pipeline/README.md` for instructions on preparing data through the ETL pipeline.

Large trip data is excluded from GitHub and must be prepared separately.

### 4. Install Python Dependencies and Load Data

```powershell
python -m pip install mysql-connector-python python-dotenv
python database/load_data.py
```

The current loader inserts or updates zones, geometries, vendors, payment types, and rate codes.

**It does not yet insert trip records.** Loading the `trips` table is still required for the trips and insights endpoints to return actual trip data.

### 5. Install Backend Dependencies

```powershell
cd backend
npm install
```

### 6. Start the Backend

Run this command from inside `backend/`:

```powershell
node server.js
```

Starting from this folder is important because the backend loads `config.env` relative to the working directory.

After a successful connection, the terminal displays:

```text
MYSQL Database is Connected Successfully!
Server is running on PORT 3000
```

The default API base URL is:

```text
http://localhost:3000/api
```

## API Endpoints

All implemented endpoints use GET requests.

| Endpoint | Purpose |
|---|---|
| `/api/trips` | Retrieve filtered, sorted, and paginated trips |
| `/api/zones` | Retrieve taxi zone names, boroughs, and service zones |
| `/api/zones/geojson` | Retrieve taxi zone boundaries as GeoJSON |
| `/api/insights` | Retrieve summary metrics and chart data |

### GET `/api/trips`

Returns trips with their pickup and drop-off zone names and boroughs.

Each trip includes:

- `trip_id`
- `pickup_datetime`
- `dropoff_datetime`
- `pu_location_id`
- `do_location_id`
- `pu_zone`
- `pu_borough`
- `do_zone`
- `do_borough`
- `trip_distance_miles`
- `trip_duration_min`
- `fare_amount`
- `total_amount`
- `avg_speed_mph`
- `fare_per_mile`

The database column `trips_id` is returned as `trip_id`.

Example request:

```text
http://localhost:3000/api/trips?page=1&limit=20
```

Example response when there are no matching trips:

```json
{
  "messages": "Trips are Retrieved!",
  "trips": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "total_pages": 0
  }
}
```

The current trips response uses `messages`, while the other response messages use `message`.

### GET `/api/zones`

Returns:

- `location_id`
- `borough`
- `zone`
- `service_zone`

Example request:

```text
http://localhost:3000/api/zones
```

Response structure:

```json
{
  "message": "Zones are Retrieved!",
  "zones": []
}
```

The array contains the available zone records.

### GET `/api/zones/geojson`

Returns a GeoJSON `FeatureCollection`.

Each feature contains the zone ID, zone name, borough, and geometry.

Example request:

```text
http://localhost:3000/api/zones/geojson
```

Response structure:

```json
{
  "type": "FeatureCollection",
  "features": []
}
```

Only zones with records in `zone_geometries` appear in this response. Zones without boundaries can still appear in `/api/zones`.

### GET `/api/insights`

Returns the following data:

| Response field | Contents |
|---|---|
| `summary` | Total trips, average fare, and average speed |
| `trips_by_hour` | Trip count for each represented pickup hour |
| `speed_by_hour` | Average trip speed for each represented pickup hour |
| `fare_by_borough` | Trip count and average per-trip fare per mile by pickup borough |

Example request:

```text
http://localhost:3000/api/insights?borough=Manhattan
```

Example response when there are no matching trips:

```json
{
  "message": "Insights are Retrieved!",
  "summary": {
    "total_trips": 0,
    "avg_fare": null,
    "avg_speed": null
  },
  "trips_by_hour": [],
  "speed_by_hour": [],
  "fare_by_borough": []
}
```

Insights are calculated across all matching trips, independently of the trip table's current page.

Average speed is the mean of the stored per-trip speeds. Fare per mile by borough is the mean of the stored per-trip fare-per-mile values.

Hours with no matching trips are omitted from the hourly arrays.

## Filtering

The following filters apply to `/api/trips` and `/api/insights`:

| Parameter | Meaning |
|---|---|
| `date_from` | Earliest pickup date |
| `date_to` | Latest pickup date, including that entire day |
| `borough` | Pickup borough |
| `min_fare` | Minimum base fare |
| `max_fare` | Maximum base fare |
| `min_distance` | Minimum trip distance in miles |
| `max_distance` | Maximum trip distance in miles |

Use dates in `YYYY-MM-DD` format.

Fare filters use `fare_amount`, not the total amount paid. Money is expressed in US dollars, distance in miles, duration in minutes, and speed in miles per hour.

Examples:

```text
/api/trips?borough=Manhattan&min_fare=10&max_fare=50
```

```text
/api/trips?min_distance=2&max_distance=10
```

```text
/api/insights?date_from=2019-01-01&date_to=2019-01-31
```

Joi validates supported parameters and numeric limits. The middleware rejects ranges where the minimum exceeds the maximum.

Date parameters are currently validated as strings rather than strictly checked calendar dates.

## Pagination and Sorting

Pagination and sorting affect `/api/trips`.

| Parameter | Default | Accepted values |
|---|---|---|
| `page` | `1` | Integer from 1 to 200 |
| `limit` | `50` | Integer from 1 to 200 |
| `sort` | `pickup_datetime` | One of the columns below |
| `order` | `DESC` | `ASC` or `DESC`, case-insensitive |

Supported sort columns:

```text
pickup_datetime
pu_zone
do_zone
trip_distance_miles
trip_duration_min
fare_amount
```

Example:

```text
/api/trips?page=2&limit=20&sort=fare_amount&order=desc
```

A trip ID is used as a secondary sort key to make ordering consistent.

The pagination response reports the total matching records and total pages. The current validation limits requests to the first 200 pages.

## Database Queries

Request filter values are passed through SQL placeholders.

Sorting uses an allowlist of column names and directions rather than accepting arbitrary SQL.

Pickup and drop-off zone information is retrieved through joins between `trips` and `zones`.

The connection pool supports up to ten connections. Dates are returned as strings, and decimal measurements are returned as numbers.

## Error Responses

| Status | Current use |
|---|---|
| `200` | Successful request, including empty results |
| `400` | Invalid parameters, invalid ranges, or an unknown API route |
| `500` | A database or request-processing failure |

Errors return a JSON `message`. Database error details are logged in the backend terminal.

## Checking the API

With the backend running, open these URLs in a browser or use Postman:

```text
http://localhost:3000/api/zones
http://localhost:3000/api/zones/geojson
http://localhost:3000/api/trips?page=1&limit=20
http://localhost:3000/api/insights
```

You can also use PowerShell:

```powershell
Invoke-RestMethod "http://localhost:3000/api/zones"
```

Check the stored data in MySQL:

```sql
USE urban_mobility;

SELECT COUNT(*) AS zones_loaded FROM zones;
SELECT COUNT(*) AS geometries_loaded FROM zone_geometries;
SELECT COUNT(*) AS trips_loaded FROM trips;
```

An empty trips response does not necessarily mean the API is broken. Check whether the trips table contains data and whether the selected filters match it.

## Frontend Integration

The frontend should use:

- `/api/trips` for the table.
- `/api/insights` for summary cards and supported charts.
- `/api/zones/geojson` for map boundaries.
- `/api/zones` for zone information.

Send the same filters to trips and insights so the table and summaries represent the same selection.

Do not calculate whole-dataset summaries from a single page of `/api/trips`.

The current backend does not serve the frontend's HTML files. Run the frontend separately using its setup instructions.

The current frontend still reads local sample JSON. Connecting it to these API endpoints remains pending.

## Troubleshooting

### Database connection fails

Check that MySQL is running and that `config.env` contains the correct host, port, username, password, and database name.

### Python reports `KeyError: DB_USER` or `KeyError: DB_PASSWORD`

Confirm that `backend/config.env` exists and contains both variables. The Python loader reads this file using `python-dotenv`.

### A Python dependency is missing

Run:

```powershell
python -m pip install mysql-connector-python python-dotenv
```

### A Node.js dependency is missing

Run `npm install` from inside `backend/`.

### MySQL reports an unknown column

Check that your existing database matches `database/schema.sql`. Updating the SQL file does not automatically change previously created tables.

The zones router expects `service_zone`.

### Port 3000 is already in use

Stop the other server or choose another `PORT` in `config.env`, then restart the backend.

### The trips table or charts have no data

Check the number of records in `trips`. The current Python loader does not populate that table.

## Current Limitations

- Loading trips into MySQL is still pending.
- The frontend is not yet connected to the API.
- The API currently supplies three summary metrics and three chart datasets, while the frontend has additional cards and a busiest-zones chart.
- No custom algorithm endpoint is implemented yet.
- The trips schema still declares `tip_pct` as non-nullable, although the ETL produces null values for non-credit-card trips. This needs to be reconciled before loading those records.
- The backend has no implemented automated test suite.

## Backend Contribution

Backend engineer: **Josue Nsengiyumva**