import express from "express";
import r from "rethinkdb";
import { verifyTokenMiddleware } from "../auth.js";

const router = express.Router();
const db = process.env.RETHINK_DB;

// Obtener todos los usuarios registrados
router.get("/users", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");

    const cursor = await r.db(db).table("users").pluck("username").run(conn);
    const users = await cursor.toArray();

    return res.json({ users });
  } catch (err) {
    console.error("Error obteniendo usuarios:", err);
    return res.status(500).json({ error: "Error obteniendo usuarios" });
  }
});


// Búsqueda de mensajes (global y privados)
router.get("/search", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const { q, type = "all" } = req.query;
    const currentUser = req.user.username;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: "El término de búsqueda debe tener al menos 2 caracteres" });
    }

    const searchTerm = q.trim().toLowerCase();
    const results = [];

    // Buscar en mensajes globales (messages)
    if (type === "all" || type === "global") {
      const globalCursor = await r.db(db)
        .table("messages")
        .filter((doc) => doc("text").match(`(?i)${searchTerm}`)) // Búsqueda case-insensitive
        .orderBy(r.desc("createdAt"))
        .limit(50)
        .run(conn);
      
      const globalResults = await globalCursor.toArray();
      results.push(...globalResults.map(msg => ({
        ...msg,
        chatType: "global",
        chatName: "Chat General"
      })));
    }

    // Buscar en mensajes privados donde el usuario actual sea participante
    if (type === "all" || type === "private") {
      const privateCursor = await r.db(db)
        .table("private_messages")
        .filter(
          r.row("text").match(`(?i)${searchTerm}`)
            .and(r.row("from").eq(currentUser).or(r.row("to").eq(currentUser)))
        )
        .orderBy(r.desc("createdAt"))
        .limit(50)
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
          ...msg,
          chatType: "private",
          chatName: otherUser
        });
      });
      
      for (const [otherUser, messages] of convMap) {
        results.push({
          chatType: "private",
          chatName: otherUser,
          messages: messages.slice(0, 10) // máximo 10 por conversación
        });
      }
    }

    return res.json({ results, searchTerm: q });

  } catch (err) {
    console.error("Error en búsqueda:", err);
    return res.status(500).json({ error: "Error en la búsqueda" });
  }
});

// Marcar mensajes como leídos en una conversación
router.post("/mark-read", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const { otherUser } = req.body;
    const currentUser = req.user.username;

    if (!otherUser) {
      return res.status(400).json({ error: "Se requiere el otro usuario" });
    }

    // Actualizar mensajes donde el destinatario es el usuario actual y no están leídos
    const result = await r.db(db)
      .table("private_messages")
      .filter({
        to: currentUser,
        from: otherUser,
        read: false
      })
      .update({ read: true })
      .run(conn);

    return res.json({ 
      success: true, 
      updated: result.replaced + result.unchanged 
    });

  } catch (err) {
    console.error("Error marcando como leído:", err);
    return res.status(500).json({ error: "Error al marcar mensajes como leídos" });
  }
});

// Obtener contadores de no leídos por conversación
router.get("/unread-counts", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const currentUser = req.user.username;

    const cursor = await r.db(db)
      .table("private_messages")
      .filter({ to: currentUser, read: false })
      .group("from")
      .count()
      .run(conn);

    const counts = await cursor.toArray();
    const unreadMap = {};
    counts.forEach(group => {
      unreadMap[group.group] = group.reduction;
    });

    return res.json({ unreadCounts: unreadMap });

  } catch (err) {
    console.error("Error obteniendo contadores:", err);
    return res.status(500).json({ error: "Error al obtener contadores" });
  }
});

// Marcar mensajes como leídos en una conversación
router.post("/mark-read", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const { otherUser } = req.body;
    const currentUser = req.user.username;

    if (!otherUser) {
      return res.status(400).json({ error: "Se requiere el otro usuario" });
    }

    // Actualizar mensajes donde el destinatario es el usuario actual y no están leídos
    const result = await r.db(db)
      .table("private_messages")
      .filter({
        to: currentUser,
        from: otherUser,
        read: false
      })
      .update({ read: true })
      .run(conn);

    return res.json({ 
      success: true, 
      updated: result.replaced + result.unchanged 
    });

  } catch (err) {
    console.error("Error marcando como leído:", err);
    return res.status(500).json({ error: "Error al marcar mensajes como leídos" });
  }
});

// Obtener contadores de no leídos por conversación
router.get("/unread-counts", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const currentUser = req.user.username;

    const cursor = await r.db(db)
      .table("private_messages")
      .filter({ to: currentUser, read: false })
      .group("from")
      .count()
      .run(conn);

    const counts = await cursor.toArray();
    const unreadMap = {};
    counts.forEach(group => {
      unreadMap[group.group] = group.reduction;
    });

    return res.json({ unreadCounts: unreadMap });

  } catch (err) {
    console.error("Error obteniendo contadores:", err);
    return res.status(500).json({ error: "Error al obtener contadores" });
  }
});

