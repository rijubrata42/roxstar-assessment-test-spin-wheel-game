const express = require("express");
const router = express.Router();
const wheelController = require("../controllers/wheelController");
const { isAuthenticated, isAdmin } = require("../middleware/auth");

// GET  /api/wheel/active           — discover currently open/running wheel
router.get("/active", isAuthenticated, wheelController.getActiveWheel);

// POST /api/wheel/create           — admin creates a new wheel
router.post("/create", isAuthenticated, isAdmin, wheelController.createWheel);

// POST /api/wheel/join/:wheelId    — player pays entry fee and joins
router.post("/join/:wheelId", isAuthenticated, wheelController.joinWheel);

// POST /api/wheel/start/:wheelId   — admin manually triggers game start
router.post("/start/:wheelId", isAuthenticated, isAdmin, wheelController.manualStart);

// GET  /api/wheel/status/:wheelId  — get wheel state + participants list
router.get("/status/:wheelId", isAuthenticated, wheelController.getStatus);

module.exports = router;
