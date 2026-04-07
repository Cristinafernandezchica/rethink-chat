import r from "rethinkdb";

export function registerSocketHandlers(io, conn) {
  const db = process.env.RETHINK_DB;

  io.on("connection", async (socket) => {
    console.log("Usuario conectado:", socket.id);

    // Se recible el historial de mensajes enviados al conectarse (en orden)
    const cursor = await r.db(db).table("messages")
      .orderBy({ index: r.asc("createdAt") })
      .run(conn);

    const history = await cursor.toArray();
    socket.emit("chat_history", history);

    // Se envia un nuevo mensaje
    socket.on("send_message", async (data) => {
      const message = {
        text: data.text,
        username: data.username,
        createdAt: new Date()
      };

      // Se guarda en la BD
      await r.db(db).table("messages").insert(message).run(conn);

      // El mensaje se emitirá a todos los clientes conectados gracias al changefeed establecido más abajo
    });

    // Cuando se detecta un nuevo mensaje, se emite a todos los clientes conectados: 
    // RethinkDB permite escuchar cambios en tiempo real en una tabla mediante changefeeds. 
    // Aquí se establece un changefeed en la tabla "messages" para detectar nuevos mensajes y emitirlos a los clientes.
    r.db(db).table("messages").changes().run(conn, (err, cursor) => {
      if (err) return console.error(err);

      cursor.each((err, change) => {
        if (change.new_val) {
          io.emit("new_message", change.new_val);
        }
      });
    });

    // Se maneja la desconexión del usuario
    socket.on("disconnect", () => {
      console.log("Usuario desconectado:", socket.id);
    });
  });
}
