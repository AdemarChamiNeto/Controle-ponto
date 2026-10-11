import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs, type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import type { AuthResponse, Report, TwoFactorSetup, User } from "./types";

// A sessão é um cookie httpOnly que o navegador manda sozinho (mesma origem): o JS nunca vê o token.
const rawBaseQuery = fetchBaseQuery({ baseUrl: "/api", credentials: "same-origin" });

/** 401 numa rota de dados = sessão vencida: zera o cache e marca "ninguém logado" (o App mostra o login). */
const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  const result = await rawBaseQuery(args, api, extra);
  const url = typeof args === "string" ? args : args.url;
  if (result.error?.status === 401 && !url.startsWith("/auth/")) signedOut(api.dispatch);
  return result;
};

/** Esquece os dados do usuário anterior e deixa o `me` como null. */
export function signedOut(dispatch: (action: any) => unknown) {
  dispatch(pontoApi.util.resetApiState());
  dispatch(pontoApi.util.upsertQueryData("me", undefined, null));
}

const signedIn = (dispatch: (action: any) => unknown, user: User) =>
  dispatch(pontoApi.util.upsertQueryData("me", undefined, user));

export const pontoApi = createApi({
  reducerPath: "pontoApi",
  baseQuery,
  tagTypes: ["Me", "Report"],
  endpoints: (b) => ({
    /** Usuário logado, ou null se não há sessão. */
    me: b.query<User | null, void>({
      async queryFn(_arg, _api, _extra, base) {
        const r = await base("/auth/me");
        if (r.error?.status === 401) return { data: null };
        return r.error ? { error: r.error } : { data: r.data as User };
      },
      providesTags: ["Me"],
    }),
    login: b.mutation<AuthResponse, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({ data: null }));
        if (data?.user) signedIn(dispatch, data.user);
      },
    }),
    loginSecondFactor: b.mutation<AuthResponse, string>({
      query: (code) => ({ url: "/auth/login/2fa", method: "POST", body: { code } }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({ data: null }));
        if (data?.user) signedIn(dispatch, data.user);
      },
    }),
    register: b.mutation<AuthResponse, { name: string; email: string; password: string }>({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({ data: null }));
        if (data?.user) signedIn(dispatch, data.user);
      },
    }),
    logout: b.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled.catch(() => {});
        signedOut(dispatch);
      },
    }),
    setDailyMinutes: b.mutation<User, number>({
      query: (dailyMinutes) => ({ url: "/auth/me", method: "PUT", body: { dailyMinutes } }),
      invalidatesTags: ["Me", "Report"],
    }),
    // ---- 2FA (opcional) ----
    setupTwoFactor: b.mutation<TwoFactorSetup, void>({
      query: () => ({ url: "/auth/2fa/setup", method: "POST" }),
    }),
    enableTwoFactor: b.mutation<{ recoveryCodes: string[] }, string>({
      query: (code) => ({ url: "/auth/2fa/enable", method: "POST", body: { code } }),
      invalidatesTags: ["Me"],
    }),
    disableTwoFactor: b.mutation<void, { password: string; code: string }>({
      query: (body) => ({ url: "/auth/2fa/disable", method: "POST", body }),
      invalidatesTags: ["Me"],
    }),
    // ---- marcações ----
    report: b.query<Report, string>({
      query: (month) => `/punches/report?month=${month}`,
      providesTags: (_r, _e, month) => [{ type: "Report", id: month }, "Report"],
    }),
    punch: b.mutation<unknown, string | void>({
      query: (at) => ({ url: "/punches", method: "POST", body: at ? { at } : {} }),
      invalidatesTags: ["Report"],
    }),
    removePunch: b.mutation<void, number>({
      query: (id) => ({ url: `/punches/${id}`, method: "DELETE" }),
      invalidatesTags: ["Report"],
    }),
  }),
});

export const {
  useMeQuery,
  useLoginMutation,
  useLoginSecondFactorMutation,
  useRegisterMutation,
  useLogoutMutation,
  useSetDailyMinutesMutation,
  useSetupTwoFactorMutation,
  useEnableTwoFactorMutation,
  useDisableTwoFactorMutation,
  useReportQuery,
  usePunchMutation,
  useRemovePunchMutation,
} = pontoApi;

/** Extrai a mensagem de erro que a API manda em `{ error }`. */
export function errorMessage(err: unknown): string {
  if (!err) return "";
  const e = err as FetchBaseQueryError & { message?: string };
  if (e.data && typeof e.data === "object" && "error" in e.data) return String((e.data as { error: unknown }).error);
  if (e.status === "FETCH_ERROR") return "Não foi possível falar com o servidor";
  return e.message ?? "Erro inesperado";
}
