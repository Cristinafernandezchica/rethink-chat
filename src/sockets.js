import r from "rethinkdb";
import { verifyToken } from "./auth.js";

// Función auxiliar para obtener resultados de búsqueda
async function getSearchResults(conn, searchTerm, currentUser) {
  const db = process.env.RETHINK_DB;
  const results = [];

  // Buscar en mensajes globales
  const globalCursor = await r.db(db)
    .table("messages")
    .filter(r.row("text").match(`(?i)${searchTerm}`))
    .filter(r.row("deleted").eq(false))
    .orderBy(r.desc("createdAt"))
    .limit(30)
    .run(conn);

  const globalResults = await globalCursor.toArray();
  results.push(...globalResults.map(msg => ({
    id: msg.id,
    text: msg.text,
    username: msg.username,
    createdAt: msg.createdAt,
    chatType: "global",
    chatName: "Chat General"
  })));

  // Buscar en mensajes privados
  const privateCursor = await r.db(db)
    .table("private_messages")
    .filter(r.row("text").match(`(?i)${searchTerm}`))
    .filter(r.row("deleted").eq(false))
    .filter(r.row("from").eq(currentUser).or(r.row("to").eq(currentUser)))
    .orderBy(r.desc("createdAt"))
    .limit(30)
    .run(conn);

  const privateResults = await privateCursor.toArray();

  // Agrupar por conversación
  const convMap = new Map();
  privateResults.forEach(msg => {
    const otherUser = msg.from === currentUser ? msg.to : msg.from;
    if (!convMap.has(otherUser)) {
      convMap.set(otherUser, []);
    }
    convMap.get(otherUser).push({
      id: msg.id,
      text: msg.text,
      from: msg.from,
      to: msg.to,
      createdAt: msg.createdAt,
      chatType: "private",
      chatName: otherUser
    });
  });

  for (const [otherUser, messages] of convMap) {
    results.push({
      chatType: "private",
      chatName: otherUser,
      messages: messages.slice(0, 10)
    });
  }

  return results;
}

