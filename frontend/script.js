// where the backend API lives
const API_URL = "http://localhost:3000/api";
// how many trips the table shows at once (the API allows at most 200)
const TABLE_LIMIT = 200;

// loads the data from the API and fills the page
async function init() {
    renderMap();
    renderZones();
    await refresh();
    setupSorting();
    document.getElementById("apply-btn").addEventListener("click", applyFilters);
    document.getElementById("reset-btn").addEventListener("click", resetFilters);
    document.getElementById("close-detail").addEventListener("click", function () {
        document.getElementById("trip-detail").close();
    });
}

// asks the API for one endpoint and returns its JSON
async function getJson(path) {
    const response = await fetch(API_URL + path);
    if (!response.ok) {
        throw new Error("the API answered " + response.status + " for " + path);
    }
    return response.json();
}

// reads the filter boxes into a query string for the API
function filterQuery() {
    const fields = {
        date_from: "date-from",
        date_to: "date-to",
        borough: "borough",
        min_fare: "min-fare",
        max_fare: "max-fare",
        min_distance: "min-distance",
        max_distance: "max-distance"
    };
    const params = new URLSearchParams();
    for (const name of Object.keys(fields)) {
        const value = document.getElementById(fields[name]).value;
        if (value !== "") {
            params.set(name, value);
        }
    }
    return params;
}

// gets the insights and the trips for the current filters and redraws the page
async function refresh() {
    const params = filterQuery();
    const tripParams = new URLSearchParams(params);
    tripParams.set("limit", TABLE_LIMIT);
    tripParams.set("sort", sortField);
    tripParams.set("order", sortAscending ? "ASC" : "DESC");

    try {
        const [insights, trips] = await Promise.all([
            getJson("/insights?" + params),
            getJson("/trips?" + tripParams)
        ]);
        renderSummary(insights.summary);
        renderTable(trips.trips.map(normalizeTrip));
        renderHourChart(insights.trips_by_hour);
        renderSpeedChart(insights.speed_by_hour);
        renderFareChart(insights.fare_by_borough);
        renderZonesChart(insights.top_pickup_zones);
    } catch (error) {
        console.error(error);
        alert("Could not load data from the API. Is the backend running?");
    }
}

// fills the seven cards at the top
function renderSummary(summary) {
    document.getElementById("total-trips").textContent = summary.total_trips.toLocaleString();
    document.getElementById("avg-fare").textContent = "$" + Number(summary.avg_fare || 0).toFixed(2);
    document.getElementById("avg-distance").textContent = Number(summary.avg_distance || 0).toFixed(1) + " mi";
    document.getElementById("avg-duration").textContent = Math.round(summary.avg_duration || 0) + " min";
    document.getElementById("avg-speed").textContent = Number(summary.avg_speed || 0).toFixed(1) + " mph";
    document.getElementById("airport-trips").textContent = summary.airport_trips.toLocaleString();
    document.getElementById("cross-borough").textContent = summary.cross_borough.toLocaleString();
}

// draws one table row for every trip, clicking a row opens its details
function renderTable(trips) {
    const body = document.getElementById("trips-body");
    body.innerHTML = "";

    for (const trip of trips) {
        const row = document.createElement("tr");
        row.innerHTML =
            "<td>" + trip.pickup_datetime + "</td>" +
            "<td>" + trip.pu_zone + "</td>" +
            "<td>" + trip.do_zone + "</td>" +
            "<td>" + trip.trip_distance_miles + "</td>" +
            "<td>" + trip.trip_duration_min + "</td>" +
            "<td>" + trip.fare_amount.toFixed(2) + "</td>";
        row.addEventListener("click", function () {
            showTripDetails(trip);
        });
        body.appendChild(row);
    }
}

// opens the pop-up with all the details of one trip
function showTripDetails(trip) {
    const content = document.getElementById("detail-content");
    content.innerHTML =
        "<p><strong>Pickup:</strong> " + trip.pickup_datetime + "</p>" +
        "<p><strong>From:</strong> " + trip.pu_zone + " (" + trip.pu_borough + ")</p>" +
        "<p><strong>To:</strong> " + trip.do_zone + " (" + trip.do_borough + ")</p>" +
        "<p><strong>Distance:</strong> " + trip.trip_distance_miles + " miles</p>" +
        "<p><strong>Duration:</strong> " + trip.trip_duration_min + " minutes</p>" +
        "<p><strong>Average speed:</strong> " + trip.avg_speed_mph + " mph</p>" +
        "<p><strong>Fare:</strong> $" + trip.fare_amount.toFixed(2) + "</p>";

    document.getElementById("trip-detail").showModal();
}

// keeps each chart so we can remove the old one before drawing a new one
let charts = {};

function drawChart(id, config) {
    if (charts[id]) {
        charts[id].destroy();
    }
    charts[id] = new Chart(document.getElementById(id), config);
}

// the labels under the chart: 00:00, 01:00 ... 23:00
const hourLabels = [];
for (let hour = 0; hour < 24; hour++) {
    hourLabels.push(String(hour).padStart(2, "0") + ":00");
}

// puts the API's per-hour rows into 24 slots, 0 for hours without trips
function byHour(rows, field) {
    const values = new Array(24).fill(0);
    for (const row of rows) {
        values[row.pickup_hour] = row[field];
    }
    return values;
}

