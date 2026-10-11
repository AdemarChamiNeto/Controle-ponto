import { useState, type FormEvent } from "react";
import { errorMessage, useLoginMutation, useLoginSecondFactorMutation, useRegisterMutation } from "./store/api";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register" | "code">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [login, loginState] = useLoginMutation();
  const [register, registerState] = useRegisterMutation();
  const [secondFactor, secondFactorState] = useLoginSecondFactorMutation();
  const current = mode === "login" ? loginState : mode === "register" ? registerState : secondFactorState;

  // quem entra com sucesso vai direto para o painel: a mutation já grava o usuário no cache do `me`
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "register") return void register({ name, email, password });
    if (mode === "code") return void secondFactor(code.trim());
    const r = await login({ email, password });
    if (r.data?.twoFactorRequired) {
      setPassword("");
      setMode("code");
    }
  }

  if (mode === "code") {
    return (
      <form className="card auth" onSubmit={submit}>
        <h1>Verificação em duas etapas</h1>
        <p className="muted">Digite o código de 6 dígitos do app autenticador, ou um dos seus códigos de recuperação.</p>
        <input
          value={code} onChange={(e) => setCode(e.target.value)} required autoFocus
          inputMode="text" autoComplete="one-time-code" placeholder="123456" aria-label="Código"
        />
        {current.error && <p className="error" role="alert">{errorMessage(current.error)}</p>}
        <button type="submit" disabled={current.isLoading}>Confirmar</button>
        <button type="button" className="link" onClick={() => { setCode(""); setMode("login"); }}>Voltar</button>
      </form>
    );
  }

  return (
    <form className="card auth" onSubmit={submit}>
      <h1>Controle de Ponto</h1>
      {mode === "register" && <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />}
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      <input
        type="password" placeholder="Senha (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)}
        required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"}
      />
      {current.error && <p className="error" role="alert">{errorMessage(current.error)}</p>}
      <button type="submit" disabled={current.isLoading}>{mode === "login" ? "Entrar" : "Criar conta"}</button>
      <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Não tenho conta" : "Já tenho conta"}
      </button>
      <a className="docs-link" href="/api/docs/" target="_blank" rel="noreferrer">Documentação da API (Swagger)</a>
    </form>
  );
}
