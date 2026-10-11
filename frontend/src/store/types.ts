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
export type User = { id: number; name: string; email: string; dailyMinutes: number; twoFactorEnabled: boolean };
/** Sem 2FA: já vem o usuário (sessão no cookie). Com 2FA: só `twoFactorRequired`, e o login continua em /auth/login/2fa. */
export type AuthResponse = { user?: User; twoFactorRequired?: boolean };
export type TwoFactorSetup = { secret: string; otpauthUrl: string };
