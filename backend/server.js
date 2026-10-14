const path = require('path')

// Use dotenv
require('dotenv').config({path: 'config.env'})

const express = require('express')
const app = express()
const PORT = process.env.PORT || 3000
const Joi = require('joi')

// Connect the Database
const database = require('./models/database')

// Use Express Middleware
app.use(express.json())

// Use bodyparse
const bodyParser = require("body-parser")
app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())

// Use Cors
const cors = require('cors')
app.use(cors())

// Set the values that will be acceptable from the frontend
const filterSchema = Joi.object({
    date_from: Joi.string().empty(''),
    date_to: Joi.string().empty(''),
    borough: Joi.string().trim().max(100).empty(''),
    min_fare: Joi.number().min(0).empty(''),
    max_fare: Joi.number().min(0).empty(''),
    min_distance: Joi.number().min(0).empty(''),
    max_distance: Joi.number().min(0).empty(''),
    page: Joi.number().integer().min(1).max(200).empty(''),
    limit: Joi.number().integer().min(1).max(200).empty(''),
    sort: Joi.string().valid('pickup_datetime', 'pu_zone', 'do_zone', 'trip_distance_miles', 'trip_duration_min', 'fare_amount').empty(''),
    order: Joi.string().uppercase().valid('ASC', 'DESC').empty('')
})

// Filtering
app.use(['/api/trips', '/api/insights'], (req, res, next) => {
    const {error, value} = filterSchema.validate(req.query)

    if (error) {
        return res.status(400).json({message: error.message})
    }

    const ranges = [['date_from', 'date_to', 'date'], ['min_fare', 'max_fare', 'fare'], ['min_distance', 'max_distance', 'distance']]

    for (const [min, max, name] of ranges) {
        if (value[min] > value[max]) {
            return res.status(400).json({message: `The ${name} range is invalid!`})
        }
    }

    const rules = {
        date_from: 't.pickup_datetime >= ?',
        date_to: 't.pickup_datetime < DATE_ADD(?, INTERVAL 1 DAY)',
        borough: 'pu.borough = ?',
        min_fare: 't.fare_amount >= ?',
        max_fare: 't.fare_amount <= ?',
        min_distance: 't.trip_distance_miles >= ?',
        max_distance: 't.trip_distance_miles <= ?'
    }

    const conditions = []
    const values = []

    for (const name of Object.keys(rules)) {
        if (value[name] !== undefined) {
            conditions.push(rules[name])
            values.push(value[name])
        }
    }

    req.filterSQL = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    req.filterValues = values
    req.validatedQuery = value

    next()
})

// Use the routes
const tripsRouter = require('./routers/trips-router')
const zonesRouter = require('./routers/zones-router')
const insightsRouter = require('./routers/insights-router')

app.use('/api/trips', tripsRouter)
app.use('/api/zones', zonesRouter)
app.use('/api/insights', insightsRouter)


// Just in case we have an unknown API
app.use('/api', (req, res) => {
    return res.status(400).json({message: "API Route Not Found!"})
})

// app.listen(PORT, () => {
//     console.log(`Server is running on PORT ${PORT}`)
// })

const startServer = async() => {
    try {
        await database.execute('SELECT 1')
        console.log("MYSQL Database is Connected Successfully!")

        const server = app.listen(PORT, () => {
            console.log(`Server is running on PORT ${PORT}`)
        })

        server.on('error', async(error) => {
            console.error('Server Failed!', error)
            await database.end()
            process.exitCode = 1
        })

    } catch (error) {
        console.log('Failed To Start the Backend!', error)
        await database.end()
        process.exitCode = 1
    }
}

startServer()