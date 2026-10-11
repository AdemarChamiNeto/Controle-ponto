import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      daily_minutes INT NOT NULL DEFAULT 480,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    CREATE TABLE IF NOT EXISTS punches (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      at TIMESTAMPTZ NOT NULL,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS punches_user_at ON punches (user_id, at);
    CREATE TABLE IF NOT EXISTS holidays (
      date DATE PRIMARY KEY,
      year INT NOT NULL,
      name TEXT NOT NULL
    );

    -- ===== 2FA (TOTP) — tabelas novas já no padrão; as antigas ficam como estão =====
    -- updated_at mantido pelo banco, não pela aplicação
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Credencial do segundo fator, separada do perfil (users). Uma por usuário: user_id é a própria chave.
    -- enabled_at NULL = QR gerado mas ainda não confirmado com um código.
    CREATE TABLE IF NOT EXISTS user_totp (
      -- CASCADE: a credencial não tem sentido sem o usuário
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret_encrypted TEXT NOT NULL,          -- SENSÍVEL: AES-256-GCM com TOTP_ENCRYPTION_KEY
      enabled_at TIMESTAMPTZ,
      last_used_step BIGINT,                   -- impede reusar o mesmo código dentro dos 30 s
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE OR REPLACE TRIGGER user_totp_updated_at BEFORE UPDATE ON user_totp
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TABLE IF NOT EXISTS recovery_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      -- CASCADE: códigos só valem para a conta dona
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL CHECK (length(code_hash) = 64), -- SENSÍVEL: SHA-256 do código, nunca o código
      used_at TIMESTAMPTZ,                     -- uso único
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      -- o índice único (user_id primeiro) também serve de índice da chave estrangeira
      UNIQUE (user_id, code_hash)
    );
    CREATE OR REPLACE TRIGGER recovery_codes_updated_at BEFORE UPDATE ON recovery_codes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}
