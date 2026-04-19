import r from "rethinkdb";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const db = process.env.RETHINK_DB;

// REGISTRO
export const register = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Faltan campos" });

    // Conexión a RethinkDB
    const conn = await r.connect({
      host: process.env.RETHINK_HOST,
      port: process.env.RETHINK_PORT
    });

    // Comprobar si el usuario ya existe
    const existing = await r.db(db).table("users")
      .filter({ username })
      .run(conn);

    const existingArr = await existing.toArray();
    if (existingArr.length > 0)
      return res.status(400).json({ error: "El usuario ya existe" });

    // Hash de contraseña
    const hashed = await bcrypt.hash(password, 10);

    // Insertar usuario con role
    await r.db(db).table("users").insert({
      id: r.uuid(),
      username,
      password: hashed,
      role: "user",
      createdAt: new Date(),
      avatar: username.charAt(0).toUpperCase(),  // Primera letra como avatar
      bio: "Hola, soy " + username,
      messageCount: 0
    }).run(conn);

    conn.close();

    return res.json({ message: "Usuario registrado correctamente" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
};

// INICIO DE SESIÓN
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Faltan campos" });

    const conn = await r.connect({
      host: process.env.RETHINK_HOST,
      port: process.env.RETHINK_PORT
    });

    // Buscar usuario en tabla users (incluyendo role)
    const cursor = await r.db(db).table("users")
      .filter({ username })
      .pluck("id", "username", "password", "role")
      .run(conn);

    const users = await cursor.toArray();
    if (users.length === 0)
      return res.status(400).json({ error: "Usuario no encontrado" });

    const user = users[0];

    // Validar contraseña
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ error: "Contraseña incorrecta" });

    // Token JWT con role incluido
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    conn.close();

    return res.json({
      message: "Login correcto",
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
};
