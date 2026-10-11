import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db.js";
import { endSession, pending2faUser, requireAuth, startPending2fa, startSession } from "../auth.js";
import type { Limits } from "../limits.js";
import { decrypt, encrypt, generateRecoveryCodes, hashRecoveryCode } from "../secrets.js";
import { generateSecret, otpauthUrl, verifyCode } from "../totp.js";

/** Custo do bcrypt (padrão do projeto: ≥ 12). Hashes antigos com custo menor são refeitos no login. */
export const BCRYPT_COST = 12;
// usado quando o email não existe, para o tempo de resposta não revelar quais emails têm conta
const DUMMY_HASH = bcrypt.hashSync("senha-que-ninguem-usa", BCRYPT_COST);

const pub = (u: any) => ({
  id: u.id, name: u.name, email: u.email, dailyMinutes: u.daily_minutes, twoFactorEnabled: Boolean(u.two_factor_enabled),
});
const USER_COLUMNS = `u.id, u.name, u.email, u.daily_minutes,
  EXISTS (SELECT 1 FROM user_totp t WHERE t.user_id = u.id AND t.enabled_at IS NOT NULL) AS two_factor_enabled`;
const findUser = async (id: number) => (await pool.query(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [id])).rows[0];

const creds = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(8).max(200) });
const codeSchema = z.object({ code: z.string().trim().min(6).max(20) });

/**
 * Confere o segundo fator: código de 6 dígitos do app ou um código de recuperação (uso único).
 * Atualiza o último passo usado / marca o código de recuperação como usado.
 */
async function checkSecondFactor(userId: number, code: string): Promise<boolean> {
  const t = (await pool.query(
    "SELECT secret_encrypted, last_used_step FROM user_totp WHERE user_id = $1 AND enabled_at IS NOT NULL",
    [userId],
  )).rows[0];
  if (!t) return false;
  if (/^\d{6}$/.test(code)) {
    const lastUsed = t.last_used_step === null ? null : Number(t.last_used_step);
    const step = verifyCode(decrypt(t.secret_encrypted), code, new Date(), lastUsed);
    if (step === null) return false;
    // só grava se ninguém usou um passo igual ou maior no meio tempo (duas requisições ao mesmo tempo)
    const r = await pool.query(
      "UPDATE user_totp SET last_used_step = $1 WHERE user_id = $2 AND (last_used_step IS NULL OR last_used_step < $1)",
      [step, userId],
    );
    return r.rowCount === 1;
  }
  const r = await pool.query(
    "UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL",
    [userId, hashRecoveryCode(code)],
  );
  return r.rowCount === 1;
}

