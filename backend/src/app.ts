import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { punchRouter } from "./routes/punches.js";

/** Monta o app Express sem abrir porta — assim os testes de integração sobem ele em memória. */
export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());
  app.get("/api/health", (_req, res) => void res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/punches", punchRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  });
  return app;
}
