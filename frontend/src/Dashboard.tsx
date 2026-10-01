import { useState } from "react";
import { downloadFile } from "./download";
import { dateBR, fmt, time, weekday } from "./format";
import { loggedOut, useAppDispatch, useAppSelector } from "./store";
import {
  errorMessage, usePunchMutation, useRemovePunchMutation, useReportQuery, useSetDailyMinutesMutation,
} from "./store/api";
import { monthChanged, todayKey } from "./store/reportSlice";
import type { Day, User } from "./store/types";

const LABELS = ["Entrada", "Saída almoço", "Volta almoço", "Saída"];

export default function Dashboard({ user }: { user: User }) {
  const dispatch = useAppDispatch();
  const month = useAppSelector((s) => s.report.month);
  const token = useAppSelector((s) => s.auth.token);

  const report = useReportQuery(month);
  const [punch, punchState] = usePunchMutation();
  const [removePunch, removeState] = useRemovePunchMutation();
  const [setDaily, dailyState] = useSetDailyMinutesMutation();

  const [manual, setManual] = useState("");
  const [hours, setHours] = useState(String(user.dailyMinutes / 60));
  const [downloadError, setDownloadError] = useState("");

  const error = errorMessage(report.error ?? punchState.error ?? removeState.error ?? dailyState.error) || downloadError;

  const today = todayKey();
  const todayCount = report.data?.days.find((d) => d.date === today)?.punches.length ?? 0;
  const next = LABELS[todayCount] ?? "Extra";

  async function download(ext: "csv" | "xml") {
    setDownloadError("");
    try {
      await downloadFile(`/punches/report.${ext}?month=${month}`, `ponto-${month}.${ext}`, token);
    } catch (e) {
      setDownloadError((e as Error).message);
    }
  }

  function saveHours() {
    const minutes = Math.round(Number(hours.replace(",", ".")) * 60);
    if (Number.isFinite(minutes) && minutes !== user.dailyMinutes) setDaily(minutes);
  }

  return (
    <div className="wrap">
      <header>
        <h1>Olá, {user.name.split(" ")[0]}</h1>
        <button className="link" onClick={() => dispatch(loggedOut())}>Sair</button>
      </header>

      <section className="card">
        <button className="big" disabled={punchState.isLoading} onClick={() => punch()}>
          Bater ponto — {next}
        </button>
        <form className="row" onSubmit={(e) => {
          e.preventDefault();
          if (manual) punch(`${manual}:00-03:00`).unwrap().then(() => setManual(""), () => {});
        }}>
          <input type="datetime-local" value={manual} onChange={(e) => setManual(e.target.value)} aria-label="Data e hora da marcação manual" />
          <button type="submit" disabled={!manual}>Adicionar manual</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <section className="card">
        <div className="row spread">
          <input type="month" value={month} aria-label="Mês" onChange={(e) => dispatch(monthChanged(e.target.value))} />
          <label className="row">Jornada (h)
            <input type="number" min={1} max={16} step={0.5} className="narrow" value={hours}
              onChange={(e) => setHours(e.target.value)} onBlur={saveHours} />
          </label>
          <div className="row">
            <button onClick={() => download("csv")}>CSV</button>
            <button onClick={() => download("xml")}>XML</button>
          </div>
        </div>

        {report.isFetching && !report.data && <p>Carregando...</p>}
        <table>
          <thead><tr><th>Data</th><th>Marcações</th><th>Trabalhado</th><th>Saldo</th></tr></thead>
          <tbody>
            {report.data?.days.map((d) => (
              <tr key={d.date} className={d.kind === "falta" ? "falta" : d.kind === "feriado" ? "feriado" : ""}>
                <td>{dateBR(d.date)} <small className="muted">{weekday(d.date)}</small></td>
                <td>
                  {d.holiday && <span className="tag">{d.holiday}</span>}
                  {d.kind === "falta" && <span className="tag">Falta</span>}
                  {d.punches.map((p) => (
                    <span key={p.id} className="chip" title={p.label}>
                      {time(p.at)}
                      <button aria-label={`Remover ${p.label} de ${dateBR(d.date)}`} onClick={() => removePunch(p.id)}>×</button>
                    </span>
                  ))}
                </td>
                <td>{fmt(d.worked)}</td>
                <td className={balanceClass(d)}>{d.complete ? fmt(d.balance, true) : "incompleto"}</td>
              </tr>
            ))}
            {report.data && report.data.days.length === 0 && <tr><td colSpan={4}>Nenhuma marcação neste mês.</td></tr>}
          </tbody>
          {report.data && (
            <tfoot><tr><td colSpan={2}>Total do mês</td><td>{fmt(report.data.totalWorked)}</td><td>{fmt(report.data.totalBalance, true)}</td></tr></tfoot>
          )}
        </table>
      </section>
    </div>
  );
}

const balanceClass = (d: Day) => (d.balance < 0 ? "neg" : d.balance > 0 ? "pos" : "");
