import r from "rethinkdb";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config();

/**
 * Función para inicializar/verificar la base de datos
 * Crea la BD, tablas e índices si no existen.
 * También crea un usuario admin por defecto si no existe.
 */
export async function initDatabase() {
  const conn = await r.connect({
    host: process.env.RETHINK_HOST,
    port: parseInt(process.env.RETHINK_PORT)
  });

  const dbName = process.env.RETHINK_DB;

  // Crear BD si no existe
  const dbList = await r.dbList().run(conn);
  if (!dbList.includes(dbName)) {
    await r.dbCreate(dbName).run(conn);
    console.log(`[INFO] Base de datos creada: ${dbName}`);
  } else {
    console.log(`[INFO] Base de datos ya existe: ${dbName}`);
  }

  // Crear tablas si no existen
  const tables = ["users", "messages", "private_messages", "alerts", "online_users"];

  const tableList = await r.db(dbName).tableList().run(conn);

  for (const table of tables) {
    if (!tableList.includes(table)) {
      await r.db(dbName).tableCreate(table).run(conn);
      console.log(`[INFO] Tabla creada: ${table}`);
    } else {
      console.log(`[INFO] Tabla ya existe: ${table}`);
    }
  }

  // --- MIGRACIÓN: Añadir campos de edición/borrado a mensajes existentes ---
  try {
    // Migrar mensajes generales
    const messagesNeedUpdate = await r.db(dbName)
      .table("messages")
      .filter(r.row.hasFields("edited").not())
      .update({
        edited: false,
        editHistory: [],
        deleted: false,
        originalText: null,
        lastEditedAt: null,
        lastEditedBy: null,
        deletedAt: null,
        deletedBy: null
      })
      .run(conn);
    
    if (messagesNeedUpdate.replaced > 0 || messagesNeedUpdate.unchanged > 0) {
      console.log(`[INFO] Migrados ${messagesNeedUpdate.replaced} mensajes con nuevos campos`);
    }
  } catch (err) {
    console.log("[INFO] No fue necesario migrar mensajes o ya están actualizados");
  }

  try {
    // Migrar mensajes privados
    const privateNeedUpdate = await r.db(dbName)
      .table("private_messages")
      .filter(r.row.hasFields("edited").not())
      .update({
        edited: false,
        editHistory: [],
        deleted: false,
        originalText: null,
        lastEditedAt: null,
        lastEditedBy: null,
        deletedAt: null,
        deletedBy: null
      })
      .run(conn);
    
    if (privateNeedUpdate.replaced > 0 || privateNeedUpdate.unchanged > 0) {
      console.log(`[INFO] Migrados ${privateNeedUpdate.replaced} mensajes privados con nuevos campos`);
    }
  } catch (err) {
    console.log("[INFO] No fue necesario migrar mensajes privados");
  }

  // --- CREAR ÍNDICES (después de que todas las tablas existen) ---
  
  // Índices para tabla "messages"
  try {
    const messagesIndexes = await r.db(dbName).table("messages").indexList().run(conn);
    
    if (!messagesIndexes.includes("createdAt")) {
      await r.db(dbName).table("messages").indexCreate("createdAt").run(conn);
      console.log("[INFO] Índice 'createdAt' creado en messages");
    }
    
    // Índice de búsqueda de texto
    if (!messagesIndexes.includes("search")) {
      await r.db(dbName).table("messages").indexCreate("search", r.row("text"), { multi: true });
      console.log("[INFO] Índice de búsqueda 'search' creado en messages");
    }
    
    await r.db(dbName).table("messages").indexWait().run(conn);
    console.log("[INFO] Índices de messages listos");
  } catch (err) {
    console.error("[ERROR] Error creando índices en messages:", err.message);
  }

  // Índices para tabla "users"
  try {
    const usersIndexes = await r.db(dbName).table("users").indexList().run(conn);
    
    if (!usersIndexes.includes("username")) {
      await r.db(dbName).table("users").indexCreate("username").run(conn);
      console.log("[INFO] Índice 'username' creado en users");
    }
    
    await r.db(dbName).table("users").indexWait().run(conn);
  } catch (err) {
    console.error("[ERROR] Error creando índices en users:", err.message);
  }

  // Índices para tabla "online_users"
  try {
    const onlineIndexes = await r.db(dbName).table("online_users").indexList().run(conn);
    
    if (!onlineIndexes.includes("username")) {
      await r.db(dbName).table("online_users").indexCreate("username").run(conn);
      console.log("[INFO] Índice 'username' creado en online_users");
    }
    
    await r.db(dbName).table("online_users").indexWait().run(conn);
  } catch (err) {
    console.error("[ERROR] Error creando índices en online_users:", err.message);
  }

  // Índices para tabla "private_messages"
  try {
    const privateIndexes = await r.db(dbName).table("private_messages").indexList().run(conn);
    
    if (!privateIndexes.includes("createdAt")) {
      await r.db(dbName).table("private_messages").indexCreate("createdAt").run(conn);
      console.log("[INFO] Índice 'createdAt' creado en private_messages");
    }
    
    // Índice compuesto para búsqueda eficiente de conversaciones
    if (!privateIndexes.includes("conversation")) {
      await r.db(dbName).table("private_messages").indexCreate("conversation", [r.row("from"), r.row("to")]);
      console.log("[INFO] Índice 'conversation' creado en private_messages");
    }
    
    await r.db(dbName).table("private_messages").indexWait().run(conn);
  } catch (err) {
    console.error("[ERROR] Error creando índices en private_messages:", err.message);
  }

  // --- CREAR USUARIO ADMIN POR DEFECTO ---
  try {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin";
    
    const existingAdmin = await r.db(dbName)
      .table("users")
      .filter({ username: adminUsername })
      .run(conn);
    
    const adminArray = await existingAdmin.toArray();
    
    if (adminArray.length === 0) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      await r.db(dbName).table("users").insert({
        username: adminUsername,
        password: hashedPassword,
        role: "admin",
        createdAt: new Date(),
        isDefaultAdmin: true
      }).run(conn);
      
      console.log(`[INFO] Usuario admin creado: ${adminUsername} / ${adminPassword}`);
      console.log("[INFO] CAMBIA LA CONTRASEÑA EN PRODUCCIÓN");
    } else {
      console.log(`[INFO] Usuario admin ya existe: ${adminUsername}`);
    }
  } catch (err) {
    console.error("[ERROR] Error creando usuario admin:", err.message);
  }

  // --- Crear mensajes de ejemplo si la tabla está vacía ---
  try {
    const messageCount = await r.db(dbName).table("messages").count().run(conn);
    
    if (messageCount === 0) {
      console.log("[INFO] Creando mensajes de ejemplo...");
      await r.db(dbName).table("messages").insert([
        {
          id: r.uuid(),
          username: "system",
          text: "¡Bienvenido al chat! Este es un mensaje de ejemplo.",
          createdAt: new Date(),
          edited: false,
          editHistory: [],
          deleted: false
        },
        {
          id: r.uuid(),
          username: "system",
          text: "Los mensajes privados funcionan haciendo clic en cualquier usuario.",
          createdAt: new Date(Date.now() - 60000),
          edited: false,
          editHistory: [],
          deleted: false
        }
      ]).run(conn);
      console.log("[INFO] Mensajes de ejemplo creados");
    }
  } catch (err) {
    console.error("[ERROR] Error creando mensajes de ejemplo:", err.message);
  }

  conn.close();
  console.log("Inicialización completada con éxito");
}

// Ejecutar directamente si se llama al script
if (import.meta.url === `file://${process.argv[1]}`) {
  initDatabase().catch((err) => {
    console.error("[ERROR] Error fatal en initDatabase:", err);
    process.exit(1);
  });
}