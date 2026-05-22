const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function runMigrations() {
    const migrations = ["001_initial_schema.sql", "002_add_password.sql"];

    for (const file of migrations) {
        const filePath = path.join(__dirname, "..", "migrations", file);
        const sql = fs.readFileSync(filePath, "utf8");
        console.log(`\nRunning migration: ${file}`);
        try {
            await pool.query(sql);
            console.log(`✅ ${file} completed`);
        } catch (err) {
            // Many errors here are "already exists" — log and continue
            console.warn(`⚠️  ${file} warning: ${err.message}`);
        }
    }

    await pool.end();
    console.log("\nAll migrations done.");
}

runMigrations().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
