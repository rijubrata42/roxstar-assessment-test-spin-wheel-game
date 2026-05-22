const express = require("express");
const router = express.Router();
const wheelController = require("../controllers/wheelController");
const { isAdmin, isAuthenticated } = require("../middleware/auth");

router.post("/create", isAuthenticated, isAdmin, wheelController.createWheel);
router.post("/join/:wheelId", isAuthenticated, wheelController.joinWheel);
router.post("/start/:wheelId", isAuthenticated, isAdmin, wheelController.manualStart);
router.get("/status/:wheelId", isAuthenticated, wheelController.getStatus);

module.exports = router;
