const router = require('express').Router()
const database = require('../models/database')

const FROM = `FROM trips t JOIN zones pu ON pu.location_id = t.pu_location_id JOIN zones dz ON dz.location_id = t.do_location_id`

router.route('/').get(async(req, res) => {
    try {
        // The summary cards on our frontend HTML page
        const [summary] = await database.execute(`SELECT COUNT(*) AS total_trips, ROUND(AVG(t.fare_amount), 2) AS avg_fare,
            ROUND(AVG(t.trip_distance_miles), 2) AS avg_distance, ROUND(AVG(t.trip_duration_min), 2) AS avg_duration,
            ROUND(AVG(t.avg_speed_mph), 2) AS avg_speed,
            SUM(pu.zone LIKE '%Airport%' OR dz.zone LIKE '%Airport%') AS airport_trips,
            SUM(t.is_cross_borough) AS cross_borough
            ${FROM} ${req.filterSQL}`,
            req.filterValues)

        // Trips and the average speed by pickup hour!
        const [hourly] = await database.execute(`SELECT t.pickup_hour, COUNT(*) AS trip_count, ROUND(AVG(t.avg_speed_mph), 2) AS avg_speed_mph
            ${FROM} ${req.filterSQL} GROUP BY t.pickup_hour ORDER BY t.pickup_hour`, req.filterValues)

        const [boroughs] = await database.execute(`SELECT pu.borough, COUNT(*) AS trip_count, ROUND(AVG(t.fare_per_mile), 2) AS avg_fare_per_mile
            ${FROM} ${req.filterSQL} GROUP BY pu.borough ORDER BY pu.borough`, req.filterValues)

        const [topZones] = await database.execute(`SELECT pu.zone, COUNT(*) AS trip_count
            ${FROM} ${req.filterSQL} GROUP BY pu.zone ORDER BY trip_count DESC, pu.zone LIMIT 5`, req.filterValues)

        return res.status(200).json({message: "Insights are Retrieved!", 
            summary: {
                total_trips: Number(summary[0].total_trips),
                avg_fare: summary[0].avg_fare,
                avg_distance: summary[0].avg_distance,
                avg_duration: summary[0].avg_duration,
                avg_speed: summary[0].avg_speed,
                airport_trips: Number(summary[0].airport_trips || 0),
                cross_borough: Number(summary[0].cross_borough || 0)
            },
            trips_by_hour: hourly.map(row => ({
                pickup_hour: row.pickup_hour,
                trip_count: Number(row.trip_count)
            })),

            speed_by_hour: hourly.map(row => ({
                pickup_hour: row.pickup_hour,
                avg_speed_mph: row.avg_speed_mph
            })),

            fare_by_borough: boroughs.map(row => ({
                borough: row.borough,
                trip_count: Number(row.trip_count),
                avg_fare_per_mile: row.avg_fare_per_mile
            })),

            top_pickup_zones: topZones.map(row => ({
                zone: row.zone,
                trip_count: Number(row.trip_count)
            }))
        
        })
        
    } catch (error) {
        console.log("Failed to Retrieve Insights!", error)
        return res.status(500).json({message: "Failed to Retrieve Insights!"})
    }
})

module.exports = router
