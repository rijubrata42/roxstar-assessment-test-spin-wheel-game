const jwt = require("jsonwebtoken");
const pool = require("../../config/database");

// ─── JWT Authentication ───
const isAuthenticated = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Authorization header. Use: Bearer <token>" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Refresh user from DB so we always have current balance + role
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [decoded.id]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: "User not found" });
        }
        req.user = result.rows[0];
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Token expired. Please log in again." });
        }
        return res.status(401).json({ error: "Invalid token" });
    }
};

// ─── Admin Guard ───
const isAdmin = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
};

module.exports = { isAuthenticated, isAdmin };
