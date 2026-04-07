import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { connectDB } from "./db.js";
import { registerSocketHandlers } from "./sockets.js";

const app = express();
app.use(cors());
app.use(express.json());

// Rutas API (login, registro…)
import authRoutes from "./routes/auth.js";
app.use("/api/auth", authRoutes);

// Servidor HTTP + WebSockets
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Conectar DB y arrancar sockets
connectDB().then((conn) => {
  registerSocketHandlers(io, conn);

  server.listen(3000, () => {
    console.log("🚀 Servidor escuchando en http://localhost:3000");
  });
});
