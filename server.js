const http = require("http");
const { Server } = require("socket.io");
const app = require("./src/app");
const setupSocket = require("./src/socket/socketHandler");
require("dotenv").config();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set("io", io);
setupSocket(io);

const PORT = process.env.SERVER_PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
