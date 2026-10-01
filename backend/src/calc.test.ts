import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, workedMinutes, dayKey, daysOfMonth } from "./calc.js";

const at = (hhmm: string, day = "2026-09-29") => new Date(`${day}T${hhmm}:00-03:00`);
const rowsOf = (day: string, ...times: string[]) => times.map((h, i) => ({ id: i, at: at(h, day), note: null }));

test("jornada completa de 8h", () => {
  assert.equal(workedMinutes([at("08:00"), at("12:00"), at("13:00"), at("17:00")]), 480);
});

test("dia incompleto não entra no saldo", () => {
  const r = buildReport([{ id: 1, at: at("08:00"), note: null }], 480);
  assert.equal(r.days[0].complete, false);
  assert.equal(r.totalBalance, 0);
});

test("saldo positivo e labels derivados da ordem", () => {
  const r = buildReport(rowsOf("2026-09-29", "08:00", "12:00", "13:00", "18:00"), 480);
  assert.equal(r.totalBalance, 60);
  assert.deepEqual(r.days[0].punches.map((p) => p.label), ["Entrada", "Saída almoço", "Volta almoço", "Saída"]);
});

test("dia agrupado no fuso de São Paulo (23h30 local ainda é o mesmo dia)", () => {
  assert.equal(dayKey(at("23:30")), "2026-09-29");
});

test("daysOfMonth respeita meses curtos e ano bissexto", () => {
  assert.equal(daysOfMonth("2026-02").length, 28);
  assert.equal(daysOfMonth("2028-02").length, 29);
  assert.equal(daysOfMonth("2026-09").at(-1), "2026-09-30");
});

// Setembro/2026: dia 1 é terça; 5 e 6 são sábado e domingo; 7 é feriado (Independência).
const setembro = { month: "2026-09", today: "2026-09-08", holidays: new Map([["2026-09-07", "Independência do Brasil"]]) };

test("dia útil sem marcação vira falta; fim de semana sem marcação é ignorado", () => {
  const r = buildReport(rowsOf("2026-09-01", "08:00", "12:00", "13:00", "17:00"), 480, setembro);
  const byDate = Object.fromEntries(r.days.map((d) => [d.date, d]));
  assert.equal(byDate["2026-09-01"].kind, "normal");
  assert.equal(byDate["2026-09-02"].kind, "falta");
  assert.equal(byDate["2026-09-02"].balance, -480);
  assert.equal(byDate["2026-09-05"], undefined);
  assert.equal(byDate["2026-09-06"], undefined);
  // faltas: 2, 3, 4 (dia 7 é feriado e dia 8 é hoje)
  assert.equal(r.totalBalance, -3 * 480);
});

test("feriado aparece no espelho e não gera falta", () => {
  const r = buildReport([], 480, setembro);
  const feriado = r.days.find((d) => d.date === "2026-09-07");
  assert.equal(feriado?.kind, "feriado");
  assert.equal(feriado?.holiday, "Independência do Brasil");
  assert.equal(feriado?.balance, 0);
});

test("trabalho em feriado ou fim de semana conta inteiro como hora extra", () => {
  const r = buildReport(
    [...rowsOf("2026-09-07", "08:00", "12:00"), ...rowsOf("2026-09-05", "09:00", "11:00")],
    480,
    { ...setembro, since: "2026-09-05" },
  );
  const byDate = Object.fromEntries(r.days.map((d) => [d.date, d]));
  assert.equal(byDate["2026-09-07"].balance, 240);
  assert.equal(byDate["2026-09-05"].kind, "fim de semana");
  assert.equal(byDate["2026-09-05"].balance, 120);
});

test("hoje sem marcação não é falta, e dias antes do cadastro não contam", () => {
  const r = buildReport([], 480, { ...setembro, since: "2026-09-04" });
  assert.deepEqual(r.days.map((d) => `${d.date}:${d.kind}`), ["2026-09-04:falta", "2026-09-07:feriado"]);
});
