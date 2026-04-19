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

// ESTADÍSTICAS CON MAPREDUCE (INCLUYENDO MENSAJES PRIVADOS)
router.get("/stats/mapreduce", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const currentUser = req.user;

    // Solo administradores pueden ver estadísticas
    if (currentUser.role !== "admin") {
      return res.status(403).json({ error: "Acceso denegado. Se requieren permisos de administrador." });
    }

    // Obtener parámetro de fuerza de actualización
    const forceRefresh = req.query.refresh === 'true';

    const stats = {};

    // OBTENER TODOS LOS MENSAJES (GLOBALES + PRIVADOS)
    const [globalMessages, privateMessages] = await Promise.all([
      r.db(db).table("messages")
        .filter(r.row("deleted").eq(false))
        .run(conn),
      r.db(db).table("private_messages")
        .filter(r.row("deleted").eq(false))
        .run(conn)
    ]);

    const allGlobalMessages = await globalMessages.toArray();
    const allPrivateMessages = await privateMessages.toArray();

    // COMBINAR TODOS LOS MENSAJES PARA ESTADÍSTICAS GLOBALES
    // Convertir mensajes privados al formato de los globales para análisis unificado
    const allMessages = [
      ...allGlobalMessages.map(msg => ({
        ...msg,
        type: 'global',
        username: msg.username
      })),
      ...allPrivateMessages.map(msg => ({
        ...msg,
        type: 'private',
        username: msg.from // Para estadísticas, contamos al emisor
      }))
    ];

    stats.totalMessages = allMessages.length;
    stats.globalMessages = allGlobalMessages.length;
    stats.privateMessages = allPrivateMessages.length;

    // --- MAPREDUCE 1: Palabras más frecuentes (incluyendo privados) ---
    const wordMap = new Map();
    const stopWords = new Set(['para', 'como', 'que', 'una', 'por', 'con', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'durante', 'mediante', 'contra', 'ante', 'bajo', 'cabe', 'vs', 'y', 'o', 'pero', 'sino', 'aunque', 'porque', 'pues', 'asi', 'entonces', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella', 'aquellos', 'aquellas']);

    allMessages.forEach(msg => {
      if (!msg.text || msg.deleted) return;

      const words = msg.text
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Eliminar tildes
        .replace(/[.,!?;:()"''\-¿¡@#$%^&*()_+=[\]{}|\\<>]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.has(word));

      words.forEach(word => {
        wordMap.set(word, (wordMap.get(word) || 0) + 1);
      });
    });

    const topWords = Array.from(wordMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word, count]) => ({ word, count }));

    stats.topWords = topWords;

    // --- MAPREDUCE 2: Usuarios más activos (global + privado) ---
    const userMap = new Map();

    allMessages.forEach(msg => {
      const username = msg.username;
      userMap.set(username, (userMap.get(username) || 0) + 1);
    });

    // También contar mensajes recibidos en privado (como actividad pasiva)
    const receivedMap = new Map();
    allPrivateMessages.forEach(msg => {
      const receiver = msg.to;
      receivedMap.set(receiver, (receivedMap.get(receiver) || 0) + 1);
    });

    const topUsers = Array.from(userMap.entries())
      .map(([username, sentCount]) => ({
        username,
        sentMessages: sentCount,
        receivedMessages: receivedMap.get(username) || 0,
        totalActivity: sentCount + (receivedMap.get(username) || 0)
      }))
      .sort((a, b) => b.totalActivity - a.totalActivity)
      .slice(0, 10);

    stats.topUsers = topUsers;

    // --- MAPREDUCE 3: Actividad por hora del día ---
    const hourMap = new Map();

    allMessages.forEach(msg => {
      const hour = new Date(msg.createdAt).getHours();
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
    });

    const activityByHour = Array.from(hourMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => ({
        hour,
        count,
        hourLabel: `${hour.toString().padStart(2, '0')}:00`,
        percentage: Math.round((count / allMessages.length) * 100)
      }));

    stats.activityByHour = activityByHour;

    // --- MAPREDUCE 4: Longitud promedio de mensajes por usuario ---
    const userLengthMap = new Map();

    allMessages.forEach(msg => {
      const username = msg.username;
      const length = msg.text?.length || 0;

      if (!userLengthMap.has(username)) {
        userLengthMap.set(username, { total: 0, count: 0 });
      }
      const userData = userLengthMap.get(username);
      userData.total += length;
      userData.count += 1;
      userLengthMap.set(username, userData);
    });

    const avgLengthByUser = Array.from(userLengthMap.entries())
      .map(([username, data]) => ({
        username,
        avgLength: Math.round(data.total / data.count),
        messageCount: data.count,
        totalLength: data.total
      }))
      .sort((a, b) => b.avgLength - a.avgLength)
      .slice(0, 10);

    stats.avgLengthByUser = avgLengthByUser;

    // --- MAPREDUCE 5: Palabras más usadas por usuario (top 5) ---
    const top5Users = topUsers.slice(0, 5).map(u => u.username);
    const userWordsStats = {};

    for (const username of top5Users) {
      const wordCount = new Map();
      const userMessages = allMessages.filter(msg => msg.username === username);

      userMessages.forEach(msg => {
        if (!msg.text || msg.deleted) return;

        const words = msg.text
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[.,!?;:()"''\-¿¡@#$%^&*()_+=[\]{}|\\<>]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 3 && !stopWords.has(word));

        words.forEach(word => {
          wordCount.set(word, (wordCount.get(word) || 0) + 1);
        });
      });

      const topUserWords = Array.from(wordCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word, count]) => ({ word, count }));

      userWordsStats[username] = {
        totalMessages: userMessages.length,
        topWords: topUserWords
      };
    }

    stats.userWordsStats = userWordsStats;

    // --- ESTADÍSTICAS DE CONVERSACIONES PRIVADAS ---
    const privateConversations = new Map();

    allPrivateMessages.forEach(msg => {
      const participants = [msg.from, msg.to].sort().join("|");
      if (!privateConversations.has(participants)) {
        privateConversations.set(participants, {
          user1: msg.from,
          user2: msg.to,
          count: 0,
          lastMessageAt: msg.createdAt
        });
      }
      const conv = privateConversations.get(participants);
      conv.count++;
      if (msg.createdAt > conv.lastMessageAt) {
        conv.lastMessageAt = msg.createdAt;
      }
    });

    const topConversations = Array.from(privateConversations.entries())
      .map(([key, data]) => ({
        user1: data.user1,
        user2: data.user2,
        messageCount: data.count,
        lastMessageAt: data.lastMessageAt
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 5);

    stats.privateStats = {
      totalPrivateMessages: allPrivateMessages.length,
      totalConversations: privateConversations.size,
      topConversations
    };

    // --- ESTADÍSTICAS DE ACTIVIDAD POR DÍA DE LA SEMANA ---
    const dayMap = new Map();
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    allMessages.forEach(msg => {
      const day = new Date(msg.createdAt).getDay();
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    });

    const activityByDay = Array.from(dayMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, count]) => ({
        day: dayNames[day],
        dayIndex: day,
        count,
        percentage: Math.round((count / allMessages.length) * 100)
      }));

    stats.activityByDay = activityByDay;

    // Metadata
    stats.generatedAt = new Date();
    stats.timeRange = {
      from: allMessages[0]?.createdAt || new Date(),
      to: allMessages[allMessages.length - 1]?.createdAt || new Date()
    };

    res.json({ success: true, stats });

  } catch (err) {
    console.error("Error generando estadísticas MapReduce:", err);
    res.status(500).json({ error: "Error al generar estadísticas" });
  }
});

