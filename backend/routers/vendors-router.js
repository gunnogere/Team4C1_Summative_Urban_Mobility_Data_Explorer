const router = require('express').Router()
const database = require('../models/database')

router.route('/').get(async(req, res) => {
    try {
        const vendors = database.execute(`SELECT vendor_id, vendors_name FROM vendors ORDER BY vendor_id`)
        return res.status(200).json({message: "Vendors are Retrieved!", vendors})

    } catch (error) {
        console.log("Failed to Retrieve Vendors!", error)
        return res.status(500).json({message: "Failed to Retrieve Vendors!"})
    }
})

module.exports = router