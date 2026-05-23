const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { isAuthenticated } = require("../middleware/auth");

router.get("/me", isAuthenticated, userController.getMe);
router.get("/me/transactions", isAuthenticated, userController.getMyTransactions);
router.get("/me/games", isAuthenticated, userController.getMyGameHistory);

module.exports = router;
