import { TZ, type Report } from "./calc.js";

/** Escapa os 5 caracteres especiais do XML. */
export const escapeXml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

const attrs = (obj: Record<string, string | number | undefined>) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`)
    .join("");

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

/** Espelho de ponto do mês em XML (minutos como inteiros, para facilitar integração com outros sistemas). */
export function reportToXml(report: Report, meta: { month: string; name: string; email: string; generatedAt?: Date }) {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  out.push(`<espelhoPonto${attrs({ mes: meta.month, geradoEm: (meta.generatedAt ?? new Date()).toISOString() })}>`);
  out.push(`  <colaborador><nome>${escapeXml(meta.name)}</nome><email>${escapeXml(meta.email)}</email></colaborador>`);
  out.push("  <dias>");
  for (const d of report.days) {
    out.push(`    <dia${attrs({ data: d.date, tipo: d.kind, feriado: d.holiday, completo: String(d.complete) })}>`);
    if (d.punches.length) {
      out.push("      <marcacoes>");
      for (const p of d.punches) {
        out.push(`        <marcacao${attrs({ tipo: p.label, horario: time(p.at), instante: p.at, obs: p.note ?? undefined })}/>`);
      }
      out.push("      </marcacoes>");
    }
    out.push(`      <trabalhadoMin>${d.worked}</trabalhadoMin>`);
    out.push(`      <esperadoMin>${d.expected}</esperadoMin>`);
    out.push(`      <saldoMin>${d.balance}</saldoMin>`);
    out.push("    </dia>");
  }
  out.push("  </dias>");
  out.push(`  <totais${attrs({ trabalhadoMin: report.totalWorked, saldoMin: report.totalBalance })}/>`);
  out.push("</espelhoPonto>");
  return out.join("\n");
}