export function registerSocketHandlers(io, conn) {
  const db = process.env.RETHINK_DB;

  io.on("connection", async (socket) => {
    console.log("Usuario conectado:", socket.id);

    // Almacenar la suscripción activa de búsqueda para este socket
    let currentSearchSubscription = null;
    let currentSearchTerm = "";

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
            read: msg.read,
            edited: msg.edited || false,
            deleted: msg.deleted || false,
            editHistory: msg.editHistory || []
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

    // SUSCRIPCIÓN A BÚSQUEDA EN TIEMPO REAL
    socket.on("subscribe_search", async (searchTerm) => {
      // Limpiar suscripción anterior si existe
      if (currentSearchSubscription) {
        try {
          currentSearchSubscription.close();
        } catch (e) {
          console.error("Error cerrando suscripción anterior:", e);
        }
        currentSearchSubscription = null;
      }

      currentSearchTerm = searchTerm;

      if (!searchTerm || searchTerm.trim().length < 2) {
        socket.emit("search_results", { results: [], searchTerm: "" });
        return;
      }

      const lowerSearchTerm = searchTerm.toLowerCase();
      const currentUser = socket.username;

      // --- 1. Enviar los resultados iniciales ---
      try {
        const initialResults = await getSearchResults(conn, lowerSearchTerm, currentUser);
        socket.emit("search_results", { results: initialResults, searchTerm });
      } catch (err) {
        console.error("Error obteniendo resultados iniciales:", err);
        socket.emit("search_results", { results: [], searchTerm });
        return;
      }

      // --- 2. Función para emitir actualizaciones ---
      const emitUpdate = async () => {
        try {
          const updatedResults = await getSearchResults(conn, lowerSearchTerm, currentUser);
          socket.emit("search_results", { results: updatedResults, searchTerm });
        } catch (err) {
          console.error("Error actualizando resultados:", err);
        }
      };

      // --- 3. Escuchar cambios en la tabla 'messages' (chat general) ---
      r.db(db).table("messages")
        .filter(r.row("deleted").eq(false))
        .changes({ includeInitial: false })
        .run(conn, (err, cursor) => {
          if (err) {
            console.error("Error en changefeed de messages:", err);
            return;
          }
          currentSearchSubscription = cursor;

          cursor.each(async (err, change) => {
            if (err) {
              console.error("Error en cambio de messages:", err);
              return;
            }
            const newMsg = change.new_val;
            const oldMsg = change.old_val;

            // Verificar si el mensaje coincide con la búsqueda actual
            const matches = (msg) => {
              if (!msg || !msg.text || msg.deleted) return false;
              return msg.text.toLowerCase().includes(lowerSearchTerm);
            };

            if ((newMsg && matches(newMsg)) || (oldMsg && matches(oldMsg))) {
              await emitUpdate();
            }
          });
        });

      // --- 4. Escuchar cambios en la tabla 'private_messages' ---
      r.db(db).table("private_messages")
        .filter(r.row("deleted").eq(false))
        .changes({ includeInitial: false })
        .run(conn, (err, cursor) => {
          if (err) {
            console.error("Error en changefeed de private_messages:", err);
            return;
          }

          cursor.each(async (err, change) => {
            if (err) {
              console.error("Error en cambio de private_messages:", err);
              return;
            }
            const newMsg = change.new_val;

            const matches = (msg) => {
              if (!msg || !msg.text || msg.deleted) return false;
              return msg.text.toLowerCase().includes(lowerSearchTerm);
            };

            const canAccess = (msg) => {
              return msg && (msg.from === currentUser || msg.to === currentUser);
            };

            if (newMsg && canAccess(newMsg) && matches(newMsg)) {
              await emitUpdate();
            }
          });
        });
    });

    // MENSAJE GENERAL
    socket.on("send_message", async (data) => {
      const message = {
        id: r.uuid(),
        text: data.text,
        username: data.username,
        createdAt: new Date(),
        edited: false,
        editHistory: [],
        deleted: false,
        originalText: null,
        lastEditedAt: null,
        lastEditedBy: null
      };

      await r.db(db).table("messages").insert(message).run(conn);
    });

    // MENSAJE PRIVADO
    socket.on("private_message", async (data) => {
      const message = {
        id: r.uuid(),
        from: data.from,
        to: data.to,
        text: data.text,
        createdAt: new Date(),
        read: false,
        edited: false,
        editHistory: [],
        deleted: false,
        originalText: null,
        lastEditedAt: null,
        lastEditedBy: null
      };

      await r.db(db).table("private_messages").insert(message).run(conn);
    });

    // ALERTAS (persistentes + efímeras)
    socket.on("send_alert", async (data) => {
      const alert = {
        type: data.type || "info",
        text: data.text,
        to: data.to || null,
        ephemeral: data.ephemeral || false,
        createdAt: new Date()
      };

      if (alert.ephemeral) {
        if (alert.to) {
          const target = [...io.sockets.sockets.values()].find(s => s.username === alert.to);
          if (target) target.emit("alert", alert);
        } else {
          io.emit("alert", alert);
        }
        return;
      }

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

      const memberCheck = await r.db(db)
        .table("room_members")
        .filter({ roomId, username: socket.username })
        .run(conn);

      const isMember = (await memberCheck.toArray()).length > 0;

      if (isMember) {
        if (socket.currentRoom) {
          socket.leave(`room:${socket.currentRoom}`);
        }

        socket.currentRoom = roomId;
        socket.join(`room:${roomId}`);
        console.log(`${socket.username} se unió a la sala ${roomId}`);

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

    socket.on("room_message", async (data) => {
      const { roomId, text } = data;

      if (!socket.username || !roomId || !text) return;

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
        id: r.uuid(),
        roomId,
        username: socket.username,
        text: text.trim(),
        createdAt: new Date(),
        edited: false,
        deleted: false
      };

      await r.db(db).table("room_messages").insert(message).run(conn);

      io.to(`room:${roomId}`).emit("room_message", message);
    });

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

      // Limpiar suscripción de búsqueda
      if (currentSearchSubscription) {
        try {
          currentSearchSubscription.close();
        } catch (e) {
          console.error("Error cerrando suscripción en disconnect:", e);
        }
      }

      if (socket.username) {
        await r.db(db).table("online_users")
          .filter({ socketId: socket.id })
          .delete()
          .run(conn);
      }
    });

    // EDITAR MENSAJE GENERAL
    socket.on("edit_message", async (data) => {
      const { messageId, newText } = data;

      try {
        const message = await r.db(db)
          .table("messages")
          .get(messageId)
          .run(conn);

        if (!message) {
          socket.emit("error", { message: "Mensaje no encontrado" });
          return;
        }

        if (message.username !== socket.username && socket.role !== "admin") {
          socket.emit("error", { message: "No autorizado" });
          return;
        }

        const editEntry = {
          text: message.text,
          editedAt: new Date(),
          editedBy: socket.username
        };

        const editHistory = message.editHistory || [];
        editHistory.push(editEntry);

        const updatedMessage = await r.db(db)
          .table("messages")
          .get(messageId)
          .update({
            text: newText,
            edited: true,
            editHistory: editHistory,
            lastEditedAt: new Date(),
            lastEditedBy: socket.username,
            originalText: message.originalText || message.text
          }, { returnChanges: true })
          .run(conn);

        if (updatedMessage.changes && updatedMessage.changes[0]) {
          io.emit("message_edited", updatedMessage.changes[0].new_val);
        }
      } catch (err) {
        console.error("Error editando mensaje por socket:", err);
        socket.emit("error", { message: "Error al editar mensaje" });
      }
    });

    // EDITAR MENSAJE PRIVADO
    socket.on("edit_private_message", async (data) => {
      const { messageId, newText } = data;

      try {
        const message = await r.db(db)
          .table("private_messages")
          .get(messageId)
          .run(conn);

        if (!message) {
          socket.emit("error", { message: "Mensaje no encontrado" });
          return;
        }

        if (message.from !== socket.username && socket.role !== "admin") {
          socket.emit("error", { message: "No autorizado" });
          return;
        }

        const editEntry = {
          text: message.text,
          editedAt: new Date(),
          editedBy: socket.username
        };

        const editHistory = message.editHistory || [];
        editHistory.push(editEntry);

        const updatedMessage = await r.db(db)
          .table("private_messages")
          .get(messageId)
          .update({
            text: newText,
            edited: true,
            editHistory: editHistory,
            lastEditedAt: new Date(),
            lastEditedBy: socket.username,
            originalText: message.originalText || message.text
          }, { returnChanges: true })
          .run(conn);

        if (updatedMessage.changes && updatedMessage.changes[0]) {
          const newMessage = updatedMessage.changes[0].new_val;
          const sockets = [...io.sockets.sockets.values()];
          sockets.forEach(s => {
            if (s.username === newMessage.from || s.username === newMessage.to) {
              s.emit("private_message_edited", newMessage);
            }
          });
        }
      } catch (err) {
        console.error("Error editando mensaje privado:", err);
        socket.emit("error", { message: "Error al editar mensaje" });
      }
    });

    // BORRAR MENSAJE GENERAL
    socket.on("delete_message", async (data) => {
      const { messageId } = data;

      try {
        const message = await r.db(db)
          .table("messages")
          .get(messageId)
          .run(conn);

        if (!message) {
          socket.emit("error", { message: "Mensaje no encontrado" });
          return;
        }

        if (message.username !== socket.username && socket.role !== "admin") {
          socket.emit("error", { message: "No autorizado" });
          return;
        }

        const updatedMessage = await r.db(db)
          .table("messages")
          .get(messageId)
          .update({
            deleted: true,
            deletedAt: new Date(),
            deletedBy: socket.username,
            text: "[Mensaje eliminado]"
          }, { returnChanges: true })
          .run(conn);

        if (updatedMessage.changes && updatedMessage.changes[0]) {
          io.emit("message_deleted", updatedMessage.changes[0].new_val);
        }
      } catch (err) {
        console.error("Error borrando mensaje:", err);
        socket.emit("error", { message: "Error al borrar mensaje" });
      }
    });

    // BORRAR MENSAJE PRIVADO
    socket.on("delete_private_message", async (data) => {
      const { messageId } = data;

      try {
        const message = await r.db(db)
          .table("private_messages")
          .get(messageId)
          .run(conn);

        if (!message) {
          socket.emit("error", { message: "Mensaje no encontrado" });
          return;
        }

        if (message.from !== socket.username && socket.role !== "admin") {
          socket.emit("error", { message: "No autorizado" });
          return;
        }

        const updatedMessage = await r.db(db)
          .table("private_messages")
          .get(messageId)
          .update({
            deleted: true,
            deletedAt: new Date(),
            deletedBy: socket.username,
            text: "[Mensaje eliminado]"
          }, { returnChanges: true })
          .run(conn);

        if (updatedMessage.changes && updatedMessage.changes[0]) {
          const newMessage = updatedMessage.changes[0].new_val;
          const sockets = [...io.sockets.sockets.values()];
          sockets.forEach(s => {
            if (s.username === newMessage.from || s.username === newMessage.to) {
              s.emit("private_message_deleted", newMessage);
            }
          });
        }
      } catch (err) {
        console.error("Error borrando mensaje privado:", err);
        socket.emit("error", { message: "Error al borrar mensaje" });
      }
    });

  });

  // CHANGEFEED CHAT GENERAL
  r.db(db).table("messages").changes({ includeInitial: false }).run(conn, (err, cursor) => {
    if (err) return console.error(err);

    cursor.each((err, change) => {
      if (change?.new_val) {
        if (change.old_val && change.old_val.text !== change.new_val.text) {
          io.emit("message_edited", change.new_val);
        }
        else if (change.new_val.deleted === true && (!change.old_val || !change.old_val.deleted)) {
          io.emit("message_deleted", change.new_val);
        }
        else if (!change.old_val) {
          io.emit("new_message", change.new_val);
        }
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