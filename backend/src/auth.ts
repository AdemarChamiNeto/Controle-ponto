import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET ausente ou curto (mínimo 16 caracteres)");
  return s;
}

export const signToken = (userId: number) =>
  jwt.sign({ sub: String(userId) }, secret(), { expiresIn: "7d" });

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return void res.status(401).json({ error: "Não autenticado" });
  try {
    const payload = jwt.verify(h.slice(7), secret()) as jwt.JwtPayload;
    res.locals.userId = Number(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: "Sessão inválida" });
  }
}
