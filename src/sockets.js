import r from "rethinkdb";

export function registerSocketHandlers(io, conn) {
  const db = process.env.RETHINK_DB;

  io.on("connection", async (socket) => {
    console.log("Usuario conectado:", socket.id);

    // ============================
    // 1. Enviar historial al conectar
    // ============================
    const cursor = await r.db(db).table("messages")
      .orderBy({ index: r.asc("createdAt") })
      .run(conn);

    const history = await cursor.toArray();
    socket.emit("chat_history", history);

    // ============================
    // 2. Recibir mensaje del cliente
    // ============================
    socket.on("send_message", async (data) => {
      const message = {
        text: data.text,
        username: data.username,
        createdAt: new Date()
      };

      // Guardar en DB
      await r.db(db).table("messages").insert(message).run(conn);

      // Emitir a todos
      io.emit("new_message", message);
    });

    // ============================
    // 3. Changefeed (opcional pero profesional)
    // ============================
    r.db(db).table("messages").changes().run(conn, (err, cursor) => {
      if (err) return console.error(err);

      cursor.each((err, change) => {
        if (change.new_val) {
          io.emit("new_message", change.new_val);
        }
      });
    });

    // ============================
    // 4. Desconexión
    // ============================
    socket.on("disconnect", () => {
      console.log("Usuario desconectado:", socket.id);
    });
  });
}
