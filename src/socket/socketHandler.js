const jwt = require("jsonwebtoken");
const pool = require("../../config/database");

function setupSocket(io) {
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) {
                return next(new Error("Authentication token required"));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            const result = await pool.query("SELECT id, username, role FROM users WHERE id = $1", [decoded.id]);
            if (result.rows.length === 0) {
                return next(new Error("User not found"));
            }

            socket.user = result.rows[0];
            next();
        } catch (error) {
            next(new Error("Invalid or expired token"));
        }
    });

    io.on("connection", (socket) => {
        console.log(`User connected: ${socket.user.username} (${socket.id})`);

        socket.on("join-wheel-room", (wheelId) => {
            const room = `wheel-${wheelId}`;
            socket.join(room);
            console.log(`${socket.user.username} joined room ${room}`);

            socket.emit("joined-wheel-room", { wheelId, room });
        });

        socket.on("leave-wheel-room", (wheelId) => {
            const room = `wheel-${wheelId}`;
            socket.leave(room);
            console.log(`${socket.user.username} left room ${room}`);
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.user.username} (${socket.id})`);
        });
    });
}

module.exports = setupSocket;
