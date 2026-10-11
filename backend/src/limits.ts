import type { Request } from "express";
import { ipKeyGenerator, rateLimit, type Options } from "express-rate-limit";
import jwt from "jsonwebtoken";
import { PENDING_COOKIE, SESSION_COOKIE, readCookie } from "./auth.js";
import { envVar } from "./env.js";

/**
 * Rate limit em todos os endpoints (padrão do projeto). Resposta 429 com Retry-After.
 * Contador em memória: o Render free roda uma instância só. Com mais de uma, trocar o `store`
 * por um compartilhado (Redis ou Postgres).
 */
const MIN = 60_000;

/** Usuário da sessão (ou do login pendente de 2FA), validado; sem sessão, cai no IP. */
function userOrIp(req: Request): string {
  for (const cookie of [SESSION_COOKIE, PENDING_COOKIE]) {
    const token = readCookie(req, cookie);
    if (!token) continue;
    try {
      const sub = (jwt.verify(token, envVar("JWT_SECRET"), { algorithms: ["HS256"] }) as jwt.JwtPayload).sub;
      if (sub) return `user:${sub}`;
    } catch { /* token inválido: usa o IP */ }
  }
  return `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

const make = (limit: number, windowMs: number, extra: Partial<Options> = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Tente de novo em alguns minutos." },
    ...extra,
  });

export function createLimits() {
  // login, cadastro e 2FA: ~5 tentativas / 15 min (configurável para os testes de integração)
  const auth = Number(process.env.AUTH_RATE_LIMIT ?? 5);
  return {
    /** Erros de login por IP (login certo não conta). */
    loginIp: make(auth, 15 * MIN, { skipSuccessfulRequests: true }),
    /** Erros de login por conta: trava a força bruta numa conta mesmo vindo de vários IPs. */
    loginAccount: make(auth, 15 * MIN, {
      skipSuccessfulRequests: true,
      keyGenerator: (req) => `email:${String(req.body?.email ?? "").trim().toLowerCase()}`,
    }),
    register: make(auth, 15 * MIN),
    /** Códigos de 2FA: por usuário (inclusive o login pendente), para ninguém testar os 10⁶ códigos. */
    twoFactor: make(auth, 15 * MIN, { skipSuccessfulRequests: true, keyGenerator: userOrIp }),
    /** Escrita (POST/PUT/PATCH/DELETE): 30/min por usuário. */
    write: make(Number(process.env.WRITE_RATE_LIMIT ?? 30), MIN, {
      keyGenerator: userOrIp,
      skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
    }),
    /** Leitura: 120/min por usuário ou IP. */
    read: make(Number(process.env.READ_RATE_LIMIT ?? 120), MIN, {
      keyGenerator: userOrIp,
      skip: (req) => req.method !== "GET" && req.method !== "HEAD",
    }),
  };
}

export type Limits = ReturnType<typeof createLimits>;
