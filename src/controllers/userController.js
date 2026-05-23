const pool = require("../../config/database");

const getMe = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, username, role, coin_balance, created_at FROM users WHERE id = $1",
            [req.user.id],
        );
        res.json({ user: result.rows[0] });
    } catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
};

const getMyTransactions = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT t.id, t.type, t.amount, t.balance_after, t.created_at,
                    sw.id AS wheel_id, sw.entry_fee
             FROM transactions t
             LEFT JOIN spin_wheels sw ON t.spin_wheel_id = sw.id
             WHERE t.user_id = $1
             ORDER BY t.created_at DESC
             LIMIT 50`,
            [req.user.id],
        );
        res.json({ transactions: result.rows });
    } catch (error) {
        console.error("Get transactions error:", error);
        res.status(500).json({ error: "Failed to fetch transactions" });
    }
};

const getMyGameHistory = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.spin_wheel_id, p.is_eliminated, p.elimination_order, p.joined_at, p.eliminated_at,
                    sw.entry_fee, sw.status, sw.winner_pool, sw.winner_id,
                    (sw.winner_id = $1) AS is_winner
             FROM participants p
             JOIN spin_wheels sw ON p.spin_wheel_id = sw.id
             WHERE p.user_id = $1
             ORDER BY p.joined_at DESC`,
            [req.user.id],
        );
        res.json({ games: result.rows });
    } catch (error) {
        console.error("Get game history error:", error);
        res.status(500).json({ error: "Failed to fetch game history" });
    }
};

module.exports = { getMe, getMyTransactions, getMyGameHistory };
