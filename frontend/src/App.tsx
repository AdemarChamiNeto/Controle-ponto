import Dashboard from "./Dashboard";
import Login from "./Login";
import { errorMessage, useMeQuery } from "./store/api";

export default function App() {
  // quem está logado vem da API (o cookie da sessão é httpOnly, o JS não lê)
  const { data: user, isLoading, error, refetch } = useMeQuery();

  if (isLoading) return <p className="center">Carregando...</p>;
  if (error) {
    return (
      <p className="center" role="alert">
        {errorMessage(error)} <button className="link" onClick={() => refetch()}>Tentar de novo</button>
      </p>
    );
  }
  if (!user) return <Login />;
  return <Dashboard user={user} />;
}
