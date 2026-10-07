/**
 * Testes de integração da API contra um PostgreSQL de verdade.
 * Rodam só quando DATABASE_URL está definida (ex.: `docker compose up -d db` + `npm test`, ou no CI).
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const skip = !process.env.DATABASE_URL && "defina DATABASE_URL para rodar os testes de integração";
process.env.JWT_SECRET ??= "segredo-de-teste-com-mais-de-16-caracteres";

let server: Server;
let base = "";

before(async () => {
  if (skip) return;
  const { createApp } = await import("./app.js");
  const { initSchema, pool } = await import("./db.js");
  await initSchema();
  // pré-carrega o cache de feriados para os testes não dependerem da internet
  const year = new Date().getFullYear();
  await pool.query(
    "INSERT INTO holidays (date, year, name) VALUES ($1, $2, 'Feriado de teste') ON CONFLICT DO NOTHING",
    [`${year}-01-01`, year],
  );
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(async () => {
  if (skip) return;
  server.close();
  const { pool } = await import("./db.js");
  await pool.end();
});

async function call(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(base + path, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* CSV/XML */ }
  return { status: res.status, json, text, type: res.headers.get("content-type") ?? "" };
}

const email = () => `u${Date.now()}${Math.random().toString(36).slice(2, 6)}@teste.com`;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

async function newUser() {
  const r = await call("/auth/register", { method: "POST", body: { name: "Teste", email: email(), password: "senha12345" } });
  assert.equal(r.status, 201);
  return r.json.token as string;
}

test("cadastro, login e /me", { skip }, async () => {
  const mail = email();
  const reg = await call("/auth/register", { method: "POST", body: { name: "Ana", email: mail, password: "senha12345" } });
  assert.equal(reg.status, 201);

  const dup = await call("/auth/register", { method: "POST", body: { name: "Ana", email: mail, password: "senha12345" } });
  assert.equal(dup.status, 409);

  const bad = await call("/auth/login", { method: "POST", body: { email: mail, password: "errada123" } });
  assert.equal(bad.status, 401);

  const ok = await call("/auth/login", { method: "POST", body: { email: mail, password: "senha12345" } });
  assert.equal(ok.status, 200);

  const me = await call("/auth/me", { token: ok.json.token });
  assert.equal(me.json.email, mail);
  assert.equal(me.json.dailyMinutes, 480);
});

test("rotas de ponto exigem token", { skip }, async () => {
  assert.equal((await call("/punches/report?month=2026-01")).status, 401);
  assert.equal((await call("/punches/report?month=2026-01", { token: "invalido" })).status, 401);
});

test("marcações manuais, espelho do mês, CSV e XML", { skip }, async () => {
  const token = await newUser();
  const day = today();
  for (const h of ["08:00", "12:00"]) {
    const r = await call("/punches", { method: "POST", token, body: { at: `${day}T${h}:00-03:00` } });
    assert.equal(r.status, 201);
  }

  const month = day.slice(0, 7);
  const rep = await call(`/punches/report?month=${month}`, { token });
  assert.equal(rep.status, 200);
  const hoje = rep.json.days.find((d: any) => d.date === day);
  assert.equal(hoje.worked, 240);
  assert.deepEqual(hoje.punches.map((p: any) => p.label), ["Entrada", "Saída almoço"]);

  const csv = await call(`/punches/report.csv?month=${month}`, { token });
  assert.match(csv.type, /text\/csv/);
  assert.match(csv.text, /Data;Marcações;Trabalhado;Esperado;Saldo;Observação/);

  const xml = await call(`/punches/report.xml?month=${month}`, { token });
  assert.match(xml.type, /application\/xml/);
  assert.match(xml.text, new RegExp(`<dia data="${day}"`));

  assert.equal((await call("/punches/report?month=2026-13", { token })).status, 400);
});

test("bloqueia batida dupla em menos de 30s", { skip }, async () => {
  const token = await newUser();
  assert.equal((await call("/punches", { method: "POST", token, body: {} })).status, 201);
  assert.equal((await call("/punches", { method: "POST", token, body: {} })).status, 429);
});

test("um usuário não apaga a marcação de outro", { skip }, async () => {
  const dono = await newUser();
  const outro = await newUser();
  const p = await call("/punches", { method: "POST", token: dono, body: {} });

  assert.equal((await call(`/punches/${p.json.id}`, { method: "DELETE", token: outro })).status, 404);
  assert.equal((await call(`/punches/${p.json.id}`, { method: "DELETE", token: dono })).status, 204);
});

test("atualiza a jornada diária dentro dos limites", { skip }, async () => {
  const token = await newUser();
  assert.equal((await call("/auth/me", { method: "PUT", token, body: { dailyMinutes: 360 } })).json.dailyMinutes, 360);
  assert.equal((await call("/auth/me", { method: "PUT", token, body: { dailyMinutes: 30 } })).status, 400);
});

test("documentação OpenAPI cobre as rotas e o Swagger UI abre", { skip }, async () => {
  const spec = await call("/docs.json");
  assert.equal(spec.status, 200);
  for (const route of ["/auth/register", "/auth/login", "/auth/me", "/punches", "/punches/{id}", "/punches/report", "/punches/report.csv", "/punches/report.xml"]) {
    assert.ok(spec.json.paths[route], `rota ${route} sem documentação`);
  }
  const ui = await fetch(base + "/docs/");
  assert.equal(ui.status, 200);
  assert.match(await ui.text(), /swagger-ui/i);
});

test("rota inexistente da API responde 404 em JSON", { skip }, async () => {
  const r = await call("/nao-existe");
  assert.equal(r.status, 404);
  assert.equal(r.json.error, "Rota não encontrada");
});

test("limita tentativas de login (força bruta)", { skip }, async () => {
  const { createApp } = await import("./app.js");
  process.env.AUTH_RATE_LIMIT = "3";
  const limited = createApp().listen(0);
  delete process.env.AUTH_RATE_LIMIT;
  const url = `http://127.0.0.1:${(limited.address() as AddressInfo).port}/api/auth/login`;
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@x.com", password: "errada123" }) });
    statuses.push(r.status);
  }
  limited.close();
  assert.deepEqual(statuses, [401, 401, 401, 429]);
});
