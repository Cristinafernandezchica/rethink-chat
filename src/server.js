import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./db.js";
import { registerSocketHandlers } from "./sockets.js";
import authRoutes from "./routes/auth.js";
import messagesRoutes from "./routes/messages.js";
import { initDatabase } from "./initDB.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Activar CORS y JSON
app.use(cors());
app.use(express.json());

// Servir archivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '../')));

// Carga las rutas de la API
app.use("/api/auth", authRoutes);
app.use("/api/messages", messagesRoutes);

// Servidor HTTP + WebSockets
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Health check para Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Conectar DB y arrancar sockets
connectDB().then(async (conn) => {
  app.set("dbConn", conn);

  // Inicializar tablas automáticamente
  await initDatabase();

  // Sockets reciben la conexión
  registerSocketHandlers(io, conn);

  server.listen(3000, () => {
    console.log("Servidor escuchando en http://localhost:3000");
  });
});