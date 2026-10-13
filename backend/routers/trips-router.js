const router = require('express').Router()
const database = require('../models/database')

router.route('/').get(async(req, res) => {
    const page = Number(req.query.page) || 1
    const limit = NUmber(req.query.limit) || 50

    try {
        
    } catch (error) {
        
    }
})