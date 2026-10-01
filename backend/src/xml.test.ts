import test from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "./calc.js";
import { escapeXml, reportToXml } from "./xml.js";
import { fetchHolidays } from "./holidays.js";

test("escapa caracteres especiais do XML", () => {
  assert.equal(escapeXml(`<a href="x">Tom & 'Jerry'</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;");
});

test("gera o espelho em XML com dias, marcações e totais", () => {
  const rows = ["08:00", "12:00", "13:00", "17:30"].map((h, i) => ({
    id: i, at: new Date(`2026-09-01T${h}:00-03:00`), note: i === 0 ? "home office & reunião" : null,
  }));
  const report = buildReport(rows, 480, {
    month: "2026-09", today: "2026-09-01", holidays: new Map(),
  });
  const xml = reportToXml(report, {
    month: "2026-09", name: "Ana <Dev>", email: "ana@teste.com", generatedAt: new Date("2026-09-02T00:00:00Z"),
  });

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<espelhoPonto mes="2026-09" geradoEm="2026-09-02T00:00:00.000Z">/);
  assert.match(xml, /<nome>Ana &lt;Dev&gt;<\/nome>/);
  assert.match(xml, /<dia data="2026-09-01" tipo="normal" completo="true">/);
  assert.match(xml, /<marcacao tipo="Entrada" horario="08:00" instante="[^"]+" obs="home office &amp; reunião"\/>/);
  assert.match(xml, /<saldoMin>30<\/saldoMin>/);
  assert.match(xml, /<totais trabalhadoMin="510" saldoMin="30"\/>/);
  // tags balanceadas
  const open = (xml.match(/<dia /g) ?? []).length;
  assert.equal(open, (xml.match(/<\/dia>/g) ?? []).length);
});

const fakeFetch = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("lê feriados da BrasilAPI e descarta itens inválidos", async () => {
  const list = await fetchHolidays(2026, fakeFetch(200, [
    { date: "2026-01-01", name: "Confraternização mundial", type: "national" },
    { date: "data-errada", name: "x" },
    { name: "sem data" },
  ]));
  assert.deepEqual(list, [{ date: "2026-01-01", name: "Confraternização mundial" }]);
});

test("falha da BrasilAPI vira erro tratável", async () => {
  await assert.rejects(fetchHolidays(2026, fakeFetch(500, {})), /BrasilAPI respondeu 500/);
});
