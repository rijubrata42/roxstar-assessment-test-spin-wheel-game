function setupSocket(io) {
    io.on("connection", (socket) => {
        console.log(`User connected: ${socket.id}`);

        // When a user wants to watch/participate in a wheel
        socket.on("join-wheel-room", (wheelId) => {
            socket.join(`wheel-${wheelId}`);
            console.log(`Socket ${socket.id} joined room wheel-${wheelId}`);
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });
}

module.exports = setupSocket;
