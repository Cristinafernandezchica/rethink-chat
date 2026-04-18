import r from "rethinkdb";
import dotenv from "dotenv";

dotenv.config();

let connection = null;

export async function connectDB() {
  if (connection) return connection;

  const host = process.env.RETHINK_HOST || 'localhost';
  const port = parseInt(process.env.RETHINK_PORT) || 28015;
  const db = process.env.RETHINK_DB || 'rethinkchat';

  console.log(`Conectando a RethinkDB en ${host}:${port}`);

  try {
    // Intentar conectar varias veces (para Docker)
    let retries = 5;
    while (retries > 0) {
      try {
        connection = await r.connect({
          host: host,
          port: port,
          db: db,
          timeout: 30
        });
        break;
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        console.log(`Reintentando conexión... (${retries} intentos restantes)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log("Conectado a RethinkDB");
    return connection;
  } catch (err) {
    console.error("Error conectando a RethinkDB:", err.message);
    throw err;
  }
}

// Función para cerrar conexión
export async function closeDB() {
  if (connection) {
    await connection.close();
    connection = null;
  }
}