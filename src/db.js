import r from "rethinkdb";
import dotenv from "dotenv";

dotenv.config();

let connection = null;

export async function connectDB() {
  if (connection) return connection;

  const host = process.env.RETHINK_HOST;
  const port = parseInt(process.env.RETHINK_PORT) || 28015;
  const db = process.env.RETHINK_DB;

  console.log(`Intentando conectar a RethinkDB en ${host}:${port}...`);

  try {
    connection = await r.connect({
      host: host,
      port: port,
      db: db
    });
    
    console.log("✔ Conectado a RethinkDB");
    return connection;
  } catch (err) {
    console.error("Error conectando a RethinkDB:", err);
    throw err;
  }
}