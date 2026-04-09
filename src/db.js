import r from "rethinkdb";
import dotenv from "dotenv";

dotenv.config();

let connection = null;

export async function connectDB(retries = 5, delay = 2000) {
  if (connection) return connection;
  
  const host = process.env.RETHINK_HOST || 'localhost';
  const port = process.env.RETHINK_PORT || 28015;
  const db = process.env.RETHINK_DB || 'rethinkchat';

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Intentando conectar a RethinkDB en ${host}:${port} (intento ${i + 1}/${retries})...`);
      
      connection = await r.connect({
        host,
        port,
        db
      });
      
      console.log("✔ Conectado a RethinkDB");
      return connection;
    } catch (err) {
      console.error(`Error conectando a RethinkDB: ${err.message}`);
      if (i < retries - 1) {
        console.log(`Reintentando en ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
}