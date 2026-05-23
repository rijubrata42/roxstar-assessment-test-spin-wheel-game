const pool = require("../../config/database");

const getConfig = async (req, res) => {
    try {
        const result = await pool.query("SELECT key, value FROM config ORDER BY key");
        const config = {};
        result.rows.forEach((row) => {
            config[row.key] = parseInt(row.value);
        });
        res.json({ config });
    } catch (error) {
        console.error("Get config error:", error);
        res.status(500).json({ error: "Failed to fetch config" });
    }
};

const updateConfig = async (req, res) => {
    const { winner_percentage, admin_percentage, app_percentage } = req.body;

    if (winner_percentage === undefined || admin_percentage === undefined || app_percentage === undefined) {
        return res.status(400).json({ error: "All three percentages (winner, admin, app) must be provided" });
    }

    const w = parseInt(winner_percentage);
    const a = parseInt(admin_percentage);
    const ap = parseInt(app_percentage);

    if (isNaN(w) || isNaN(a) || isNaN(ap)) {
        return res.status(400).json({ error: "All percentages must be integers" });
    }

    if (w < 0 || a < 0 || ap < 0) {
        return res.status(400).json({ error: "Percentages cannot be negative" });
    }

    if (w + a + ap !== 100) {
        return res.status(400).json({ error: `Percentages must sum to 100. Current sum: ${w + a + ap}` });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("UPDATE config SET value = $1 WHERE key = 'winner_percentage'", [w]);
        await client.query("UPDATE config SET value = $1 WHERE key = 'admin_percentage'", [a]);
        await client.query("UPDATE config SET value = $1 WHERE key = 'app_percentage'", [ap]);
        await client.query("COMMIT");

        res.json({
            message: "Config updated successfully",
            config: { winner_percentage: w, admin_percentage: a, app_percentage: ap },
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Update config error:", error);
        res.status(500).json({ error: "Failed to update config" });
    } finally {
        client.release();
    }
};

const getAllUsers = async (req, res) => {
    try {
        const result = await pool.query("SELECT id, username, role, coin_balance, created_at FROM users ORDER BY id");
        res.json({ users: result.rows });
    } catch (error) {
        console.error("Get users error:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
};

const topupUser = async (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;

    if (!amount || parseInt(amount) <= 0) {
        return res.status(400).json({ error: "amount must be a positive integer" });
    }

    const coins = parseInt(amount);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            "UPDATE users SET coin_balance = coin_balance + $1 WHERE id = $2 RETURNING id, username, coin_balance",
            [coins, userId],
        );
        if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "User not found" });
        }
        const user = result.rows[0];

        await client.query(
            `INSERT INTO transactions (user_id, spin_wheel_id, type, amount, balance_after)
             VALUES ($1, NULL, 'admin_payout', $2, $3)`,
            [userId, coins, user.coin_balance],
        );

        await client.query("COMMIT");
        res.json({ message: "Coins added", user });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Topup error:", error);
        res.status(500).json({ error: "Topup failed" });
    } finally {
        client.release();
    }
};

module.exports = { getConfig, updateConfig, getAllUsers, topupUser };
