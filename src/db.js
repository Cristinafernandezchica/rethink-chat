import r from "rethinkdb";
import dotenv from "dotenv";

dotenv.config();

let connection = null;

export async function connectDB() {
  if (connection) return connection;

  const host = process.env.RAILWAY_TCP_PROXY_DOMAIN || process.env.RETHINK_HOST;
  const port = process.env.RETHINK_PORT || "28015";
  const db = process.env.RETHINK_DB || "rethinkchat";

  console.log("📡 Configuración de conexión:");
  console.log("   RETHINK_HOST:", host || "❌ NO DEFINIDO");
  console.log("   RETHINK_PORT:", port);
  console.log("   RETHINK_DB:", db);

  if (!host) {
    console.error("❌ No se pudo determinar el host de RethinkDB");
    throw new Error("Host de RethinkDB no configurado");
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