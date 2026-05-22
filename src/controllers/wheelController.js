const wheelService = require("../services/wheelService");
const { startGame } = require("../services/gameEngine");
const pool = require("../../config/database");

const createWheel = async (req, res) => {
    try {
        const { entry_fee } = req.body;
        const wheel = await wheelService.createWheel(req.user.id, entry_fee);

        const io = req.app.get("io");

        // Start the 3-minute auto-start timer
        setTimeout(
            async () => {
                try {
                    const current = await pool.query("SELECT * FROM spin_wheels WHERE id = $1", [wheel.id]);
                    if (current.rows[0].status !== "waiting") return;

                    const count = await pool.query("SELECT COUNT(*) FROM participants WHERE spin_wheel_id = $1", [
                        wheel.id,
                    ]);

                    if (parseInt(count.rows[0].count) >= 3) {
                        await startGame(wheel.id, io);
                    } else {
                        await wheelService.abortAndRefund(wheel.id);
                        io.to(`wheel-${wheel.id}`).emit("wheel-aborted", {
                            reason: "Not enough participants",
                        });
                    }
                } catch (err) {
                    console.error("Auto-start timer error:", err);
                }
            },
            3 * 60 * 1000,
        );

        res.status(201).json({ message: "Wheel created", wheel });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const joinWheel = async (req, res) => {
    try {
        const result = await wheelService.joinWheel(req.user.id, req.params.wheelId);
        const io = req.app.get("io");
        io.to(`wheel-${req.params.wheelId}`).emit("player-joined", {
            username: req.user.username,
        });
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const manualStart = async (req, res) => {
    try {
        const wheelId = req.params.wheelId;
        const count = await pool.query("SELECT COUNT(*) FROM participants WHERE spin_wheel_id = $1", [wheelId]);

        if (parseInt(count.rows[0].count) < 3) {
            return res.status(400).json({ error: "Need at least 3 participants" });
        }

        const io = req.app.get("io");
        // Start in background (don't await — it takes minutes)
        startGame(wheelId, io).catch((err) => console.error("Game error:", err));

        res.json({ message: "Wheel started" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const getStatus = async (req, res) => {
    try {
        const status = await wheelService.getWheelStatus(req.params.wheelId);
        res.json(status);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

module.exports = { createWheel, joinWheel, manualStart, getStatus };
