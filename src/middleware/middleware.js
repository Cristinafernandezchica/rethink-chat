import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// Para rutas que requieren autenticación, se verifica el token JWT
export const authRequired = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header)
    return res.status(401).json({ error: "Token no proporcionado" });

  const token = header.split(" ")[1];

  try {
    // Se verifica la validez del token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Añade los datos del usuario en req.user para uso posterior
    next(); // Continuar con la siguiente función de middleware o ruta
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
};
