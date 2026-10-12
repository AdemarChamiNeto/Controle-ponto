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
process.env.TOTP_ENCRYPTION_KEY ??= "ab".repeat(32);
// os testes criam muitos usuários do mesmo IP; os limites têm testes próprios mais abaixo
process.env.AUTH_RATE_LIMIT ??= "1000";
process.env.WRITE_RATE_LIMIT ??= "1000";
process.env.READ_RATE_LIMIT ??= "1000";

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

/** `cookie` é o cabeçalho Cookie a mandar; a resposta traz em `cookie` os cookies que o servidor criou. */
async function call(path: string, init: { method?: string; body?: unknown; cookie?: string; base?: string } = {}) {
  const res = await fetch((init.base ?? base) + path, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init.cookie ? { Cookie: init.cookie } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* CSV/XML */ }
  const setCookies = res.headers.getSetCookie();
  const cookie = setCookies.map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");
  return { status: res.status, json, text, type: res.headers.get("content-type") ?? "", cookie, setCookies, headers: res.headers };
}

const email = () => `u${Date.now()}${Math.random().toString(36).slice(2, 6)}@teste.com`;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

async function newUser() {
  const r = await call("/auth/register", { method: "POST", body: { name: "Teste", email: email(), password: "senha12345" } });
  assert.equal(r.status, 201);
  return r.cookie;
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

  assert.equal(ok.json.token, undefined, "o token não vai no corpo, só no cookie");
  assert.match(ok.setCookies.join(), /ponto_session=.*HttpOnly/i);
  assert.match(ok.setCookies.join(), /SameSite=Lax/i);

  const me = await call("/auth/me", { cookie: ok.cookie });
  assert.equal(me.json.email, mail);
  assert.equal(me.json.dailyMinutes, 480);
});

test("rotas de ponto exigem token", { skip }, async () => {
  assert.equal((await call("/punches/report?month=2026-01")).status, 401);
  assert.equal((await call("/punches/report?month=2026-01", { cookie: "ponto_session=invalido" })).status, 401);
});

test("marcações manuais, espelho do mês, CSV e XML", { skip }, async () => {
  const cookie = await newUser();
  const day = today();
  for (const h of ["08:00", "12:00"]) {
    const r = await call("/punches", { method: "POST", cookie, body: { at: `${day}T${h}:00-03:00` } });
    assert.equal(r.status, 201);
  }

  const month = day.slice(0, 7);
  const rep = await call(`/punches/report?month=${month}`, { cookie });
  assert.equal(rep.status, 200);
  const hoje = rep.json.days.find((d: any) => d.date === day);
  assert.equal(hoje.worked, 240);
  assert.deepEqual(hoje.punches.map((p: any) => p.label), ["Entrada", "Saída almoço"]);

  const csv = await call(`/punches/report.csv?month=${month}`, { cookie });
  assert.match(csv.type, /text\/csv/);
  assert.match(csv.text, /Data;Marcações;Trabalhado;Esperado;Saldo;Observação/);

  const xml = await call(`/punches/report.xml?month=${month}`, { cookie });
  assert.match(xml.type, /application\/xml/);
  assert.match(xml.text, new RegExp(`<dia data="${day}"`));

  assert.equal((await call("/punches/report?month=2026-13", { cookie })).status, 400);
});

test("bloqueia batida dupla em menos de 30s", { skip }, async () => {
  const cookie = await newUser();
  assert.equal((await call("/punches", { method: "POST", cookie, body: {} })).status, 201);
  assert.equal((await call("/punches", { method: "POST", cookie, body: {} })).status, 429);
});

test("um usuário não apaga a marcação de outro", { skip }, async () => {
  const dono = await newUser();
  const outro = await newUser();
  const p = await call("/punches", { method: "POST", cookie: dono, body: {} });

  assert.equal((await call(`/punches/${p.json.id}`, { method: "DELETE", cookie: outro })).status, 404);
  assert.equal((await call(`/punches/${p.json.id}`, { method: "DELETE", cookie: dono })).status, 204);
});

