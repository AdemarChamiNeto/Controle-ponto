import { z } from "zod";

/** Chave de 32 bytes (AES-256) em hex ou base64. */
export function decodeKey(s: string): Buffer | null {
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, "hex");
  if (!/^[A-Za-z0-9+/_-]{43}=?$/.test(s)) return null;
  const b = Buffer.from(s, "base64");
  return b.length === 32 ? b : null;
}

/** Variáveis obrigatórias: o servidor nem sobe se faltar alguma (`index.ts` chama `env()` antes de tudo). */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "defina DATABASE_URL"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET ausente ou curto (mínimo 16 caracteres)"),
  TOTP_ENCRYPTION_KEY: z
    .string({ error: (i) => (i.input === undefined ? "defina TOTP_ENCRYPTION_KEY (gere com: openssl rand -hex 32)" : undefined) })
    .refine((s) => decodeKey(s) !== null, "TOTP_ENCRYPTION_KEY deve ter 32 bytes: 64 caracteres hex (openssl rand -hex 32) ou base64 (o generateValue do Render)"),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof schema>;

const fail = (issues: z.ZodIssue[]) => new Error("Configuração inválida: " + issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));

/** Valida tudo de uma vez (na subida do servidor). */
export function env(): Env {
  const r = schema.safeParse(process.env);
  if (!r.success) throw fail(r.error.issues);
  return r.data;
}

/** Lê e valida uma variável só (quem precisa só da chave não depende do resto). */
export function envVar<K extends keyof Env>(name: K): Env[K] {
  const r = schema.shape[name].safeParse(process.env[name]);
  if (!r.success) throw fail(r.error.issues.map((i) => ({ ...i, path: [name] })));
  return r.data as Env[K];
}
