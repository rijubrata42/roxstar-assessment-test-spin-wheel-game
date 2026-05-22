const pool = require("../../config/database");

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function processWinner(wheelId) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const wheelResult = await client.query("SELECT * FROM spin_wheels WHERE id = $1 FOR UPDATE", [wheelId]);
        const wheel = wheelResult.rows[0];

        // Find the winner (last non-eliminated participant)
        const winnerResult = await client.query(
            `SELECT p.user_id, u.username FROM participants p
       JOIN users u ON p.user_id = u.id
       WHERE p.spin_wheel_id = $1 AND p.is_eliminated = false`,
            [wheelId],
        );
        const winner = winnerResult.rows[0];

        // Credit winner
        await client.query("UPDATE users SET coin_balance = coin_balance + $1 WHERE id = $2", [
            wheel.winner_pool,
            winner.user_id,
        ]);
        const winnerBal = await client.query("SELECT coin_balance FROM users WHERE id = $1", [winner.user_id]);
        await client.query(
            `INSERT INTO transactions (user_id, spin_wheel_id, type, amount, balance_after)
       VALUES ($1, $2, 'winning', $3, $4)`,
            [winner.user_id, wheelId, wheel.winner_pool, winnerBal.rows[0].coin_balance],
        );

        // Credit admin
        await client.query("UPDATE users SET coin_balance = coin_balance + $1 WHERE id = $2", [
            wheel.admin_pool,
            wheel.created_by,
        ]);
        const adminBal = await client.query("SELECT coin_balance FROM users WHERE id = $1", [wheel.created_by]);
        await client.query(
            `INSERT INTO transactions (user_id, spin_wheel_id, type, amount, balance_after)
       VALUES ($1, $2, 'admin_payout', $3, $4)`,
            [wheel.created_by, wheelId, wheel.admin_pool, adminBal.rows[0].coin_balance],
        );

        // Mark wheel as completed
        await client.query(
            `UPDATE spin_wheels
       SET status = 'completed', winner_id = $1, completed_at = NOW()
       WHERE id = $2`,
            [winner.user_id, wheelId],
        );

        await client.query("COMMIT");
        return winner;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function startGame(wheelId, io) {
    // Update status to running
    await pool.query("UPDATE spin_wheels SET status = 'running', started_at = NOW() WHERE id = $1", [wheelId]);

    // Get participants
    const participantsResult = await pool.query(
        `SELECT p.*, u.username FROM participants p
     JOIN users u ON p.user_id = u.id
     WHERE p.spin_wheel_id = $1`,
        [wheelId],
    );

    const participants = participantsResult.rows;
    const eliminationOrder = shuffleArray([...participants]);
    const toEliminate = eliminationOrder.slice(0, -1);

    // Broadcast game start
    io.to(`wheel-${wheelId}`).emit("game-started", {
        wheelId,
        participantCount: participants.length,
        participants: participants.map((p) => p.username),
    });

    // Eliminate one every 7 seconds
    for (let i = 0; i < toEliminate.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 7000));

        const eliminated = toEliminate[i];

        // Update database
        await pool.query(
            `UPDATE participants
       SET is_eliminated = true, elimination_order = $1, eliminated_at = NOW()
       WHERE id = $2`,
            [i + 1, eliminated.id],
        );

        // Broadcast to everyone watching
        io.to(`wheel-${wheelId}`).emit("player-eliminated", {
            username: eliminated.username,
            eliminationNumber: i + 1,
            remainingCount: participants.length - i - 1,
        });
    }

    // Process winner
    const winner = await processWinner(wheelId);

    io.to(`wheel-${wheelId}`).emit("game-ended", {
        winner: winner.username,
    });

    return winner;
}

module.exports = { startGame };
