const io = require("socket.io-client");

const socket = io("http://localhost:3000");

// Identificar al usuario
socket.on("connect", () => {
  socket.emit("identify", "cristina");

  // Enviar mensaje privado a "juan"
  socket.emit("private_message", {
    from: "cristina",
    to: "juan",
    text: "Hola Juan, soy Cristina"
  });
});

// Recibir mensajes privados
socket.on("private_message", (msg) => {
  console.log("📩 Mensaje privado recibido:", msg);
});
