const io = require("socket.io-client");

// Conexión al servidor Socket.io
const socket = io("http://localhost:3000");

// Cuando se conecta correctamente
socket.on("connect", () => {
  console.log("🔌 Conectado al servidor con ID:", socket.id);

  // Enviar un mensaje de prueba
  socket.emit("send_message", {
    text: "Hola desde test-client.cjs",
    username: "cristina"
  });
});

// Recibir historial del chat
socket.on("chat_history", (history) => {
  console.log("📜 Historial recibido:");
  console.log(history);
});

// Recibir mensajes nuevos
socket.on("new_message", (msg) => {
  console.log("🆕 Mensaje nuevo recibido:");
  console.log(msg);
});

// Cuando se desconecta
socket.on("disconnect", () => {
  console.log("❌ Desconectado del servidor");
});
