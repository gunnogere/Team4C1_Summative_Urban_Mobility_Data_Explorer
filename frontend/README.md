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

zone_geometries.json - the shapes of the taxi zones, used to draw the map.
zones.json - zone names and boroughs, used for the map tooltips.
sample-trips.json - 8 made up trios used only to test the layout (not real data)

## Where the data comes from 

The data flows like this: raw NYC taxi files go through our ETL pipeline into MySQL, then the Express Backend API serves it, and this dashboard reads it.

The dashoard reads trips from the DATA_URl line at the top of script.js. That line points to sample-trips.json while testing, and to the backend API (http://localhost:3000/api/trips) when the backend is running.

Backend endpoints used:

- Get /api/trips - trips, with page, limit, sort and filter options 
- Get /api/zones - the taxi zones 
-Get /api/insight - summary numbers and chart data

## Team 
 Frontend: Didier Abizera ( Team4 C1)


