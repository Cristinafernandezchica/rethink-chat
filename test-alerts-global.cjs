const io = require("socket.io-client");

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("🔌 Conectado como Cristina");
  socket.emit("identify", "cristina");

  socket.emit("send_alert", {
    type: "warning",
    text: "⚠️ Alerta global de prueba"
  });
});

socket.on("alert", (alert) => {
  console.log("📢 ALERTA RECIBIDA:", alert);
});
