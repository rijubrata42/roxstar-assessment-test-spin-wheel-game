const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { isAuthenticated, isAdmin } = require("../middleware/auth");

router.get("/config", isAuthenticated, isAdmin, adminController.getConfig);
router.put("/config", isAuthenticated, isAdmin, adminController.updateConfig);
router.get("/users", isAuthenticated, isAdmin, adminController.getAllUsers);
router.post("/users/:userId/topup", isAuthenticated, isAdmin, adminController.topupUser);

module.exports = router;
