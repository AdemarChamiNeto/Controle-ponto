import Dashboard from "./Dashboard";
import Login from "./Login";
import { useAppSelector } from "./store";
import { useMeQuery } from "./store/api";

export default function App() {
  const token = useAppSelector((s) => s.auth.token);
  const { data: user, isLoading } = useMeQuery(undefined, { skip: !token });

  if (!token) return <Login />;
  if (isLoading || !user) return <p className="center">Carregando...</p>;
  return <Dashboard user={user} />;
}