test("atualiza a jornada diária dentro dos limites", { skip }, async () => {
  const cookie = await newUser();
  assert.equal((await call("/auth/me", { method: "PUT", cookie, body: { dailyMinutes: 360 } })).json.dailyMinutes, 360);
  assert.equal((await call("/auth/me", { method: "PUT", cookie, body: { dailyMinutes: 30 } })).status, 400);
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

/** Sobe um segundo app com limites menores (os limites são lidos na criação do app). */
async function appWithLimits(limits: Record<string, string>) {
  const { createApp } = await import("./app.js");
  const saved = Object.fromEntries(Object.keys(limits).map((k) => [k, process.env[k]]));
  Object.assign(process.env, limits);
  const server = createApp().listen(0);
  Object.assign(process.env, saved);
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api` };
}

test("limita tentativas de login (força bruta) e responde com Retry-After", { skip }, async () => {
  const limited = await appWithLimits({ AUTH_RATE_LIMIT: "3" });
  const results = [];
  for (let i = 0; i < 4; i++) {
    results.push(await call("/auth/login", { base: limited.base, method: "POST", body: { email: "x@x.com", password: "errada123" } }));
  }
  limited.server.close();
  assert.deepEqual(results.map((r) => r.status), [401, 401, 401, 429]);
  assert.ok(Number(results[3].headers.get("retry-after")) > 0);
});

test("limita escrita por usuário (30/min no padrão)", { skip }, async () => {
  const limited = await appWithLimits({ WRITE_RATE_LIMIT: "2" });
  const cookie = (await call("/auth/register", { base: limited.base, method: "POST", body: { name: "Lia", email: email(), password: "senha12345" } })).cookie;
  // o cadastro já contou 1 escrita (sem sessão, pelo IP); as próximas contam pelo usuário
  const a = await call("/auth/me", { base: limited.base, method: "PUT", cookie, body: { dailyMinutes: 300 } });
  const b = await call("/auth/me", { base: limited.base, method: "PUT", cookie, body: { dailyMinutes: 300 } });
  const c = await call("/auth/me", { base: limited.base, method: "PUT", cookie, body: { dailyMinutes: 300 } });
  limited.server.close();
  assert.deepEqual([a.status, b.status, c.status], [200, 200, 429]);
});

test("senha antiga com bcrypt custo 10 é refeita com custo 12 no login", { skip }, async () => {
  const bcrypt = (await import("bcryptjs")).default;
  const { pool } = await import("./db.js");
  const mail = email();
  await pool.query("INSERT INTO users (name, email, password_hash) VALUES ('Antigo', $1, $2)", [mail, bcrypt.hashSync("senha12345", 10)]);
  assert.equal((await call("/auth/login", { method: "POST", body: { email: mail, password: "senha12345" } })).status, 200);
  const { password_hash } = (await pool.query("SELECT password_hash FROM users WHERE email = $1", [mail])).rows[0];
  assert.equal(bcrypt.getRounds(password_hash), 12);
});

test("2FA: ativar, login em dois passos, código não reutilizável, recuperação e desativar", { skip }, async () => {
  const { codeForStep, stepAt } = await import("./totp.js");
  const { pool } = await import("./db.js");
  const mail = email();
  const cookie = (await call("/auth/register", { method: "POST", body: { name: "Bia", email: mail, password: "senha12345" } })).cookie;
  assert.equal((await call("/auth/me", { cookie })).json.twoFactorEnabled, false);

  // passo 1: QR code
  const setup = await call("/auth/2fa/setup", { method: "POST", cookie });
  assert.equal(setup.status, 200);
  assert.match(setup.json.otpauthUrl, /^otpauth:\/\/totp\//);
  const secret: string = setup.json.secret;
  const stored = (await pool.query("SELECT secret_encrypted FROM user_totp t JOIN users u ON u.id = t.user_id WHERE u.email = $1", [mail])).rows[0];
  assert.ok(!stored.secret_encrypted.includes(secret), "segredo não pode ficar em texto puro no banco");

  // passo 2: confirmar com código errado e depois certo
  assert.equal((await call("/auth/2fa/enable", { method: "POST", cookie, body: { code: "000000" } })).status, 400);
  const step = stepAt(new Date());
  const enable = await call("/auth/2fa/enable", { method: "POST", cookie, body: { code: codeForStep(secret, step) } });
  assert.equal(enable.status, 200);
  const recovery: string[] = enable.json.recoveryCodes;
  assert.equal(recovery.length, 10);
  assert.equal((await call("/auth/me", { cookie })).json.twoFactorEnabled, true);

  // login agora pede o segundo fator e não abre sessão
  const login = await call("/auth/login", { method: "POST", body: { email: mail, password: "senha12345" } });
  assert.deepEqual(login.json, { twoFactorRequired: true });
  assert.equal((await call("/auth/me", { cookie: login.cookie })).status, 401, "o cookie pendente não vale como sessão");

  assert.equal((await call("/auth/login/2fa", { method: "POST", cookie: login.cookie, body: { code: "000000" } })).status, 401);
  // o código usado para ativar não vale de novo; o do próximo passo (relógio 30 s à frente) vale
  assert.equal((await call("/auth/login/2fa", { method: "POST", cookie: login.cookie, body: { code: codeForStep(secret, step) } })).status, 401);
  const second = await call("/auth/login/2fa", { method: "POST", cookie: login.cookie, body: { code: codeForStep(secret, step + 1) } });
  assert.equal(second.status, 200);
  assert.equal(second.json.user.email, mail);
  assert.equal((await call("/auth/me", { cookie: second.cookie })).status, 200);

  // código de recuperação: vale uma vez só
  const login2 = await call("/auth/login", { method: "POST", body: { email: mail, password: "senha12345" } });
  const rec = await call("/auth/login/2fa", { method: "POST", cookie: login2.cookie, body: { code: recovery[0].toUpperCase() } });
  assert.equal(rec.status, 200);
  assert.equal(rec.json.recoveryCodesLeft, 9);
  const login3 = await call("/auth/login", { method: "POST", body: { email: mail, password: "senha12345" } });
  assert.equal((await call("/auth/login/2fa", { method: "POST", cookie: login3.cookie, body: { code: recovery[0] } })).status, 401);

  // desativar exige senha e código
  assert.equal((await call("/auth/2fa/disable", { method: "POST", cookie: rec.cookie, body: { password: "errada123", code: recovery[1] } })).status, 401);
  assert.equal((await call("/auth/2fa/disable", { method: "POST", cookie: rec.cookie, body: { password: "senha12345", code: recovery[2] } })).status, 204);
  const plain = await call("/auth/login", { method: "POST", body: { email: mail, password: "senha12345" } });
  assert.equal(plain.json.user.twoFactorEnabled, false);
});

test("logout apaga a sessão", { skip }, async () => {
  const cookie = await newUser();
  const out = await call("/auth/logout", { method: "POST", cookie });
  assert.equal(out.status, 204);
  assert.match(out.setCookies.join(), /ponto_session=;/);
});

test("serve o front na raiz, 404 de verdade nos outros caminhos e CSP com GA/Clarity", { skip }, async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponto-front-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<h1>app</h1>");
  fs.writeFileSync(path.join(dir, "404.html"), "<h1>404</h1>");
  fs.writeFileSync(path.join(dir, "robots.txt"), "User-agent: *");
  const site = await appWithLimits({ STATIC_DIR: dir });
  const origin = site.base.replace(/\/api$/, "");

  const home = await fetch(origin + "/");
  assert.equal(home.status, 200);
  assert.match(await home.text(), /app/);
  const csp = home.headers.get("content-security-policy") ?? "";
  assert.match(csp, /script-src 'self' https:\/\/www\.googletagmanager\.com/);
  assert.match(csp, /https:\/\/\*\.clarity\.ms/);

  assert.equal((await fetch(origin + "/robots.txt")).status, 200);
  const missing = await fetch(origin + "/nao-existe");
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /404/);
  assert.equal((await call("/nao-existe", { base: site.base })).json.error, "Rota não encontrada", "na /api continua JSON");
  site.server.close();
  fs.rmSync(dir, { recursive: true });
});
