import express from "express";
import r from "rethinkdb";
import { verifyTokenMiddleware } from "../auth.js";

const router = express.Router();
const db = process.env.RETHINK_DB;

// Obtener todos los usuarios registrados
router.get("/users", verifyTokenMiddleware, async (req, res) => {
  try {
    const conn = req.app.get("dbConn");

    const cursor = await r.db(db).table("users").pluck("username").run(conn);
    const users = await cursor.toArray();

    return res.json({ users });
  } catch (err) {
    console.error("Error obteniendo usuarios:", err);
    return res.status(500).json({ error: "Error obteniendo usuarios" });
  }
});

export default router;