// EDITAR MENSAJE GENERAL
router.put("/edit-message/:messageId", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const { messageId } = req.params;
    const { newText } = req.body;
    const currentUser = req.user.username;

    if (!newText || newText.trim().length === 0) {
      return res.status(400).json({ error: "El mensaje no puede estar vacío" });
    }

    // Buscar el mensaje original
    const cursor = await r.db(db)
      .table("messages")
      .get(messageId)
      .run(conn);

    if (!cursor) {
      return res.status(404).json({ error: "Mensaje no encontrado" });
    }

    // Verificar que el usuario es el autor
    if (cursor.username !== currentUser && req.user.role !== "admin") {
      return res.status(403).json({ error: "No autorizado para editar este mensaje" });
    }

    // Guardar el texto original si es la primera edición
    const editEntry = {
      text: cursor.text,
      editedAt: new Date(),
      editedBy: currentUser
    };

    const editHistory = cursor.editHistory || [];
    editHistory.push(editEntry);

    // Actualizar el mensaje
    const result = await r.db(db)
      .table("messages")
      .get(messageId)
      .update({
        text: newText,
        edited: true,
        editHistory: editHistory,
        lastEditedAt: new Date(),
        lastEditedBy: currentUser,
        originalText: cursor.edited ? cursor.originalText : cursor.text
      })
      .run(conn);

    if (result.replaced === 0 && result.unchanged === 0) {
      return res.status(500).json({ error: "No se pudo actualizar el mensaje" });
    }

    // Obtener el mensaje actualizado
    const updatedMessage = await r.db(db)
      .table("messages")
      .get(messageId)
      .run(conn);

    res.json({ 
      success: true, 
      message: updatedMessage,
      editHistory: editHistory
    });

  } catch (err) {
    console.error("Error editando mensaje:", err);
    res.status(500).json({ error: "Error al editar el mensaje" });
  }
});

// EDITAR MENSAJE PRIVADO
router.put("/edit-private-message/:messageId", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const { messageId } = req.params;
    const { newText } = req.body;
    const currentUser = req.user.username;

    if (!newText || newText.trim().length === 0) {
      return res.status(400).json({ error: "El mensaje no puede estar vacío" });
    }

    const cursor = await r.db(db)
      .table("private_messages")
      .get(messageId)
      .run(conn);

    if (!cursor) {
      return res.status(404).json({ error: "Mensaje no encontrado" });
    }

    if (cursor.from !== currentUser && req.user.role !== "admin") {
      return res.status(403).json({ error: "No autorizado" });
    }

    const editEntry = {
      text: cursor.text,
      editedAt: new Date(),
      editedBy: currentUser
    };

    const editHistory = cursor.editHistory || [];
    editHistory.push(editEntry);

    const result = await r.db(db)
      .table("private_messages")
      .get(messageId)
      .update({
        text: newText,
        edited: true,
        editHistory: editHistory,
        lastEditedAt: new Date(),
        lastEditedBy: currentUser,
        originalText: cursor.edited ? cursor.originalText : cursor.text
      })
      .run(conn);

    const updatedMessage = await r.db(db)
      .table("private_messages")
      .get(messageId)
      .run(conn);

    res.json({ success: true, message: updatedMessage });

  } catch (err) {
    console.error("Error editando mensaje privado:", err);
    res.status(500).json({ error: "Error al editar el mensaje" });
  }
});

// BORRAR MENSAJE (soft delete)
router.delete("/delete-message/:messageId", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const { messageId } = req.params;
    const { type = "global" } = req.query;
    const currentUser = req.user.username;

    const table = type === "private" ? "private_messages" : "messages";
    
    const cursor = await r.db(db)
      .table(table)
      .get(messageId)
      .run(conn);

    if (!cursor) {
      return res.status(404).json({ error: "Mensaje no encontrado" });
    }

    const isAuthor = type === "private" 
      ? cursor.from === currentUser 
      : cursor.username === currentUser;

    if (!isAuthor && req.user.role !== "admin") {
      return res.status(403).json({ error: "No autorizado" });
    }

    // Soft delete - solo marcar como borrado
    const result = await r.db(db)
      .table(table)
      .get(messageId)
      .update({
        deleted: true,
        deletedAt: new Date(),
        deletedBy: currentUser,
        text: "[Mensaje eliminado]"
      })
      .run(conn);

    res.json({ success: true, messageId });

  } catch (err) {
    console.error("Error borrando mensaje:", err);
    res.status(500).json({ error: "Error al borrar el mensaje" });
  }
});

// OBTENER HISTORIAL DE EDICIONES
router.get("/message-history/:messageId", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const { messageId } = req.params;
    const { type = "global" } = req.query;

    const table = type === "private" ? "private_messages" : "messages";
    
    const message = await r.db(db)
      .table(table)
      .get(messageId)
      .run(conn);

    if (!message) {
      return res.status(404).json({ error: "Mensaje no encontrado" });
    }

    res.json({ 
      editHistory: message.editHistory || [],
      currentText: message.text,
      originalText: message.originalText,
      edited: message.edited || false,
      lastEditedAt: message.lastEditedAt,
      lastEditedBy: message.lastEditedBy
    });

  } catch (err) {
    console.error("Error obteniendo historial:", err);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

// Obtener perfil de un usuario
router.get("/user-profile/:username", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const { username } = req.params;
    
    const user = await r.db(db)
      .table("users")
      .filter({ username })
      .pluck("username", "avatar", "bio", "createdAt", "messageCount")
      .run(conn);
    
    const userList = await user.toArray();
    
    if (userList.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    
    res.json({ user: userList[0] });
  } catch (err) {
    console.error("Error obteniendo perfil:", err);
    res.status(500).json({ error: "Error al obtener perfil" });
  }
});

export default router;