// Endpoint para obtener estadísticas en tiempo real (actualización push)
router.get("/stats/live", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const currentUser = req.user;

    if (currentUser.role !== "admin") {
      return res.status(403).json({ error: "Acceso denegado" });
    }

    // Obtener estadísticas de los últimos 5 minutos (global + privado)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [recentGlobal, recentPrivate] = await Promise.all([
      r.db(db)
        .table("messages")
        .filter(r.row("createdAt").ge(fiveMinutesAgo))
        .filter(r.row("deleted").eq(false))
        .run(conn),
      r.db(db)
        .table("private_messages")
        .filter(r.row("createdAt").ge(fiveMinutesAgo))
        .filter(r.row("deleted").eq(false))
        .run(conn)
    ]);

    const globalMessages = await recentGlobal.toArray();
    const privateMessages = await recentPrivate.toArray();

    const allRecentMessages = [...globalMessages, ...privateMessages];
    const activeUsers = new Set([
      ...globalMessages.map(m => m.username),
      ...privateMessages.map(m => m.from),
      ...privateMessages.map(m => m.to)
    ]);

    // Mensajes por minuto
    const messagesPerMinute = Math.round(allRecentMessages.length / 5);

    // Top palabras en los últimos 5 minutos (para tendencias)
    const recentWordMap = new Map();
    const stopWords = new Set(['para', 'como', 'que', 'una', 'por', 'con', 'sin', 'el', 'la', 'los', 'las', 'un', 'una']);

    allRecentMessages.forEach(msg => {
      if (!msg.text) return;
      const words = msg.text.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
      words.forEach(word => {
        recentWordMap.set(word, (recentWordMap.get(word) || 0) + 1);
      });
    });

    const trendingWords = Array.from(recentWordMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({ word, count }));

    res.json({
      success: true,
      realtime: {
        messagesLast5Min: allRecentMessages.length,
        globalMessagesLast5Min: globalMessages.length,
        privateMessagesLast5Min: privateMessages.length,
        messagesPerMinute,
        activeUsersLast5Min: activeUsers.size,
        trendingWords,
        timestamp: new Date()
      }
    });

  } catch (err) {
    console.error("Error generando estadísticas en tiempo real:", err);
    res.status(500).json({ error: "Error al generar estadísticas" });
  }
});


