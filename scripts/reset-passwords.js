const { Pool } = require("pg");
const bcrypt = require("bcrypt");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function resetPasswords() {
    const hash = await bcrypt.hash("password123", 10);
    await pool.query("UPDATE users SET password_hash = $1", [hash]);
    const result = await pool.query("SELECT id, username, role FROM users");
    console.log("Updated passwords for:", result.rows.map((r) => r.username).join(", "));
    await pool.end();
}

resetPasswords().catch(console.error);
