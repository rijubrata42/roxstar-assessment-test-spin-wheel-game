const express = require("express");
const cors = require("cors");
const path = require("path");
const wheelRoutes = require("./routes/wheelRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();

// ─── Serve frontend static files ───
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(cors());
app.use(express.json());

// ─── Routes ───
app.use("/api/auth", authRoutes);
app.use("/api/wheel", wheelRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);

// ─── Health check ───
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// ─── 404 handler ───
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── Global error handler ───
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
