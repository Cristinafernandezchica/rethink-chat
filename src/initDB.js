import r from "rethinkdb";
import dotenv from "dotenv";

dotenv.config();

/**
 * Script para inicialización de la base de datos con sus tablas necesarias. 
 * Se ejecuta al iniciar el servidor, pero solo crea lo que no existe, no borra ni modifica nada.
 **/ 

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
    console.log(`Base de datos creada: ${dbName}`);
  } else {
    console.log(`Base de datos ya existe: ${dbName}`);
  }

  const tables = ["users", "messages", "private_messages", "alerts"];

  for (const table of tables) {
    const tableList = await r.db(dbName).tableList().run(conn);

    if (!tableList.includes(table)) {
      await r.db(dbName).tableCreate(table).run(conn);
      console.log(`Tabla creada: ${table}`);
    } else {
      console.log(`Tabla ya existe: ${table}`);
    }
  }

  conn.close();
  console.log("Inicialización completada");
}

init().catch((err) => console.error(err));