// Actualizar ubicación del usuario
router.post("/location/update", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const { lat, lng } = req.body;
    const username = req.user.username;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: "Se requieren latitud y longitud" });
    }

    // Validar coordenadas
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Coordenadas inválidas" });
    }

    // PRIMERO: Eliminar cualquier ubicación existente de este usuario
    await r.db(db)
      .table("user_locations")
      .filter({ username })
      .delete()
      .run(conn);

    // SEGUNDO: Insertar la nueva ubicación
    await r.db(db)
      .table("user_locations")
      .insert({
        username,
        location: r.point(lng, lat),
        updatedAt: new Date(),
        lastSeen: new Date()
      })
      .run(conn);

    // Limpiar ubicaciones antiguas
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await r.db(db)
      .table("user_locations")
      .filter(r.row("updatedAt").lt(oneHourAgo))
      .delete()
      .run(conn);

    res.json({ success: true, message: "Ubicación actualizada" });

  } catch (err) {
    console.error("Error actualizando ubicación:", err);
    res.status(500).json({ error: "Error al actualizar ubicación" });
  }
});

// Obtener ubicación de un usuario específico
router.get("/location/user/:username", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const { username } = req.params;

    const cursor = await r.db(db)
      .table("user_locations")
      .filter({ username })
      .run(conn);

    const locations = await cursor.toArray();

    if (locations.length === 0) {
      return res.json({ success: true, location: null });
    }

    const loc = locations[0];
    res.json({
      success: true,
      location: {
        username: loc.username,
        lat: loc.location.coordinates[1],
        lng: loc.location.coordinates[0],
        updatedAt: loc.updatedAt
      }
    });

  } catch (err) {
    console.error("Error obteniendo ubicación:", err);
    res.status(500).json({ error: "Error al obtener ubicación" });
  }
});

// Obtener usuarios cercanos
router.get("/location/nearby", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const { lat, lng, radius = 5 } = req.query;
    const currentUser = req.user.username;

    if (!lat || !lng) {
      return res.status(400).json({ error: "Se requieren latitud y longitud" });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseFloat(radius);

    // Encuentra todos los usuarios dentro del radio especificado
    const cursor = await r.db(db)
      .table("user_locations")
      // Filtrar por distancia usando el índice geoespacial
      .getNearest(
        r.point(lngNum, latNum),
        {
          index: "location",
          maxResults: 50,
          unit: "km",
          maxDist: radiusNum
        }
      )
      .run(conn);

    const nearby = await cursor.toArray();

    // Filtrar al usuario actual y formatear resultados
    const users = nearby
      .filter(item => item.doc.username !== currentUser)
      .map(item => ({
        username: item.doc.username,
        distance: Math.round(item.dist * 100) / 100,
        location: {
          lat: item.doc.location.coordinates[1],
          lng: item.doc.location.coordinates[0]
        },
        updatedAt: item.doc.updatedAt
      }));

    res.json({
      success: true,
      users,
      center: { lat: latNum, lng: lngNum },
      radius: radiusNum
    });

  } catch (err) {
    console.error("Error buscando usuarios cercanos:", err);
    res.status(500).json({ error: "Error al buscar usuarios cercanos" });
  }
});

// Obtener todos los usuarios con ubicación activa
router.get("/location/all", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const currentUser = req.user.username;

    const cursor = await r.db(db)
      .table("user_locations")
      .filter(r.row("username").ne(currentUser))
      .run(conn);

    const locations = await cursor.toArray();

    // Eliminar duplicados por username
    const uniqueLocations = [];
    const seen = new Set();
    for (const loc of locations) {
      if (!seen.has(loc.username)) {
        seen.add(loc.username);
        uniqueLocations.push(loc);
      }
    }

    const users = uniqueLocations.map(loc => ({
      username: loc.username,
      lat: loc.location.coordinates[1],
      lng: loc.location.coordinates[0],
      updatedAt: loc.updatedAt
    }));

    res.json({ success: true, users });

  } catch (err) {
    console.error("Error obteniendo todas las ubicaciones:", err);
    res.status(500).json({ error: "Error al obtener ubicaciones" });
  }
});

// Eliminar ubicación (dejar de compartir)
router.delete("/location/delete", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");
    const username = req.user.username;

    await r.db(db)
      .table("user_locations")
      .filter({ username })
      .delete()
      .run(conn);

    res.json({ success: true, message: "Ubicación eliminada" });

  } catch (err) {
    console.error("Error eliminando ubicación:", err);
    res.status(500).json({ error: "Error al eliminar ubicación" });
  }
});

export default router;
