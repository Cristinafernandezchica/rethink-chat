import r from "rethinkdb";
import dotenv from "dotenv";

dotenv.config();

let connection = null;

export async function connectDB() {
  if (connection) return connection;

  connection = await r.connect({
    host: process.env.RETHINK_HOST,
    port: process.env.RETHINK_PORT,
    db: process.env.RETHINK_DB
  });

  console.log("✔ Conectado a RethinkDB");
  return connection;
}
