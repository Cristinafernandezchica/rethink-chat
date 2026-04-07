import r from "rethinkdb";
import { verifyToken } from "./auth.js";

export function registerSocketHandlers(io, conn) {
  const db = process.env.RETHINK_DB;

  io.on("connection", async (socket) => {
    console.log("Usuario conectado:", socket.id);

    // IDENTIFICACIÓN DEL USUARIO (Ahora con JWT)
    socket.on("identify", async (token) => {
      try {
        const payload = verifyToken(token);

        socket.username = payload.username;
        socket.role = payload.role;

        console.log(`Usuario identificado: ${payload.username} (socket ${socket.id})`);

        // Insertar en online_users
        await r.db(db).table("online_users").insert({
          username: payload.username,
          socketId: socket.id,
          role: payload.role,
          connectedAt: new Date()
        }).run(conn);

        // Enviar lista actual de usuarios online solo a este socket
        const cursor = await r.db(db).table("online_users").run(conn);
        const online = await cursor.toArray();
        socket.emit("online_users", online);

      } catch (err) {
        console.error("Token inválido:", err.message);
        socket.emit("auth_error", { message: "Token inválido" });
        socket.disconnect();
      }
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

      const targetSocket = [...io.sockets.sockets.values()]
        .find(s => s.username === data.to);

      if (targetSocket) {
        targetSocket.emit("private_message", message);
      }

      socket.emit("private_message", message);
    });

    // ALERTAS EN TIEMPO REAL
    socket.on("send_alert", async (data) => {
      const alert = {
        type: data.type || "info",
        text: data.text,
        to: data.to || null,
        createdAt: new Date()
      };

      await r.db(db).table("alerts").insert(alert).run(conn);
      // No emitimos aquí porque el changefeed se encarga
    });

    // DESCONEXIÓN
    socket.on("disconnect", async () => {
      console.log("Usuario desconectado:", socket.id);

      if (socket.username) {
        await r.db(db).table("online_users")
          .getAll(socket.username, { index: "username" })
          .filter({ socketId: socket.id })
          .delete()
          .run(conn);
      }
    });
  });

  // CHANGEFEED DEL CHAT GENERAL
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

  // CHANGEFEED DE USUARIOS ONLINE
  r.db(db).table("online_users").changes().run(conn, (err, cursor) => {
    if (err) return console.error(err);

    cursor.each((err, change) => {
      if (change.new_val && !change.old_val) {
        io.emit("user_online", change.new_val);
      } else if (!change.new_val && change.old_val) {
        io.emit("user_offline", change.old_val);
      }
    });
  });
}
