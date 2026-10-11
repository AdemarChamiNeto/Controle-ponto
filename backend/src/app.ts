import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { openapi } from "./openapi.js";
import { createLimits } from "./limits.js";
import { createAuthRouter } from "./routes/auth.js";
import { punchRouter } from "./routes/punches.js";

/** Monta o app Express sem abrir porta — assim os testes de integração sobem ele em memória. */
export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // atrás do proxy do Render: IP real vem do X-Forwarded-For

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json({ limit: "100kb" }));

  // rate limit em toda a API: leitura e escrita por usuário (ou IP); login, cadastro e 2FA com limites próprios
  const limits = createLimits();
  app.use("/api", limits.read, limits.write);

  app.get("/api/health", (_req, res) => void res.json({ ok: true }));
  app.get("/api/docs.json", (_req, res) => void res.json(openapi));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi, {
    customSiteTitle: "Controle de Ponto — API",
    swaggerOptions: { persistAuthorization: true },
  }));
  app.use("/api/auth", createAuthRouter(limits));
  app.use("/api/punches", punchRouter);
  app.use("/api", (_req, res) => void res.status(404).json({ error: "Rota não encontrada" }));

  // Em produção (deploy de serviço único) a API também entrega o front já compilado.
  const staticDir = process.env.STATIC_DIR;
  if (staticDir && fs.existsSync(path.join(staticDir, "index.html"))) {
    app.use(express.static(staticDir, { maxAge: "1h", index: false }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.resolve(staticDir, "index.html")));
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  });
  return app;
}
