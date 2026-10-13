// where the trips come from, later this changes to Josue's API
const DATA_URL = "sample-trips.json";

// all the trips we loaded
let allTrips = [];

// the trips that are shown right now (after filters)
let shownTrips = [];

// loads the trips and fills the page
async function init() {
    renderMap();
    renderZones();
    const response = await fetch(DATA_URL);
    allTrips = await response.json();
    shownTrips = allTrips;
    renderAll(allTrips);
    setupSorting();
    document.getElementById("apply-btn").addEventListener("click", applyFilters);
    document.getElementById("reset-btn").addEventListener("click", resetFilters);
    document.getElementById("close-detail").addEventListener("click", function () {
        document.getElementById("trip-detail").close();
    });
}

// draws the cards, the table and all four charts for a list of trips
function renderAll(trips) {
    renderSummary(trips);
    renderTable(trips);
    renderHourChart(trips);
    renderSpeedChart(trips);
    renderFareChart(trips);
    renderZonesChart(trips);
}

// average of one column, 0 if there are no trips
function average(trips, field) {
    if (trips.length === 0) {
        return 0;
    }
    let sum = 0;
    for (const trip of trips) {
        sum += trip[field];
    }
    return sum / trips.length;
}

// fills the seven cards at the top
function renderSummary(trips) {
    const airportTrips = trips.filter(function (trip) {
        return trip.pu_zone.includes("Airport") || trip.do_zone.includes("Airport");
    });
    const crossBorough = trips.filter(function (trip) {
        return trip.pu_borough !== trip.do_borough;
    });

    document.getElementById("total-trips").textContent = trips.length.toLocaleString();
    document.getElementById("avg-fare").textContent = "$" + average(trips, "fare_amount").toFixed(2);
    document.getElementById("avg-distance").textContent = average(trips, "trip_distance_miles").toFixed(1) + " mi";
    document.getElementById("avg-duration").textContent = Math.round(average(trips, "trip_duration_min")) + " min";
    document.getElementById("avg-speed").textContent = average(trips, "avg_speed_mph").toFixed(1) + " mph";
    document.getElementById("airport-trips").textContent = airportTrips.length;
    document.getElementById("cross-borough").textContent = crossBorough.length;
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

// counts the trips that started in each hour of the day
function tripsByHour(trips) {
    const counts = new Array(24).fill(0);
    for (const trip of trips) {
        counts[trip.pickup_hour] += 1;
    }
    return counts;
}

// average speed for each hour, 0 when there are no trips in that hour
function speedByHour(trips) {
    const sums = new Array(24).fill(0);
    const counts = new Array(24).fill(0);
    for (const trip of trips) {
        sums[trip.pickup_hour] += trip.avg_speed_mph;
        counts[trip.pickup_hour] += 1;
    }
    return sums.map(function (sum, hour) {
        if (counts[hour] === 0) {
            return 0;
        }
        return Math.round((sum / counts[hour]) * 10) / 10;
    });
}

// average fare per mile for each pickup borough
function farePerMileByBorough(trips) {
    const fares = {};
    const miles = {};
    for (const trip of trips) {
        const borough = trip.pu_borough;
        fares[borough] = (fares[borough] || 0) + trip.fare_amount;
        miles[borough] = (miles[borough] || 0) + trip.trip_distance_miles;
    }
    const names = Object.keys(fares);
    const values = names.map(function (name) {
        return Math.round((fares[name] / miles[name]) * 100) / 100;
    });
    return { names: names, values: values };
}

// the five pickup zones with the most trips
function topPickupZones(trips) {
    const counts = {};
    for (const trip of trips) {
        counts[trip.pu_zone] = (counts[trip.pu_zone] || 0) + 1;
    }
    const sorted = Object.keys(counts).sort(function (a, b) {
        return counts[b] - counts[a];
    });
    const top = sorted.slice(0, 5);
    return {
        names: top,
        values: top.map(function (name) { return counts[name]; })
    };
}

// bar chart: how many trips in each hour
function renderHourChart(trips) {
    drawChart("hour-chart", {
        type: "bar",
        data: {
            labels: hourLabels,
            datasets: [{
                label: "Trips",
                data: tripsByHour(trips),
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
function renderSpeedChart(trips) {
    drawChart("speed-chart", {
        type: "line",
        data: {
            labels: hourLabels,
            datasets: [{
                label: "Average speed (mph)",
                data: speedByHour(trips),
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
function renderFareChart(trips) {
    const result = farePerMileByBorough(trips);
    drawChart("fare-chart", {
        type: "bar",
        data: {
            labels: result.names,
            datasets: [{
                label: "Fare per mile ($)",
                data: result.values,
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
function renderZonesChart(trips) {
    const result = topPickupZones(trips);
    drawChart("zones-chart", {
        type: "bar",
        data: {
            labels: result.names,
            datasets: [{
                label: "Trips",
                data: result.values,
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
    const geoResponse = await fetch("zone_geometries.json");
    const zones = await geoResponse.json();

    // the zone names live in another file, so we load that one too
    const nameResponse = await fetch("zones.json");
    const names = await nameResponse.json();

    // so we can find a zone's name by its id
    const nameById = {};
    for (const n of names) {
        nameById[n.location_id] = n;
    }

    // Leaflet wants "features", so we wrap each zone in that shape
    const features = zones.map(function (zone) {
        const info = nameById[zone.location_id] || {};
        return {
            type: "Feature",
            properties: {
                location_id: zone.location_id,
                name: info.zone || info.service_zone || "Zone " + zone.location_id,
                borough: info.borough || ""
            },
            geometry: zone.geometry
        };
    });

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

// sorts the shown trips by one column and redraws the table
function sortTable(field) {
    // clicking the same column again flips the direction
    if (sortField === field) {
        sortAscending = !sortAscending;
    } else {
        sortField = field;
        sortAscending = true;
    }

    shownTrips.sort(function (a, b) {
        let result;
        if (typeof a[field] === "number") {
            result = a[field] - b[field];
        } else {
            result = String(a[field]).localeCompare(String(b[field]));
        }
        return sortAscending ? result : -result;
    });

    renderTable(shownTrips);
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

// reads the filter boxes and shows only the trips that match
function applyFilters() {
    const dateFrom = document.getElementById("date-from").value;
    const dateTo = document.getElementById("date-to").value;
    const borough = document.getElementById("borough").value;
    const minFare = document.getElementById("min-fare").value;
    const maxFare = document.getElementById("max-fare").value;
    const minDistance = document.getElementById("min-distance").value;
    const maxDistance = document.getElementById("max-distance").value;

    // the From date must not be after the To date
    if (dateFrom && dateTo && dateFrom > dateTo) {
        alert("The From date must be before the To date.");
        return;
    }

    const filtered = allTrips.filter(function (trip) {
        // the first 10 characters of the time are the day, like 2025-01-15
        const day = trip.pickup_datetime.slice(0, 10);

        if (dateFrom && day < dateFrom) {
            return false;
        }
        if (dateTo && day > dateTo) {
            return false;
        }
        if (borough && trip.pu_borough !== borough) {
            return false;
        }
        if (minFare !== "" && trip.fare_amount < Number(minFare)) {
            return false;
        }
        if (maxFare !== "" && trip.fare_amount > Number(maxFare)) {
            return false;
        }
        if (minDistance !== "" && trip.trip_distance_miles < Number(minDistance)) {
            return false;
        }
        if (maxDistance !== "" && trip.trip_distance_miles > Number(maxDistance)) {
            return false;
        }
        return true;
    });

    shownTrips = filtered;
    renderAll(filtered);
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
