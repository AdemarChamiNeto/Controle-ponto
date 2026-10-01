import { describe, expect, it } from "vitest";
import { errorMessage } from "./api";
import { loggedIn, loggedOut } from "./authSlice";
import { makeStore } from "./index";
import { monthChanged } from "./reportSlice";

describe("store", () => {
  it("guarda e limpa o token no login/logout", () => {
    const store = makeStore({ auth: { token: null } });
    store.dispatch(loggedIn("abc"));
    expect(store.getState().auth.token).toBe("abc");
    store.dispatch(loggedOut());
    expect(store.getState().auth.token).toBeNull();
  });

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
