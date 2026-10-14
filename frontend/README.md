# Urban Mobility Data Explorer - Frontend

The dashboard for Team 4C1'S Urban Mobility Data EXplorer. It shows patterns in New York City yellow taxi trips: summary numbers, charts, a map of the taxi zones and a table of individual trips.

Built with plain HTML, CSS and JavaScript. Charts use Chart.js and the map uses Leaflet.

## What you can do on the page 

a) See seven summary numbers: trips, average fare, distance, duration, speed, airport trips and cross-borough trips.

b) Read four charts: trips by hour, average speed by hour, fare per mile by borough, and busiest pickup zones.

c) Filter trips by date range, pickup borough, distance and fare , then reset the filters.

d) Explore the taxi zones map and hover a zone to see its name.

e) Jump to any section with the three-bar menu in the top-right corner.

f) Use it on a phone; the layout shrinks to one column.

## How to run it 

The page loads data files, so it needs a small local web server. Opening index.html by double clicking will not work.

1. Open a terminal in the project's main folder (not inside frontend).
2. Start the server with: Python3 http.server 8001
3. Open this address in the browser:
   http://localhost:8001/frontend/

The page also loads Charts.js, Leaflet, map tiles and fonts from the internet, so it needs a connection.

## Folder contents

index.html - the page structure.
style.css - the look and the phone layout. 
script.js - loads the data, and handles filters, sorting and the menu.

zone_geometries.json - the shapes of the taxi zones (no longer loaded; the map uses /api/zones/geojson).
zones.json - zone names and boroughs (no longer loaded).

## Where the data comes from 

The data flows like this: raw NYC taxi files go through our ETL pipeline into MySQL, then the Express Backend API serves it, and this dashboard reads it.

The dashboard reads everything from the backend API at the API_URL line at the top of script.js (http://localhost:3000/api). The backend must be running; there is no file fallback. Filters and table sorting are done by the API.

Backend endpoints used:

- GET /api/trips - the table, with limit, sort, order and filter options
- GET /api/zones/geojson - the zone shapes and names for the map
- GET /api/insights - summary cards and chart data, with the same filters

## Team 
 Frontend: Didier Abizera ( Team4 C1)


