import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import {
  errorMessage, useDisableTwoFactorMutation, useEnableTwoFactorMutation, useSetupTwoFactorMutation,
} from "./store/api";

/** Verificação em duas etapas (TOTP), opcional: ativar com QR code e desativar com senha + código. */
export default function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const [setup, setupState] = useSetupTwoFactorMutation();
  const [enable, enableState] = useEnableTwoFactorMutation();
  const [disable, disableState] = useDisableTwoFactorMutation();
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);

  const secret = setupState.data?.secret;
  useEffect(() => {
    if (!setupState.data) return setQr("");
    QRCode.toDataURL(setupState.data.otpauthUrl, { margin: 1, width: 200 }).then(setQr, () => setQr(""));
  }, [setupState.data]);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    const r = await enable(code.trim());
    if (r.data) {
      setRecovery(r.data.recoveryCodes);
      setCode("");
      setupState.reset();
    }
  }

  async function turnOff(e: FormEvent) {
    e.preventDefault();
    const r = await disable({ password, code: code.trim() });
    if (!r.error) {
      setDisabling(false);
      setPassword("");
      setCode("");
    }
  }

  // códigos de recuperação: aparecem uma vez só, logo depois de ativar
  if (recovery) {
    return (
      <section className="card">
        <h2>Códigos de recuperação</h2>
        <p>Guarde num lugar seguro. Cada código entra <strong>uma vez</strong> se você perder o celular. Eles não serão mostrados de novo.</p>
        <ul className="codes">{recovery.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
        <div className="row">
          <button onClick={() => navigator.clipboard?.writeText(recovery.join("\n"))}>Copiar</button>
          <button className="link" onClick={() => setRecovery(null)}>Já guardei</button>
        </div>
      </section>
    );
  }

  if (enabled) {
    return (
      <section className="card">
        <div className="row spread">
          <h2>Verificação em duas etapas</h2>
          <span className="tag ok">Ativa</span>
        </div>
        {!disabling ? (
          <button className="link" onClick={() => setDisabling(true)}>Desativar</button>
        ) : (
          <form className="stack" onSubmit={turnOff}>
            <p className="muted">Para desativar, confirme a senha e um código do app (ou de recuperação).</p>
            <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            <input placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="one-time-code" aria-label="Código" />
            {disableState.error && <p className="error" role="alert">{errorMessage(disableState.error)}</p>}
            <div className="row">
              <button type="submit" disabled={disableState.isLoading}>Desativar 2FA</button>
              <button type="button" className="link" onClick={() => setDisabling(false)}>Cancelar</button>
            </div>
          </form>
        )}
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Verificação em duas etapas</h2>
      {!secret ? (
        <>
          <p className="muted">Opcional: além da senha, o login passa a pedir um código do app autenticador (Google Authenticator, Authy, Microsoft Authenticator…).</p>
          <button onClick={() => setup()} disabled={setupState.isLoading}>Ativar</button>
          {setupState.error && <p className="error" role="alert">{errorMessage(setupState.error)}</p>}
        </>
      ) : (
        <form className="stack" onSubmit={confirm}>
          <p>1. Leia o QR code no app autenticador.</p>
          {qr && <img src={qr} width={200} height={200} alt="QR code para o app autenticador" />}
          <p className="muted">Sem câmera? Digite a chave: <code className="secret">{secret.match(/.{1,4}/g)?.join(" ")}</code></p>
          <label className="stack">2. Digite o código de 6 dígitos que aparece no app
            <input value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" />
          </label>
          {enableState.error && <p className="error" role="alert">{errorMessage(enableState.error)}</p>}
          <div className="row">
            <button type="submit" disabled={enableState.isLoading}>Confirmar e ativar</button>
            <button type="button" className="link" onClick={() => setupState.reset()}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  );
}
