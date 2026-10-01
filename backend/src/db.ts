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
  `);
}
