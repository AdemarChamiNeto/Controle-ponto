import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessage, pontoApi } from "./api";
import { makeStore } from "./index";
import { monthChanged } from "./reportSlice";
import type { User } from "./types";

const ana: User = { id: 1, name: "Ana", email: "ana@exemplo.com", dailyMinutes: 480, twoFactorEnabled: false };

/** Simula a API: cada rota "MÉTODO /caminho" responde com [status, corpo]. */
function fakeApi(routes: Record<string, [number, unknown?]>) {
  const fetchMock = vi.fn(async (req: Request) => {
    const key = `${req.method} ${new URL(req.url).pathname}`;
    const [status, body] = routes[key] ?? [404, { error: "Rota não encontrada" }];
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // no Node não existe "página": as URLs relativas (/api/...) precisam de uma origem
  const NativeRequest = globalThis.Request;
  vi.stubGlobal("Request", class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === "string" ? new URL(input, "http://localhost") : input, init);
    }
  });
});
afterEach(() => vi.unstubAllGlobals());

const me = (store: ReturnType<typeof makeStore>) => pontoApi.endpoints.me.select()(store.getState()).data;

describe("sessão (cookie httpOnly: o front só sabe quem está logado pelo /auth/me)", () => {
  it("sem sessão, o me é null", async () => {
    fakeApi({ "GET /api/auth/me": [401, { error: "Não autenticado" }] });
    const store = makeStore();
    await store.dispatch(pontoApi.endpoints.me.initiate());
    expect(me(store)).toBeNull();
  });

  it("login sem 2FA já deixa o usuário no cache", async () => {
    fakeApi({ "POST /api/auth/login": [200, { user: ana }] });
    const store = makeStore();
    await store.dispatch(pontoApi.endpoints.login.initiate({ email: ana.email, password: "senha12345" }));
    await vi.waitFor(() => expect(me(store)).toEqual(ana));
  });

  it("login com 2FA não entra até o código; o código certo entra", async () => {
    const api = fakeApi({
      "POST /api/auth/login": [200, { twoFactorRequired: true }],
      "POST /api/auth/login/2fa": [200, { user: { ...ana, twoFactorEnabled: true }, recoveryCodesLeft: 10 }],
    });
    const store = makeStore();
    const r = await store.dispatch(pontoApi.endpoints.login.initiate({ email: ana.email, password: "senha12345" }));
    expect(r.data).toEqual({ twoFactorRequired: true });
    expect(me(store)).toBeUndefined();

    await store.dispatch(pontoApi.endpoints.loginSecondFactor.initiate("123456"));
    await vi.waitFor(() => expect(me(store)?.twoFactorEnabled).toBe(true));
    const sent = await (api.mock.calls[1][0] as Request).json();
    expect(sent).toEqual({ code: "123456" });
  });

  it("401 numa rota de dados (sessão vencida) volta para o login", async () => {
    fakeApi({ "GET /api/punches/report": [401, { error: "Sessão inválida" }] });
    const store = makeStore();
    await store.dispatch(pontoApi.util.upsertQueryData("me", undefined, ana));
    await store.dispatch(pontoApi.endpoints.report.initiate("2026-10"));
    await vi.waitFor(() => expect(me(store)).toBeNull());
  });

  it("logout esquece o usuário", async () => {
    fakeApi({ "POST /api/auth/logout": [204] });
    const store = makeStore();
    await store.dispatch(pontoApi.util.upsertQueryData("me", undefined, ana));
    await store.dispatch(pontoApi.endpoints.logout.initiate());
    await vi.waitFor(() => expect(me(store)).toBeNull());
  });
});

describe("store", () => {
  it("aceita só meses válidos", () => {
    const store = makeStore({ report: { month: "2026-09" } });
    store.dispatch(monthChanged("2026-10"));
    expect(store.getState().report.month).toBe("2026-10");
    store.dispatch(monthChanged("2026-13"));
    store.dispatch(monthChanged(""));
    expect(store.getState().report.month).toBe("2026-10");
  });
});

describe("errorMessage", () => {
  it("usa a mensagem que a API manda", () => {
    expect(errorMessage({ status: 409, data: { error: "Email já cadastrado" } })).toBe("Email já cadastrado");
  });
  it("trata servidor fora do ar", () => {
    expect(errorMessage({ status: "FETCH_ERROR", error: "TypeError" })).toBe("Não foi possível falar com o servidor");
  });
  it("vazio quando não há erro", () => {
    expect(errorMessage(undefined)).toBe("");
  });
});
