const router = require('express').Router()
const database = require('../models/database')

router.route('/').get(async(req, res) => {
    try {
        const [zones] = await database.execute(`SELECT location_id, borough, zone, service_done AS service_zone FROM zones ORDER BY location_id`)

        return res.status(200).json({message: "Zones are Retrieved!", zones})
    
    } catch (error) {
        console.log("Failed to Retrieve Zones!", error)
        return res.status(500).json({message: "Failed to Retrieve Zones!"})    
    }
})