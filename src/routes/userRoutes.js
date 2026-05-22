const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { isAuthenticated } = require("../middleware/auth");

// GET  /api/users/me               — get own profile + balance
router.get("/me", isAuthenticated, userController.getMe);

// GET  /api/users/me/transactions  — get own transaction ledger
router.get("/me/transactions", isAuthenticated, userController.getMyTransactions);

// GET  /api/users/me/games         — get own game history
router.get("/me/games", isAuthenticated, userController.getMyGameHistory);

module.exports = router;
