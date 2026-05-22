const express = require("express");
const cors = require("cors");
const wheelRoutes = require("./routes/wheelRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/wheel", wheelRoutes);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

module.exports = app;
