import { pool } from "./db.js";

export interface Holiday { date: string; name: string }

const BRASIL_API = "https://brasilapi.com.br/api/feriados/v1";
const RETRY_AFTER_MS = 10 * 60 * 1000;
/** Ano → quando a última consulta falhou. Evita martelar a API se ela estiver fora do ar. */
const lastFailure = new Map<number, number>();

/**
 * Consulta os feriados nacionais do ano no webservice da BrasilAPI.
 * O `fetcher` é injetável para os testes não dependerem da internet.
 */
export async function fetchHolidays(year: number, fetcher: typeof fetch = fetch): Promise<Holiday[]> {
  const res = await fetcher(`${BRASIL_API}/${year}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`BrasilAPI respondeu ${res.status}`);
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new Error("Resposta inesperada da BrasilAPI");
  return body
    .filter((h): h is Holiday =>
      typeof h?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && typeof h?.name === "string")
    .map((h) => ({ date: h.date, name: h.name }));
}

/**
 * Feriados do ano como Map (data → nome), com cache no banco:
 * a API externa só é chamada uma vez por ano. Se ela estiver fora do ar,
 * o espelho continua funcionando — só sem feriados — e tenta de novo em 10 minutos.
 */
export async function getHolidays(year: number, fetcher: typeof fetch = fetch): Promise<Map<string, string>> {
  const cached = await pool.query(
    "SELECT to_char(date, 'YYYY-MM-DD') AS date, name FROM holidays WHERE year = $1",
    [year],
  );
  if (cached.rowCount) return new Map(cached.rows.map((r) => [r.date, r.name]));

  const failedAt = lastFailure.get(year);
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return new Map();

  let list: Holiday[];
  try {
    list = await fetchHolidays(year, fetcher);
    lastFailure.delete(year);
  } catch (err) {
    lastFailure.set(year, Date.now());
    console.warn(`[feriados] não foi possível consultar ${year}:`, (err as Error).message);
    return new Map();
  }

  for (const h of list) {
    await pool.query(
      "INSERT INTO holidays (date, year, name) VALUES ($1, $2, $3) ON CONFLICT (date) DO NOTHING",
      [h.date, year, h.name],
    );
  }
  return new Map(list.map((h) => [h.date, h.name]));
}
