import r from "rethinkdb";
import { verifyToken } from "./auth.js";

export function registerSocketHandlers(io, conn) {
  const db = process.env.RETHINK_DB;

  io.on("connection", async (socket) => {
    console.log("Usuario conectado:", socket.id);

    // IDENTIFICACIÓN DEL USUARIO (JWT)
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

        // Enviar lista actual de usuarios online SOLO a este socket
        const cursor = await r.db(db).table("online_users").run(conn);
        const online = await cursor.toArray();
        socket.emit("online_users", online);

        // Cargar historial de mensajes privados
        const privateMessagesCursor = await r.db(db).table("private_messages")
          .filter(
            r.row("from").eq(payload.username).or(r.row("to").eq(payload.username))
          )
          .orderBy("createdAt")
          .run(conn);

        const allPrivateMessages = await privateMessagesCursor.toArray();

        const conversationsMap = new Map();

        allPrivateMessages.forEach(msg => {
          const otherUser = msg.from === payload.username ? msg.to : msg.from;

          if (!conversationsMap.has(otherUser)) {
            conversationsMap.set(otherUser, []);
          }

          conversationsMap.get(otherUser).push({
            id: msg.id,
            from: msg.from,
            to: msg.to,
            text: msg.text,
            createdAt: msg.createdAt,
            read: msg.read
          });
        });

        const conversations = Array.from(conversationsMap.entries()).map(([otherUser, messages]) => ({
          otherUser,
          messages
        }));

        // Solo emitir historial una vez por sesión de socket
        if (!socket.historySent) {
          socket.historySent = true;
          socket.emit("private_history", conversations);
        }

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

    // MENSAJE GENERAL
    socket.on("send_message", async (data) => {
      const message = {
        text: data.text,
        username: data.username,
        createdAt: new Date()
      };

      await r.db(db).table("messages").insert(message).run(conn);
      // changefeed se encarga de emitir
    });

    // MENSAJE PRIVADO
    socket.on("private_message", async (data) => {
      const message = {
        from: data.from,
        to: data.to,
        text: data.text,
        createdAt: new Date(),
        read: false
      };

      await r.db(db).table("private_messages").insert(message).run(conn);
      // changefeed se encarga de emitir a los participantes
    });

    // ALERTAS (persistentes + efímeras) — UN SOLO HANDLER
    socket.on("send_alert", async (data) => {
      const alert = {
        type: data.type || "info",
        text: data.text,
        to: data.to || null,
        ephemeral: data.ephemeral || false,
        createdAt: new Date()
      };

      // EFÍMERAS
      if (alert.ephemeral) {
        if (alert.to) {
          // privada
          const target = [...io.sockets.sockets.values()].find(s => s.username === alert.to);
          if (target) target.emit("alert", alert);
        } else {
          // global
          io.emit("alert", alert);
        }
        return;
      }

      // PERSISTENTES: El changefeed se encarga de la emisión
      await r.db(db).table("alerts").insert(alert).run(conn);
    });


    socket.on("typing", (data) => {
      const target = [...io.sockets.sockets.values()].find(s => s.username === data.to);
      if (target) {
        target.emit("typing", { from: socket.username });
      }
    });

    socket.on("stop_typing", (data) => {
      const target = [...io.sockets.sockets.values()].find(s => s.username === data.to);
      if (target) {
        target.emit("stop_typing", { from: socket.username });
      }
    });

    socket.on("join_room", async (roomId) => {
      if (!socket.username) return;
      
      // Verificar que el usuario es miembro de la sala
      const memberCheck = await r.db(db)
        .table("room_members")
        .filter({ roomId, username: socket.username })
        .run(conn);
      
      const isMember = (await memberCheck.toArray()).length > 0;
      
      if (isMember) {
        // Salir de sala anterior si existía
        if (socket.currentRoom) {
          socket.leave(`room:${socket.currentRoom}`);
        }
        
        socket.currentRoom = roomId;
        socket.join(`room:${roomId}`);
        console.log(`${socket.username} se unió a la sala ${roomId}`);
        
        // Enviar historial de la sala
        const history = await r.db(db)
          .table("room_messages")
          .filter({ roomId })
          .orderBy(r.asc("createdAt"))
          .limit(100)
          .run(conn);
        
        const messages = await history.toArray();
        socket.emit("room_history", { roomId, messages });
      }
    });

    // Enviar mensaje a una sala
    socket.on("room_message", async (data) => {
      const { roomId, text } = data;
      
      if (!socket.username || !roomId || !text) return;
      
      // Verificar membresía
      const memberCheck = await r.db(db)
        .table("room_members")
        .filter({ roomId, username: socket.username })
        .run(conn);
      
      const isMember = (await memberCheck.toArray()).length > 0;
      
      if (!isMember) {
        socket.emit("error", { message: "No eres miembro de esta sala" });
        return;
      }
      
      const message = {
        roomId,
        username: socket.username,
        text: text.trim(),
        createdAt: new Date(),
        edited: false,
        deleted: false
      };
      
      // Guardar en DB
      const result = await r.db(db).table("room_messages").insert(message).run(conn);
      message.id = result.generated_keys[0];
      
      // Emitir a todos en la sala (incluyendo al emisor)
      io.to(`room:${roomId}`).emit("room_message", message);
    });

    // Salir de una sala (opcional)
    socket.on("leave_room", async () => {
      if (socket.currentRoom) {
        socket.leave(`room:${socket.currentRoom}`);
        console.log(`${socket.username} salió de la sala ${socket.currentRoom}`);
        socket.currentRoom = null;
      }
    });

    // DESCONEXIÓN
    socket.on("disconnect", async () => {
      console.log("Usuario desconectado:", socket.id);

      if (socket.username) {
        await r.db(db).table("online_users")
          .filter({ socketId: socket.id })
          .delete()
          .run(conn);
      }
    });
  });

  // CHANGEFEED CHAT GENERAL
  r.db(db).table("messages").changes().run(conn, (err, cursor) => {
    if (err) return console.error(err);

    cursor.each((err, change) => {
      if (change?.new_val) {
        io.emit("new_message", change.new_val);
      }
    });
  });

  // CHANGEFEED ALERTAS PERSISTENTES
  r.db(db).table("alerts").changes().run(conn, (err, cursor) => {
    if (err) return console.error(err);

    cursor.each((err, change) => {
      if (!change?.new_val) return;

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
    });
  });

  // CHANGEFEED USUARIOS ONLINE
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

  // CHANGEFEED MENSAJES PRIVADOS
  r.db(db).table("private_messages").changes().run(conn, (err, cursor) => {
    if (err) return console.error("Error en changefeed private_messages:", err);

    cursor.each((err, change) => {
      if (err) {
        console.error("Error en cambio de private_messages:", err);
        return;
      }

      if (change.new_val) {
        const message = change.new_val;
        const sockets = [...io.sockets.sockets.values()];

        sockets.forEach(socket => {
          if (socket.username === message.from || socket.username === message.to) {
            socket.emit("private_message", message);
          }
        });
      }
    });
  });
}