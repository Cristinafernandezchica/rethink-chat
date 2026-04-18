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
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, '../public')));

// Rutas API (deben ir antes del catch-all)
app.use("/api/auth", authRoutes);
app.use("/api/messages", messagesRoutes);

// Health check para Docker
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// IMPORTANTE: NO usar app.get('*') o app.get('/*') en Express 5
// En su lugar, usamos un middleware que captura todas las rutas no manejadas
app.use((req, res, next) => {
  // Si la ruta no es de API y no es un archivo estático (express.static ya lo intentó)
  if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  } else {
    next();
  }
});

// Servidor HTTP + WebSockets
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Variable para la conexión de DB
let dbConn = null;

// Iniciar servidor
async function startServer() {
  try {
    // Conectar a DB
    dbConn = await connectDB();
    app.set("dbConn", dbConn);
    
    // Inicializar tablas
    await initDatabase();
    
    // Configurar sockets
    registerSocketHandlers(io, dbConn);
    
    // Iniciar servidor
    server.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
      console.log(`📊 Admin UI: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error iniciando servidor:", err);
    process.exit(1);
  }
}

// Manejar señales de terminación
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando servidor...');
  server.close(() => {
    if (dbConn) dbConn.close();
    process.exit(0);
  });
});

startServer();