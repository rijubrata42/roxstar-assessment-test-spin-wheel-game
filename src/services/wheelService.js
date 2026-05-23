const pool = require("../../config/database");

async function getConfig(client) {
    const result = await client.query("SELECT key, value FROM config");
    const config = {};
    result.rows.forEach((row) => {
        config[row.key] = parseInt(row.value);
    });
    return config;
}

async function createWheel(adminId, entryFee) {
    const activeCheck = await pool.query("SELECT id FROM spin_wheels WHERE status IN ('waiting', 'running')");
    if (activeCheck.rows.length > 0) {
        throw new Error("An active wheel already exists");
    }

    const result = await pool.query(
        `INSERT INTO spin_wheels (created_by, entry_fee, status)
     VALUES ($1, $2, 'waiting') RETURNING *`,
        [adminId, entryFee],
    );

    return result.rows[0];
}

async function joinWheel(userId, wheelId) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const wheelResult = await client.query("SELECT * FROM spin_wheels WHERE id = $1 FOR UPDATE", [wheelId]);
        const wheel = wheelResult.rows[0];
        if (!wheel) throw new Error("Wheel not found");
        if (wheel.status !== "waiting") throw new Error("Wheel not accepting players");

        const dupCheck = await client.query("SELECT id FROM participants WHERE user_id = $1 AND spin_wheel_id = $2", [
            userId,
            wheelId,
        ]);
        if (dupCheck.rows.length > 0) throw new Error("Already joined");

        const userResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
        const user = userResult.rows[0];
        if (user.coin_balance < wheel.entry_fee) {
            throw new Error("Insufficient coins");
        }

        const config = await getConfig(client);
        const winnerAmount = Math.floor((wheel.entry_fee * config.winner_percentage) / 100);
        const adminAmount = Math.floor((wheel.entry_fee * config.admin_percentage) / 100);
        const appAmount = wheel.entry_fee - winnerAmount - adminAmount;

        const newBalance = user.coin_balance - wheel.entry_fee;
        await client.query("UPDATE users SET coin_balance = $1 WHERE id = $2", [newBalance, userId]);

        await client.query(
            `UPDATE spin_wheels
       SET winner_pool = winner_pool + $1,
           admin_pool = admin_pool + $2,
           app_pool = app_pool + $3
       WHERE id = $4`,
            [winnerAmount, adminAmount, appAmount, wheelId],
        );

        await client.query("INSERT INTO participants (user_id, spin_wheel_id) VALUES ($1, $2)", [userId, wheelId]);

        await client.query(
            `INSERT INTO transactions (user_id, spin_wheel_id, type, amount, balance_after)
       VALUES ($1, $2, 'entry_fee', $3, $4)`,
            [userId, wheelId, -wheel.entry_fee, newBalance],
        );

        await client.query("COMMIT");
        return { success: true, new_balance: newBalance };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function abortAndRefund(wheelId) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const wheelResult = await client.query("SELECT * FROM spin_wheels WHERE id = $1 FOR UPDATE", [wheelId]);
        const wheel = wheelResult.rows[0];
        if (!wheel || wheel.status !== "waiting") {
            throw new Error("Wheel cannot be aborted");
        }

        const participants = await client.query("SELECT user_id FROM participants WHERE spin_wheel_id = $1", [wheelId]);

        for (const participant of participants.rows) {
            await client.query("UPDATE users SET coin_balance = coin_balance + $1 WHERE id = $2", [
                wheel.entry_fee,
                participant.user_id,
            ]);

            const balResult = await client.query("SELECT coin_balance FROM users WHERE id = $1", [participant.user_id]);

            await client.query(
                `INSERT INTO transactions (user_id, spin_wheel_id, type, amount, balance_after)
         VALUES ($1, $2, 'refund', $3, $4)`,
                [participant.user_id, wheelId, wheel.entry_fee, balResult.rows[0].coin_balance],
            );
        }

        await client.query("UPDATE spin_wheels SET status = 'aborted', completed_at = NOW() WHERE id = $1", [wheelId]);

        await client.query("COMMIT");
        return { success: true, refunded: participants.rows.length };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function getWheelStatus(wheelId) {
    const wheel = await pool.query("SELECT * FROM spin_wheels WHERE id = $1", [wheelId]);
    const participants = await pool.query(
        `SELECT p.*, u.username FROM participants p
     JOIN users u ON p.user_id = u.id
     WHERE p.spin_wheel_id = $1`,
        [wheelId],
    );

    return {
        wheel: wheel.rows[0],
        participants: participants.rows,
    };
}

async function getActiveWheel() {
    const wheelResult = await pool.query(
        `SELECT * FROM spin_wheels WHERE status IN ('waiting', 'running') ORDER BY created_at DESC LIMIT 1`,
    );

    if (wheelResult.rows.length === 0) {
        return null;
    }

    const wheel = wheelResult.rows[0];
    const participants = await pool.query(
        `SELECT p.id, p.user_id, p.is_eliminated, p.joined_at, u.username
         FROM participants p
         JOIN users u ON p.user_id = u.id
         WHERE p.spin_wheel_id = $1
         ORDER BY p.joined_at ASC`,
        [wheel.id],
    );

    return {
        wheel,
        participants: participants.rows,
        participant_count: participants.rows.length,
    };
}

module.exports = { createWheel, joinWheel, abortAndRefund, getWheelStatus, getActiveWheel };
