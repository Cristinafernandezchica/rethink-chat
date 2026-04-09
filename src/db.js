import r from "rethinkdb";
import dotenv from "dotenv";

dotenv.config();

let connection = null;

export async function connectDB() {
  if (connection) return connection;

  const host = process.env.RETHINK_HOST;
  const port = process.env.RETHINK_PORT;
  const db = process.env.RETHINK_DB;

  // Log para ver qué valores está usando
  console.log("📡 Configuración de conexión:");
  console.log("   RETHINK_HOST:", host || "❌ NO DEFINIDO");
  console.log("   RETHINK_PORT:", port || "❌ NO DEFINIDO");
  console.log("   RETHINK_DB:", db || "❌ NO DEFINIDO");

  if (!host || !port || !db) {
    throw new Error("Faltan variables de entorno. Configura RETHINK_HOST, RETHINK_PORT y RETHINK_DB en Railway");
  }

  try {
    connection = await r.connect({
      host: host,
      port: parseInt(port),
      db: db,
      timeout: 30
    });

    console.log("✔ Conectado a RethinkDB en", `${host}:${port}`);
    return connection;
  } catch (err) {
    console.error("❌ Error conectando a RethinkDB:", err.message);
    throw err;
  }
}