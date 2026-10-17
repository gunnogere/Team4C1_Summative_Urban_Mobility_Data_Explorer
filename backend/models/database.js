const mysql = require('mysql2/promise')
const fs = require('fs')

const ssl = process.env.DB_SSL === 'true'
    ? (process.env.DB_SSL_CA
        ? {ca: fs.readFileSync(process.env.DB_SSL_CA)}
        : {rejectUnauthorized: false})
    : undefined

const database = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'urban_mobility',
    ssl,

    waitForConnections: true,
    connectionLimit: 10,

    // I Would like to keep timestamps as strings and measurements as numbers.
    dateStrings: true,
    decimalNumbers: true 
})

module.exports = database