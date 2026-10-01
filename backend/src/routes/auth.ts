import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAuth, signToken } from "../auth.js";

export const authRouter = Router();

const pub = (u: any) => ({ id: u.id, name: u.name, email: u.email, dailyMinutes: u.daily_minutes });
const creds = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(8) });

authRouter.post("/register", async (req, res) => {
  const p = creds.extend({ name: z.string().min(2).max(80) }).safeParse(req.body);
  if (!p.success) return void res.status(400).json({ error: "Dados inválidos (senha com no mínimo 8 caracteres)" });
  const hash = await bcrypt.hash(p.data.password, 10);
  try {
    const r = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, daily_minutes",
      [p.data.name, p.data.email, hash],
    );
    res.status(201).json({ token: signToken(r.rows[0].id), user: pub(r.rows[0]) });
  } catch (e: any) {
    if (e.code === "23505") return void res.status(409).json({ error: "Email já cadastrado" });
    throw e;
  }
});

authRouter.post("/login", async (req, res) => {
  const p = creds.safeParse(req.body);
  const fail = () => res.status(401).json({ error: "Email ou senha incorretos" });
  if (!p.success) return void fail();
  const r = await pool.query("SELECT * FROM users WHERE email = $1", [p.data.email]);
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(p.data.password, u.password_hash))) return void fail();
  res.json({ token: signToken(u.id), user: pub(u) });
});

authRouter.get("/me", requireAuth, async (_req, res) => {
  const r = await pool.query("SELECT id, name, email, daily_minutes FROM users WHERE id = $1", [res.locals.userId]);
  if (!r.rows[0]) return void res.status(401).json({ error: "Usuário não encontrado" });
  res.json(pub(r.rows[0]));
});

authRouter.put("/me", requireAuth, async (req, res) => {
  const p = z.object({ dailyMinutes: z.number().int().min(60).max(960) }).safeParse(req.body);
  if (!p.success) return void res.status(400).json({ error: "Jornada deve ficar entre 1h e 16h" });
  const r = await pool.query(
    "UPDATE users SET daily_minutes = $1 WHERE id = $2 RETURNING id, name, email, daily_minutes",
    [p.data.dailyMinutes, res.locals.userId],
  );
  res.json(pub(r.rows[0]));
});
