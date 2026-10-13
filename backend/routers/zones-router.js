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

router.route('/geojson').get(async(req, res) => {
    try {
        const [zones] = await database.execute(`SELECT z.location_id, z.borough, z.zone, g.geometry FROM zones z ON g.location_id = z.location_id ORDER BY z.location_id`)
        const features = zones.map(zone => ({
            type: 'Feature',
            id: zone.location_id,
            properties: {
                location_id: zone.location_id,
                borough: zone.borough,
                zone: zone.zone
            },
            geometry: typeof zone.geometry === 'string' ? JSON.parse(zone.geometry) : zone.geometry
        
        }))

        return res.status(200).json({type: 'FeatureCollection', features})

    } catch (error) {
        console.log("Failed to Retrieve Map Data!", error)
        return res.status(500).json({message: "Failed to Retrieve Map Data!"})
    }
})

module.exports = router