// bar chart: how many trips in each hour
function renderHourChart(rows) {
    drawChart("hour-chart", {
        type: "bar",
        data: {
            labels: hourLabels,
            datasets: [{
                label: "Trips",
                data: byHour(rows, "trip_count"),
                backgroundColor: "#5ea597"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

// line chart: how fast the taxis go in each hour
function renderSpeedChart(rows) {
    drawChart("speed-chart", {
        type: "line",
        data: {
            labels: hourLabels,
            datasets: [{
                label: "Average speed (mph)",
                data: byHour(rows, "avg_speed_mph"),
                borderColor: "#d4452a",
                backgroundColor: "#d4452a",
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

// bar chart: dollars per mile in each borough
function renderFareChart(rows) {
    drawChart("fare-chart", {
        type: "bar",
        data: {
            labels: rows.map(function (row) { return row.borough; }),
            datasets: [{
                label: "Fare per mile ($)",
                data: rows.map(function (row) { return row.avg_fare_per_mile; }),
                backgroundColor: "#16535a"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

// horizontal bars: the busiest places to be picked up
function renderZonesChart(rows) {
    drawChart("zones-chart", {
        type: "bar",
        data: {
            labels: rows.map(function (row) { return row.zone; }),
            datasets: [{
                label: "Trips",
                data: rows.map(function (row) { return row.trip_count; }),
                backgroundColor: "#d4452a"
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

// the map object, we keep it so we can add the zones to it
let map;

// draws the base map of New York with street tiles
function renderMap() {
    // the map can't be dragged or zoomed out beyond the New York area
    map = L.map("map", {
        minZoom: 10,
        maxBounds: [[40.45, -74.35], [40.98, -73.60]],
        maxBoundsViscosity: 1.0
    }).setView([40.72, -73.93], 11);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
}

// draws every taxi zone on the map as a coloured shape
async function renderZones() {
    let features;
    try {
        const geojson = await getJson("/zones/geojson");
        features = geojson.features.map(function (feature) {
            const p = feature.properties;
            return {
                type: "Feature",
                properties: {
                    location_id: p.location_id,
                    name: p.zone || "Zone " + p.location_id,
                    borough: p.borough || ""
                },
                geometry: feature.geometry
            };
        });
    } catch (error) {
        console.error(error);
        return;
    }

    const zoneLayer = L.geoJSON(features, {
        style: {
            color: "#16535a",
            weight: 1,
            fillColor: "#5ea597",
            fillOpacity: 0.5
        },
        // show the zone name when the mouse is over it
        onEachFeature: function (feature, layer) {
            const p = feature.properties;
            const label = p.borough ? p.name + " (" + p.borough + ")" : p.name;
            layer.bindTooltip(label, { sticky: true });
        }
    }).addTo(map);

    const bounds = zoneLayer.getBounds();

    // fit the whole city into the map
    map.fitBounds(bounds, { padding: [10, 10] });

    // dashed outline drawn around the whole city
    L.rectangle(bounds.pad(0.03), {
        color: "#d4452a",
        weight: 2,
        dashArray: "8 6",
        fill: false,
        interactive: false
    }).addTo(map);

    // people can move and zoom out a little, but not leave the city
    map.setMinZoom(map.getBoundsZoom(bounds) - 1);
    map.setMaxBounds(bounds.pad(0.4));
}

// the column the table is sorted by, and the direction
let sortField = "pickup_datetime";
let sortAscending = true;

// sorts the table by one column (the API does the sorting)
async function sortTable(field) {
    // clicking the same column again flips the direction
    if (sortField === field) {
        sortAscending = !sortAscending;
    } else {
        sortField = field;
        sortAscending = true;
    }

    await refresh();
}

// makes every table heading clickable
function setupSorting() {
    const headings = document.querySelectorAll("#trips-table th");
    headings.forEach(function (heading) {
        heading.addEventListener("click", function () {
            sortTable(heading.dataset.sort);
        });
    });
}

// reads the filter boxes and asks the API for the matching data
function applyFilters() {
    const dateFrom = document.getElementById("date-from").value;
    const dateTo = document.getElementById("date-to").value;

    // the From date must not be after the To date
    if (dateFrom && dateTo && dateFrom > dateTo) {
        alert("The From date must be before the To date.");
        return;
    }

    refresh();
}

// clears every filter box and shows all the trips again
function resetFilters() {
    const ids = ["date-from", "date-to", "borough", "min-fare", "max-fare", "min-distance", "max-distance"];
    for (const id of ids) {
        document.getElementById(id).value = "";
    }
    applyFilters();
}

init();

// three-bar menu: open and close it, and close it after a link is picked
const menuBtn = document.getElementById("menu-btn");
const menuBox = document.getElementById("menu");
menuBtn.addEventListener("click", function () {
    const opening = menuBox.hidden;
    menuBox.hidden = !opening;
    menuBtn.setAttribute("aria-expanded", String(opening));
});
menuBox.addEventListener("click", function (event) {
    if (event.target.tagName === "A") {
        menuBox.hidden = true;
        menuBtn.setAttribute("aria-expanded", "false");
    }
});


// makes sure every trip has the fields the dashboard uses
function normalizeTrip(trip) {
    // some real trips have no zone or borough name, so use "Unknown" instead of null
    for (const key of ["pu_zone", "pu_borough", "do_zone", "do_borough"]) {
        if (trip[key] === null || trip[key] === undefined || trip[key] === "null") {
            trip[key] = "Unknown";
        }
    }
    if (trip.pickup_hour === undefined && trip.pickup_datetime) {
        trip.pickup_hour = Number(String(trip.pickup_datetime).slice(11, 13));
    }
    return trip;
}

