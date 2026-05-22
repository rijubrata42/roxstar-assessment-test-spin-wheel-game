const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        // Neon and most managed Postgres providers require SSL
        rejectUnauthorized: false,
    },
});

// Test connection on startup
pool.connect((err, client, release) => {
    if (err) {
        console.error("Failed to connect to the database:", err.message);
    } else {
        console.log("Database connected successfully");
        release();
    }
});

module.exports = pool;
