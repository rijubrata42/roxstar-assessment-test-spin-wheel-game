const pool = require("../../config/database");

const isAuthenticated = async (req, res, next) => {
    const userId = req.headers["x-user-id"];
    if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    try {
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: "User not found" });
        }
        req.user = result.rows[0];
        next();
    } catch (error) {
        res.status(500).json({ error: "Auth check failed" });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
};

module.exports = { isAuthenticated, isAdmin };
