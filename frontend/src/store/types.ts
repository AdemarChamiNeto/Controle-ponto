export type DayKind = "normal" | "feriado" | "fim de semana" | "falta";
export type Punch = { id: number; at: string; note: string | null; label: string };
export type Day = {
  date: string;
  kind: DayKind;
  holiday?: string;
  punches: Punch[];
  worked: number;
  expected: number;
  balance: number;
  complete: boolean;
};
export type Report = { days: Day[]; totalWorked: number; totalBalance: number };
export type User = { id: number; name: string; email: string; dailyMinutes: number };
export type AuthResponse = { token: string; user: User };
