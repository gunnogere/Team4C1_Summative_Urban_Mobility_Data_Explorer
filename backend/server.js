const path = require('path')

// Use dotenv
require('dotenv').config({path: 'config.env'})

const express = require('express')
const app = express()
const PORT = process.env.PORT || 3000

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