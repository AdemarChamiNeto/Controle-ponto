export const TZ = "America/Sao_Paulo";
export const LABELS = ["Entrada", "Saída almoço", "Volta almoço", "Saída"] as const;

export type DayKind = "normal" | "feriado" | "fim de semana" | "falta";

export interface PunchRow { id: number; at: Date; note: string | null }
export interface PunchOut { id: number; at: string; note: string | null; label: string }
export interface DayRow {
  date: string;
  kind: DayKind;
  holiday?: string;
  punches: PunchOut[];
  worked: number;
  expected: number;
  balance: number;
  complete: boolean;
}
export interface Report { days: DayRow[]; totalWorked: number; totalBalance: number }

export interface ReportOptions {
  /** Mês YYYY-MM. Quando informado, dias úteis sem marcação viram falta e feriados aparecem no espelho. */
  month?: string;
  /** Feriados do período: data YYYY-MM-DD → nome. */
  holidays?: Map<string, string>;
  /** Hoje (YYYY-MM-DD, fuso de SP). Dias depois de hoje não entram; hoje sem marcação não é falta. */
  today?: string;
  /** Primeiro dia considerado (ex.: data do cadastro). Antes disso não há falta. */
  since?: string;
}

/** Dia (YYYY-MM-DD) no fuso de São Paulo. */
export const dayKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ });

/** Minutos trabalhados: soma dos intervalos entrada→saída, em pares (1ª–2ª, 3ª–4ª...). */
export function workedMinutes(sortedTimes: Date[]): number {
  let total = 0;
  for (let i = 0; i + 1 < sortedTimes.length; i += 2) {
    const diff = (sortedTimes[i + 1].getTime() - sortedTimes[i].getTime()) / 60000;
    total += Math.max(0, Math.round(diff));
  }
  return total;
}

/** Todas as datas YYYY-MM-DD do mês. */
export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

const isWeekend = (date: string) => {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  return wd === 0 || wd === 6;
};

export function buildReport(rows: PunchRow[], dailyMinutes: number, opts: ReportOptions = {}): Report {
  const holidays = opts.holidays ?? new Map<string, string>();

  const byDay = new Map<string, PunchRow[]>();
  for (const r of [...rows].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const k = dayKey(r.at);
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }

  // Sem mês: só os dias com marcação (comportamento simples, jornada cheia todo dia).
  // Com mês: todos os dias do mês até hoje, para enxergar faltas e feriados.
  const dates = new Set(byDay.keys());
  if (opts.month) {
    for (const d of daysOfMonth(opts.month)) {
      if (opts.today && d > opts.today) continue;
      if (opts.since && d < opts.since) continue;
      dates.add(d);
    }
  }

  const days: DayRow[] = [];
  for (const date of [...dates].sort()) {
    const list = byDay.get(date) ?? [];
    const holiday = holidays.get(date);
    const weekend = isWeekend(date);
    const expected = opts.month && (holiday || weekend) ? 0 : dailyMinutes;

    if (list.length === 0) {
      if (holiday) {
        days.push({ date, kind: "feriado", holiday, punches: [], worked: 0, expected: 0, balance: 0, complete: true });
      } else if (expected > 0 && date !== opts.today) {
        days.push({ date, kind: "falta", punches: [], worked: 0, expected, balance: -expected, complete: true });
      }
      continue; // fim de semana sem marcação, ou hoje ainda sem marcação
    }

    const worked = workedMinutes(list.map((p) => p.at));
    const complete = list.length % 2 === 0;
    days.push({
      date,
      kind: holiday ? "feriado" : opts.month && weekend ? "fim de semana" : "normal",
      ...(holiday ? { holiday } : {}),
      punches: list.map((p, i) => ({
        id: p.id, at: p.at.toISOString(), note: p.note, label: LABELS[i] ?? "Extra",
      })),
      worked,
      expected,
      balance: complete ? worked - expected : 0,
      complete,
    });
  }

  return {
    days,
    totalWorked: days.reduce((s, d) => s + d.worked, 0),
    totalBalance: days.reduce((s, d) => s + d.balance, 0),
  };
}
