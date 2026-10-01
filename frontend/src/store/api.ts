import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs, type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { loggedOut } from "./authSlice";
import type { AuthResponse, Report, User } from "./types";

type TokenState = { auth: { token: string | null } };

const rawBaseQuery = fetchBaseQuery({
  baseUrl: "/api",
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as TokenState).auth.token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

/** Se a API responder 401 (token vencido/inválido), desloga automaticamente. */
const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  const result = await rawBaseQuery(args, api, extra);
  const url = typeof args === "string" ? args : args.url;
  if (result.error?.status === 401 && !url.startsWith("/auth/login")) api.dispatch(loggedOut());
  return result;
};

export const pontoApi = createApi({
  reducerPath: "pontoApi",
  baseQuery,
  tagTypes: ["Me", "Report"],
  endpoints: (b) => ({
    login: b.mutation<AuthResponse, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
    }),
    register: b.mutation<AuthResponse, { name: string; email: string; password: string }>({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
    }),
    me: b.query<User, void>({
      query: () => "/auth/me",
      providesTags: ["Me"],
    }),
    setDailyMinutes: b.mutation<User, number>({
      query: (dailyMinutes) => ({ url: "/auth/me", method: "PUT", body: { dailyMinutes } }),
      invalidatesTags: ["Me", "Report"],
    }),
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
  useLoginMutation,
  useRegisterMutation,
  useMeQuery,
  useSetDailyMinutesMutation,
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
