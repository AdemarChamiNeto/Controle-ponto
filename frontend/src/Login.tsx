import { useState, type FormEvent } from "react";
import { useAppDispatch } from "./store";
import { errorMessage, pontoApi, useLoginMutation, useRegisterMutation } from "./store/api";
import { loggedIn } from "./store/authSlice";

export default function Login() {
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [login, loginState] = useLoginMutation();
  const [register, registerState] = useRegisterMutation();
  const current = mode === "login" ? loginState : registerState;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = mode === "login"
      ? await login({ email, password })
      : await register({ name, email, password });
    if ("data" in r && r.data) {
      // já deixa o usuário no cache do RTK Query para não precisar buscar /me de novo
      dispatch(pontoApi.util.upsertQueryData("me", undefined, r.data.user));
      dispatch(loggedIn(r.data.token));
    }
  }

  return (
    <form className="card auth" onSubmit={submit}>
      <h1>Controle de Ponto</h1>
      {mode === "register" && <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />}
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Senha (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      {current.error && <p className="error" role="alert">{errorMessage(current.error)}</p>}
      <button type="submit" disabled={current.isLoading}>{mode === "login" ? "Entrar" : "Criar conta"}</button>
      <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Não tenho conta" : "Já tenho conta"}
      </button>
      <a className="docs-link" href="/api/docs/" target="_blank" rel="noreferrer">Documentação da API (Swagger)</a>
    </form>
  );
}
