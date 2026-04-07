export function registerSocketHandlers(io, conn) {
  io.on("connection", (socket) => {
    console.log("🔌 Usuario conectado:", socket.id);

    socket.on("disconnect", () => {
      console.log("❌ Usuario desconectado:", socket.id);
    });
  });
}