export function createAuthRouter(l: Limits) {
  const r = Router();

  r.post("/register", l.register, async (req, res) => {
    const p = creds.extend({ name: z.string().min(2).max(80) }).safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: "Dados inválidos (senha com no mínimo 8 caracteres)" });
    const hash = await bcrypt.hash(p.data.password, BCRYPT_COST);
    try {
      const ins = await pool.query(
        "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
        [p.data.name, p.data.email, hash],
      );
      startSession(res, ins.rows[0].id);
      res.status(201).json({ user: pub(await findUser(ins.rows[0].id)) });
    } catch (e: any) {
      if (e.code === "23505") return void res.status(409).json({ error: "Email já cadastrado" });
      throw e;
    }
  });

  r.post("/login", l.loginIp, l.loginAccount, async (req, res) => {
    const p = creds.safeParse(req.body);
    const fail = () => res.status(401).json({ error: "Email ou senha incorretos" });
    if (!p.success) return void fail();
    const u = (await pool.query("SELECT id, password_hash FROM users WHERE email = $1", [p.data.email])).rows[0];
    const ok = await bcrypt.compare(p.data.password, u?.password_hash ?? DUMMY_HASH);
    if (!u || !ok) return void fail();

    if (bcrypt.getRounds(u.password_hash) < BCRYPT_COST) {
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(p.data.password, BCRYPT_COST), u.id]);
    }

    const user = await findUser(u.id);
    if (user.two_factor_enabled) {
      startPending2fa(res, u.id);
      return void res.json({ twoFactorRequired: true });
    }
    startSession(res, u.id);
    res.json({ user: pub(user) });
  });

  r.post("/login/2fa", l.twoFactor, async (req, res) => {
    const userId = pending2faUser(req);
    if (userId === null) return void res.status(401).json({ error: "Faça o login de novo" });
    const p = codeSchema.safeParse(req.body);
    if (!p.success || !(await checkSecondFactor(userId, p.data.code))) {
      return void res.status(401).json({ error: "Código inválido" });
    }
    startSession(res, userId);
    const left = (await pool.query(
      "SELECT count(*)::int AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL",
      [userId],
    )).rows[0].n;
    res.json({ user: pub(await findUser(userId)), recoveryCodesLeft: left });
  });

  r.post("/logout", (_req, res) => {
    endSession(res);
    res.status(204).end();
  });

  r.get("/me", requireAuth, async (_req, res) => {
    const u = await findUser(res.locals.userId);
    if (!u) return void res.status(401).json({ error: "Usuário não encontrado" });
    res.json(pub(u));
  });

  r.put("/me", requireAuth, async (req, res) => {
    const p = z.object({ dailyMinutes: z.number().int().min(60).max(960) }).safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: "Jornada deve ficar entre 1h e 16h" });
    await pool.query("UPDATE users SET daily_minutes = $1 WHERE id = $2", [p.data.dailyMinutes, res.locals.userId]);
    res.json(pub(await findUser(res.locals.userId)));
  });

  // ===== Ativar / desativar o 2FA (opcional, pela tela do usuário) =====

  /** Passo 1: gera o segredo e devolve a URL do QR code. Só passa a valer depois de confirmado com um código. */
  r.post("/2fa/setup", requireAuth, l.twoFactor, async (_req, res) => {
    const user = await findUser(res.locals.userId);
    if (user.two_factor_enabled) return void res.status(409).json({ error: "O 2FA já está ativo" });
    const secret = generateSecret();
    await pool.query(
      `INSERT INTO user_totp (user_id, secret_encrypted) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET secret_encrypted = EXCLUDED.secret_encrypted, last_used_step = NULL`,
      [user.id, encrypt(secret)],
    );
    res.json({ secret, otpauthUrl: otpauthUrl(secret, user.email) });
  });

  /** Passo 2: confirma com o primeiro código do app, ativa e devolve os códigos de recuperação (mostrados uma vez só). */
  r.post("/2fa/enable", requireAuth, l.twoFactor, async (req, res) => {
    const p = codeSchema.safeParse(req.body);
    const t = (await pool.query("SELECT secret_encrypted, enabled_at FROM user_totp WHERE user_id = $1", [res.locals.userId])).rows[0];
    if (!t) return void res.status(400).json({ error: "Gere o QR code primeiro" });
    if (t.enabled_at) return void res.status(409).json({ error: "O 2FA já está ativo" });
    const step = p.success ? verifyCode(decrypt(t.secret_encrypted), p.data.code, new Date()) : null;
    if (step === null) return void res.status(400).json({ error: "Código inválido. Confira o horário do celular e tente de novo." });

    const codes = generateRecoveryCodes();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE user_totp SET enabled_at = now(), last_used_step = $1 WHERE user_id = $2", [step, res.locals.userId]);
      await client.query("DELETE FROM recovery_codes WHERE user_id = $1", [res.locals.userId]);
      await client.query(
        "INSERT INTO recovery_codes (user_id, code_hash) SELECT $1, unnest($2::text[])",
        [res.locals.userId, codes.map(hashRecoveryCode)],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    res.json({ recoveryCodes: codes });
  });

  /** Desativar pede a senha e um código (do app ou de recuperação): quem pegou só a sessão não consegue. */
  r.post("/2fa/disable", requireAuth, l.twoFactor, async (req, res) => {
    const p = z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(20) }).safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: "Informe a senha e um código" });
    const u = (await pool.query("SELECT password_hash FROM users WHERE id = $1", [res.locals.userId])).rows[0];
    if (!(await bcrypt.compare(p.data.password, u.password_hash)) || !(await checkSecondFactor(res.locals.userId, p.data.code))) {
      return void res.status(401).json({ error: "Senha ou código incorretos" });
    }
    await pool.query("DELETE FROM user_totp WHERE user_id = $1", [res.locals.userId]);
    await pool.query("DELETE FROM recovery_codes WHERE user_id = $1", [res.locals.userId]);
    res.status(204).end();
  });

  return r;
}
