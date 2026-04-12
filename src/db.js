import r from "rethinkdb";
import dotenv from "dotenv";

// No cargar dotenv en producción (Railway)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

let connection = null;

// Detectar si estamos en fase de build/install
const isBuilding = () => {
  return (
    process.env.npm_lifecycle_event === 'install' ||
    process.env.npm_lifecycle_event === 'postinstall' ||
    process.env.NODE_ENV === 'build' ||
    process.env.RAILWAY_BUILD === 'true'
  );
};

export async function connectDB() {
  // Si estamos en build, no intentar conectar
  if (isBuilding()) {
    console.log("⚠️  Skipping database connection during build phase");
    return null;
  }
  
  if (connection) return connection;

  const host = process.env.RETHINK_HOST;
  const port = process.env.RETHINK_PORT;
  const db = process.env.RETHINK_DB;

  console.log("Configuración de conexión:");
  console.log("   RETHINK_HOST:", host || "NO DEFINIDO");
  console.log("   RETHINK_PORT:", port || "NO DEFINIDO");
  console.log("   RETHINK_DB:", db || "NO DEFINIDO");

  if (!host || !port || !db) {
    console.error("Faltan variables de entorno para conectar a RethinkDB");
    throw new Error("Variables de entorno de RethinkDB no configuradas");
  }

  try {
    connection = await r.connect({
      host: host,
      port: parseInt(port),
      db: db,
      timeout: 30
    });

    console.log("Conectado a RethinkDB en", `${host}:${port}`);
    return connection;
  } catch (err) {
    console.error("Error conectando a RethinkDB:", err.message);
    throw err;
  }
}