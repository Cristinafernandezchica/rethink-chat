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

export default router;
