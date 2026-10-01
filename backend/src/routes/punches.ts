import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { buildReport, dayKey } from "../calc.js";
import { getHolidays } from "../holidays.js";
import { reportToXml } from "../xml.js";

export const punchRouter = Router();
punchRouter.use(requireAuth);

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const pad = (n: number) => String(n).padStart(2, "0");

/** Intervalo [início, fim) do mês em horário de Brasília (UTC-3, sem horário de verão). */
function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return [new Date(`${y}-${pad(m)}-01T00:00:00-03:00`), new Date(`${ny}-${pad(nm)}-01T00:00:00-03:00`)] as const;
}

async function loadReport(userId: number, month: string) {
  const [from, to] = monthRange(month);
  const u = await pool.query("SELECT name, email, daily_minutes, created_at FROM users WHERE id = $1", [userId]);
  const r = await pool.query(
    "SELECT id, at, note FROM punches WHERE user_id = $1 AND at >= $2 AND at < $3 ORDER BY at",
    [userId, from, to],
  );
  const user = u.rows[0];
  const report = buildReport(r.rows, user.daily_minutes, {
    month,
    holidays: await getHolidays(Number(month.slice(0, 4))),
    today: dayKey(new Date()),
    since: dayKey(new Date(user.created_at)),
  });
  return { report, user };
}

const fmt = (min: number) => `${min < 0 ? "-" : ""}${Math.floor(Math.abs(min) / 60)}h${pad(Math.abs(min) % 60)}`;

punchRouter.get("/report", async (req, res) => {
  const m = monthSchema.safeParse(req.query.month);
  if (!m.success) return void res.status(400).json({ error: "Use month=YYYY-MM" });
  res.json((await loadReport(res.locals.userId, m.data)).report);
});

punchRouter.get("/report.csv", async (req, res) => {
  const m = monthSchema.safeParse(req.query.month);
  if (!m.success) return void res.status(400).json({ error: "Use month=YYYY-MM" });
  const { report: rep } = await loadReport(res.locals.userId, m.data);
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const lines = ["Data;Marcações;Trabalhado;Esperado;Saldo;Observação"];
  for (const d of rep.days) {
    const obs = d.kind === "falta" ? "falta" : d.holiday ?? "";
    lines.push([d.date, d.punches.map((p) => time(p.at)).join(" "), fmt(d.worked), fmt(d.expected), d.complete ? fmt(d.balance) : "incompleto", obs].join(";"));
  }
  lines.push(`Total;;${fmt(rep.totalWorked)};;${fmt(rep.totalBalance)}`);
  res.type("text/csv; charset=utf-8")
    .attachment(`ponto-${m.data}.csv`)
    .send("\uFEFF" + lines.join("\r\n"));
});

punchRouter.get("/report.xml", async (req, res) => {
  const m = monthSchema.safeParse(req.query.month);
  if (!m.success) return void res.status(400).json({ error: "Use month=YYYY-MM" });
  const { report, user } = await loadReport(res.locals.userId, m.data);
  res.type("application/xml; charset=utf-8")
    .attachment(`ponto-${m.data}.xml`)
    .send(reportToXml(report, { month: m.data, name: user.name, email: user.email }));
});

punchRouter.post("/", async (req, res) => {
  const p = z.object({
    at: z.string().datetime({ offset: true }).optional(),
    note: z.string().max(200).optional(),
  }).safeParse(req.body ?? {});
  if (!p.success) return void res.status(400).json({ error: "Dados inválidos" });
  const userId = res.locals.userId;

  if (!p.data.at) {
    // evita duplo clique: bloqueia batida automática a menos de 30s da anterior
    const last = await pool.query("SELECT max(at) AS at FROM punches WHERE user_id = $1", [userId]);
    if (last.rows[0].at && Date.now() - new Date(last.rows[0].at).getTime() < 30_000)
      return void res.status(429).json({ error: "Marcação muito próxima da anterior" });
  }
  const r = await pool.query(
    "INSERT INTO punches (user_id, at, note) VALUES ($1, $2, $3) RETURNING id, at, note",
    [userId, p.data.at ? new Date(p.data.at) : new Date(), p.data.note ?? null],
  );
  res.status(201).json(r.rows[0]);
});

punchRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return void res.status(400).json({ error: "ID inválido" });
  const r = await pool.query("DELETE FROM punches WHERE id = $1 AND user_id = $2", [id, res.locals.userId]);
  res.sendStatus(r.rowCount ? 204 : 404);
});
