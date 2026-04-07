const io = require("socket.io-client");

console.log("▶ Iniciando cliente de Juan...");

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("🔌 Conectado al servidor con ID:", socket.id);

  // Identificar al usuario
  socket.emit("identify", "juan");
});

socket.on("private_message", (msg) => {
  console.log("📩 Juan recibió:", msg);
});
