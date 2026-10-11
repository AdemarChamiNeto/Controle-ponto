import jwt from "jsonwebtoken";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import { envVar } from "./env.js";

/**
 * A sessão fica num cookie httpOnly: o JavaScript da página não consegue ler, então um XSS não
 * rouba o token. Front e API saem do mesmo domínio, então SameSite=Lax basta contra CSRF
 * (o navegador não manda o cookie em POST vindo de outro site).
 */
export const SESSION_COOKIE = "ponto_session";
/** Depois da senha certa, quem tem 2FA ganha só este cookie curto, que vale apenas para enviar o código. */
export const PENDING_COOKIE = "ponto_2fa";

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 dias, em segundos
const PENDING_TTL = 5 * 60; // 5 minutos para digitar o código

const cookieOptions = (maxAgeSeconds: number): CookieOptions => ({
  httpOnly: true,
  secure: envVar("NODE_ENV") === "production",
  sameSite: "lax",
  path: "/api",
  maxAge: maxAgeSeconds * 1000,
});

type Purpose = "session" | "2fa";

const sign = (userId: number, purpose: Purpose, ttl: number) =>
  jwt.sign({ sub: String(userId), purpose }, envVar("JWT_SECRET"), { expiresIn: ttl });

function read(req: Request, cookie: string, purpose: Purpose): number | null {
  const token = readCookie(req, cookie);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, envVar("JWT_SECRET"), { algorithms: ["HS256"] }) as jwt.JwtPayload;
    return payload.purpose === purpose ? Number(payload.sub) : null;
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function startSession(res: Response, userId: number) {
  res.clearCookie(PENDING_COOKIE, { path: "/api" });
  res.cookie(SESSION_COOKIE, sign(userId, "session", SESSION_TTL), cookieOptions(SESSION_TTL));
}

export function endSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/api" });
  res.clearCookie(PENDING_COOKIE, { path: "/api" });
}

export const startPending2fa = (res: Response, userId: number) =>
  res.cookie(PENDING_COOKIE, sign(userId, "2fa", PENDING_TTL), cookieOptions(PENDING_TTL));

export const pending2faUser = (req: Request) => read(req, PENDING_COOKIE, "2fa");

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = read(req, SESSION_COOKIE, "session");
  if (userId === null) return void res.status(401).json({ error: "Não autenticado" });
  res.locals.userId = userId;
  next();
}
