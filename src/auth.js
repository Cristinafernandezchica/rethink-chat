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

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
