import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { connectDB } from "./db.js";
import { registerSocketHandlers } from "./sockets.js";
import authRoutes from "./routes/auth.js";
import messagesRoutes from "./routes/messages.js";

const app = express();

// Activar CORS y JSON
app.use(cors());
app.use(express.json());

// Carga las rutas de la API
app.use("/api/auth", authRoutes);
app.use("/api/messages", messagesRoutes);

// Servidor HTTP + WebSockets
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Conectar DB y arrancar sockets
connectDB().then((conn) => {

  app.set("dbConn", conn);

  // Sockets sí reciben la conexión
  registerSocketHandlers(io, conn);

  server.listen(3000, () => {
    console.log("Servidor escuchando en http://localhost:3000");
  });
});
