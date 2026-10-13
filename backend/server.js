const path = require('path')
const express = require('express')
const app = express()
const PORT = process.env.PORT || 3000

// Use Express Middleware
app.use(express.json())

// Use bodyparse
const bodyParser = require("body-parser")
app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())

// Use Cors
const cors = require('cors')
app.use(cors())

// Use dotenv
require('dotenv').config({path: 'config.env'})

// Connect the Database
const database = require('./models/database')






app.listen(PORT, () => {
    console.log(`Server is running on PORT ${PORT}`)
})