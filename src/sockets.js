import r from "rethinkdb";

export function registerSocketHandlers(io, conn) {
  const db = process.env.RETHINK_DB;

  io.on("connection", async (socket) => {
    console.log("Usuario conectado:", socket.id);

    // IDENTIFICACIÓN DEL USUARIO
    socket.on("identify", (username) => {
      socket.username = username;
      console.log(`Usuario identificado: ${username} (socket ${socket.id})`);
    });

    // HISTORIAL DEL CHAT GENERAL
    const cursor = await r.db(db).table("messages")
      .orderBy({ index: r.asc("createdAt") })
      .run(conn);

    const history = await cursor.toArray();
    socket.emit("chat_history", history);

    // ENVÍO DE MENSAJE GENERAL
    socket.on("send_message", async (data) => {
      const message = {
        text: data.text,
        username: data.username,
        createdAt: new Date()
      };

      await r.db(db).table("messages").insert(message).run(conn);
      // No emitimos aquí porque el changefeed se encarga
    });

    // MENSAJES PRIVADOS
    socket.on("private_message", async (data) => {
      const message = {
        from: data.from,
        to: data.to,
        text: data.text,
        createdAt: new Date()
      };

      await r.db(db).table("private_messages").insert(message).run(conn);

      // Buscar al usuario destino por username
      // En este caso no se está usando changefeeds, si no que se emite directamente al usuario destino (si está conectado) y al emisor.
      const targetSocket = [...io.sockets.sockets.values()]
        .find(s => s.username === data.to);

      if (targetSocket) {
        targetSocket.emit("private_message", message);
      }

      // Enviar copia al emisor
      socket.emit("private_message", message);
    });

    
    // ALERTAS EN TIEMPO REAL
    socket.on("send_alert", async (data) => {
      const alert = {
        type: data.type || "info",
        text: data.text,
        to: data.to || null,   // null = alerta global
        createdAt: new Date()
      };

      // Guardar en la BD
      await r.db(db).table("alerts").insert(alert).run(conn);

      // No emitimos aquí porque el changefeed se encarga 


    });

    // DESCONEXIÓN
    socket.on("disconnect", () => {
      console.log("Usuario desconectado:", socket.id);
    });
  });

  // CHANGEFEED DEL CHAT GENERAL
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

  // CHANGEFEED GLOBAL DE ALERTAS
  r.db(db).table("alerts").changes().run(conn, (err, cursor) => {
    cursor.each((err, change) => {
      if (change.new_val) {
        const alert = change.new_val;

        if (!alert.to) {
          io.emit("alert", alert);
          return;
        }

        const targetSocket = [...io.sockets.sockets.values()]
          .find(s => s.username === alert.to);

        if (targetSocket) {
          targetSocket.emit("alert", alert);
        }
      }
    });
  });

}
