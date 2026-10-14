const router = require('express').Router()
const database = require('../models/database')

router.route('/').get(async(req, res) => {
    try {
        // The summary cards on our frontend HTML page
        const [summary] = await database.execute(`SELECT COUNT(*) As total_trips, ROUND(AVG(t.fare_amount), 2) AS avg_fare, 
            ROUND(AVG(t.avg_speed_mph), 2) AS avg_speed FROM trips t JOIN zones pu ON pu.location_id = t.pu_location_id ${req.filterSQL}`, 
            req.filterValues)
        
        // Trips and the average speed by pickup hour!
        const [hourly] = await database.execute(`SELECT t.pickup_hour, COUNT(*) AS trip_count, ROUND(AVG(t.avg_speed_mph), 2) AS avg_speed_mph
            FROM trips t JOIN zones pu ON pu.location_id = t.pu_location_id
            ${req.filterSQL} GROUP BY t.pickup_hour ORDER BY t.pickup_hour`, req.filterValues)
        
        
        const [boroughs] = await database.execute(`SELECT pu.borough, COUNT(*) AS trip_count, ROUND(AVG(t.fare_per_mile), 2) AS avg_fare_per_mile
            FROM trips t JOIN zones pu ON pu.location_id = t.pu_location_id
            ${req.filterSQL} GROUP BY pu.borough ORDER BY pu.borough`, req.filterValues)

        return res.status(200).json({message: "Insights are Retrieved!", 
            summary: {
                total_trips: Number(summary[0].total_trips),
                avg_fare: summary[0].avg_fare,
                avg_speed: summary[0].avg_speed
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
            }))
        
        })
        
    } catch (error) {
        console.log("Failed to Retrieve Insights!", error)
        return res.status(500).json({message: "Failed to Retrieve Insights!"})
    }
})

module.exports = router