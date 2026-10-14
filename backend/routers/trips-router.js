const router = require('express').Router()
const database = require('../models/database')

router.route('/').get(async(req, res) => {
    
    const { page = 1, limit = 50, sort = 'pickup_datetime', order = 'DESC'} = req.validatedQuery

    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 200) {
        return res.status(400).json({message: "Invalid page or limit! Limit must be between 1 and 200."})
    }

    const sortColumns = {
        pickup_datetime: 't.pickup_datetime',
        pu_zone: 'pu.zone',
        do_zone: 'dz.zone',
        trip_distance_miles: 't.trip_distance_miles',
        trip_duration_min: 't.trip_duration_min',
        fare_amount: 't.fare_amount'
    }

    if (!Object.prototype.hasOwnProperty.call(sortColumns, sort) || !['ASC', 'DESC'].includes(order)) {
        return res.status(400).json({message: 'The sort column or order is invalid!'})
    }

    const offset = (page -1) * limit

    try {
        const [trips] = await database.query(`
            SELECT t.trip_id, t.pickup_datetime, t.dropoff_datetime, t.pu_location_id, 
            t.do_location_id, pu.zone AS pu_zone, pu.borough AS pu_borough, dz.zone AS do_zone, dz.borough AS do_borough,
            t.trip_distance_miles, t.trip_duration_min, t.fare_amount, t.total_amount, t.avg_speed_mph, t.fare_per_mile
            FROM trips t 
            JOIN zones pu ON pu.location_id = t.pu_location_id 
            JOIN zones dz ON dz.location_id = t.do_location_id
            ${req.filterSQL} ORDER BY ${sortColumns[sort]} ${order}, t.trip_id ${order}
            LIMIT ? OFFSET ?`, [...req.filterValues, limit, offset])
        
        const [counts] = await database.execute(`
            SELECT COUNT(*) As total FROM trips t JOIN zones pu ON pu.location_id = t.pu_location_id JOIN zones dz ON dz.location_id = t.do_location_id
            ${req.filterSQL}`, req.filterValues)

        const total = Number(counts[0].total)

        return res.status(200).json({messages: 'Trips are Retrieved!', trips, pagination: {page, limit, total, total_pages: Math.ceil(total / limit)}})

    } catch (error) {
        console.log("Failed to Retrieve Trips!", error)

        return res.status(500).json({message: 'Failed to Retrieve Trips!'})
    }
})

module.exports = router