import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role || "user",
    },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

export function verifyTokenMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: "Token requerido" });
  }

  const token = header.replace("Bearer ", "");

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}