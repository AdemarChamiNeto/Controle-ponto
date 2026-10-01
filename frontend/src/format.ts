import { TZ } from "./store/reportSlice";

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export const dateBR = (d: string) => d.split("-").reverse().join("/");

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const weekday = (d: string) => WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()];

/** Minutos → "7h30"; com `signed`, positivos ganham "+". */
export function fmt(min: number, signed = false) {
  const sign = min < 0 ? "-" : signed && min > 0 ? "+" : "";
  return `${sign}${Math.floor(Math.abs(min) / 60)}h${String(Math.abs(min) % 60).padStart(2, "0")}`;
}
