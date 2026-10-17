const router = require('express').Router()
const database = require('../models/database')
const {cached} = require('../models/cache')

const round = (sum, count, digits = 2) => count ? Number((sum / count).toFixed(digits)) : null

// The zones table is tiny, so zone names are resolved here instead of joining 7M trips.
const loadZones = () => cached('zones-info', async () => (await database.execute('SELECT location_id, zone, borough FROM zones'))[0])

// One scan of trips grouped by pickup zone and hour feeds every dashboard figure; concurrent endpoints share it through the cache.
const aggregate = (filterSQL, values) => cached('insights' + filterSQL + JSON.stringify(values), async () => {
    const zones = await loadZones()
    const airportIds = zones.filter(z => /airport/i.test(z.zone || '')).map(z => Number(z.location_id))
    const airports = airportIds.length ? airportIds.join(',') : 'NULL'

    const [rows] = await database.query(`SELECT t.pu_location_id AS pu, t.pickup_hour AS hr, COUNT(*) AS n,
        SUM(t.fare_amount) AS fare, COUNT(t.fare_amount) AS fare_n,
        SUM(t.trip_distance_miles) AS dist, COUNT(t.trip_distance_miles) AS dist_n,
        SUM(t.trip_duration_min) AS dur, COUNT(t.trip_duration_min) AS dur_n,
        SUM(t.avg_speed_mph) AS spd, COUNT(t.avg_speed_mph) AS spd_n,
        SUM(t.fare_per_mile) AS fpm, COUNT(t.fare_per_mile) AS fpm_n,
        SUM(t.pu_location_id IN (${airports}) OR t.do_location_id IN (${airports})) AS airport,
        SUM(t.is_cross_borough) AS cross_borough
        FROM trips t ${filterSQL} GROUP BY t.pu_location_id, t.pickup_hour`, values)

    return {rows, zones}
})

const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0)

const pieces = {
    summary: ({rows}) => ({
        total_trips: sum(rows, 'n'),
        avg_fare: round(sum(rows, 'fare'), sum(rows, 'fare_n')),
        avg_distance: round(sum(rows, 'dist'), sum(rows, 'dist_n')),
        avg_duration: round(sum(rows, 'dur'), sum(rows, 'dur_n')),
        avg_speed: round(sum(rows, 'spd'), sum(rows, 'spd_n')),
        airport_trips: sum(rows, 'airport'),
        cross_borough: sum(rows, 'cross_borough')
    }),

    hourly: ({rows}) => {
        const hours = new Map()
        for (const row of rows) {
            const hour = hours.get(row.hr) || {n: 0, spd: 0, spd_n: 0}
            hour.n += Number(row.n)
            hour.spd += Number(row.spd || 0)
            hour.spd_n += Number(row.spd_n)
            hours.set(row.hr, hour)
        }
        const sorted = [...hours.entries()].sort((a, b) => a[0] - b[0])
        return {
            trips_by_hour: sorted.map(([hour, h]) => ({pickup_hour: hour, trip_count: h.n})),
            speed_by_hour: sorted.map(([hour, h]) => ({pickup_hour: hour, avg_speed_mph: round(h.spd, h.spd_n)}))
        }
    },

    places: ({rows, zones}) => {
        const zoneById = new Map(zones.map(z => [Number(z.location_id), z]))
        const boroughs = new Map()
        const names = new Map()
        for (const row of rows) {
            const zone = zoneById.get(Number(row.pu)) || {}
            const borough = zone.borough ?? 'Unknown'
            const b = boroughs.get(borough) || {n: 0, fpm: 0, fpm_n: 0}
            b.n += Number(row.n)
            b.fpm += Number(row.fpm || 0)
            b.fpm_n += Number(row.fpm_n)
            boroughs.set(borough, b)
            names.set(zone.zone ?? 'Unknown', (names.get(zone.zone ?? 'Unknown') || 0) + Number(row.n))
        }
        return {
            fare_by_borough: [...boroughs.entries()].sort((a, b) => a[0].localeCompare(b[0]))
                .map(([borough, b]) => ({borough, trip_count: b.n, avg_fare_per_mile: round(b.fpm, b.fpm_n)})),
            top_pickup_zones: [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)
                .map(([zone, trip_count]) => ({zone, trip_count}))
        }
    }
}

// Each endpoint answers on its own, so the dashboard can request them in parallel and draw them as they arrive.
for (const [name, build] of Object.entries(pieces)) {
    router.route('/' + name).get(async (req, res) => {
        try {
            const data = await aggregate(req.countFilterSQL, req.filterValues)
            const body = build(data)
            return res.status(200).json({message: 'Insights are Retrieved!', ...(name === 'summary' ? {summary: body} : body)})
        } catch (error) {
            console.log('Failed to Retrieve Insights!', error)
            return res.status(500).json({message: 'Failed to Retrieve Insights!'})
        }
    })
}

router.route('/').get(async (req, res) => {
    try {
        const data = await aggregate(req.countFilterSQL, req.filterValues)
        return res.status(200).json({message: 'Insights are Retrieved!', summary: pieces.summary(data), ...pieces.hourly(data), ...pieces.places(data)})
    } catch (error) {
        console.log('Failed to Retrieve Insights!', error)
        return res.status(500).json({message: 'Failed to Retrieve Insights!'})
    }
})

module.exports = router
