const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

pool.connect((err, client, release) => {
    if (err) {
        console.error("Failed to connect to the database:", err.message);
    } else {
        console.log("Database connected successfully");
        release();
    }
});

module.exports = pool;
