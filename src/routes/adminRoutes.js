const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { isAuthenticated, isAdmin } = require("../middleware/auth");

// GET  /api/admin/config       — read current coin split percentages
router.get("/config", isAuthenticated, isAdmin, adminController.getConfig);

// PUT  /api/admin/config       — update coin split percentages
router.put("/config", isAuthenticated, isAdmin, adminController.updateConfig);

// GET  /api/admin/users        — list all users
router.get("/users", isAuthenticated, isAdmin, adminController.getAllUsers);

// POST /api/admin/users/:userId/topup — add coins to a user
router.post("/users/:userId/topup", isAuthenticated, isAdmin, adminController.topupUser);

module.exports = router;
