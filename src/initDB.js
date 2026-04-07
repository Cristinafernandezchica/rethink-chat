import r from "rethinkdb";
import dotenv from "dotenv";

dotenv.config();

/**
 * Script para inicialización de la base de datos con sus tablas necesarias.
 * Crea la BD, tablas e índices si no existen.
 */

async function init() {
  const conn = await r.connect({
    host: process.env.RETHINK_HOST,
    port: process.env.RETHINK_PORT
  });

  const dbName = process.env.RETHINK_DB;

  // Crear BD si no existe
  const dbList = await r.dbList().run(conn);
  if (!dbList.includes(dbName)) {
    await r.dbCreate(dbName).run(conn);
    console.log(`✔ Base de datos creada: ${dbName}`);
  } else {
    console.log(`✔ Base de datos ya existe: ${dbName}`);
  }

  // Crear tablas si no existen
  const tables = ["users", "messages", "private_messages", "alerts", "online_users"];

  const tableList = await r.db(dbName).tableList().run(conn);

  for (const table of tables) {
    if (!tableList.includes(table)) {
      await r.db(dbName).tableCreate(table).run(conn);
      console.log(`Tabla creada: ${table}`);
    } else {
      console.log(`Tabla ya existe: ${table}`);
    }

    // Crear índices necesarios
    if (table === "messages") {
      const indexes = await r.db(dbName).table("messages").indexList().run(conn);

      if (!indexes.includes("createdAt")) {
        await r.db(dbName).table("messages").indexCreate("createdAt").run(conn);
        await r.db(dbName).table("messages").indexWait("createdAt").run(conn);
        console.log("Índice creado: createdAt");
      } else {
        console.log("Índice 'createdAt' ya existe");
      }
    }

    if (table === "users") {
      const indexes = await r.db(dbName).table("users").indexList().run(conn);
      if (!indexes.includes("username")) {
        await r.db(dbName).table("users").indexCreate("username").run(conn);
        await r.db(dbName).table("users").indexWait("username").run(conn);
        console.log("Índice creado: username");
      }
    }

    if (table === "online_users") {
      const indexes = await r.db(dbName).table("online_users").indexList().run(conn);
      if (!indexes.includes("username")) {
        await r.db(dbName).table("online_users").indexCreate("username").run(conn);
        await r.db(dbName).table("online_users").indexWait("username").run(conn);
        console.log("Índice creado: username");
      }
    }
  }

  conn.close();
  console.log("Inicialización completada");
}

init().catch((err) => console.error(err));
