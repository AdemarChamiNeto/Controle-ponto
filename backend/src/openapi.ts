/**
 * Especificação OpenAPI 3 da API — servida em /api/docs (Swagger UI) e /api/docs.json.
 * Mantida à mão, junto das rotas; o teste de integração confere que toda rota real está documentada.
 */
const error = { $ref: "#/components/schemas/Error" };
const json = (schema: object) => ({ "application/json": { schema } });
const monthParam = {
  name: "month", in: "query", required: true, description: "Mês no formato YYYY-MM",
  schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$", example: "2026-09" },
};

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Controle de Ponto — API",
    version: "1.1.0",
    description:
      "API REST para registro de ponto, espelho mensal com saldo de horas, faltas e feriados nacionais (BrasilAPI), e exportação em CSV/XML.\n\n" +
      "**Como testar aqui:** use `POST /auth/register` (ou `/auth/login`), copie o `token` da resposta, clique em **Authorize** e cole o token.",
  },
  servers: [{ url: "/api" }],
  tags: [
    { name: "Auth", description: "Cadastro, login e dados do usuário" },
    { name: "Marcações", description: "Bater ponto e espelho do mês" },
  ],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      Error: { type: "object", properties: { error: { type: "string", example: "Dados inválidos" } } },
      User: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "Ana Souza" },
          email: { type: "string", format: "email", example: "ana@exemplo.com" },
          dailyMinutes: { type: "integer", description: "Jornada diária em minutos", example: 480 },
        },
      },
      AuthResponse: {
        type: "object",
        properties: { token: { type: "string", description: "JWT válido por 7 dias" }, user: { $ref: "#/components/schemas/User" } },
      },
      Punch: {
        type: "object",
        properties: {
          id: { type: "integer" },
          at: { type: "string", format: "date-time" },
          note: { type: "string", nullable: true },
          label: { type: "string", example: "Entrada", description: "Derivado da ordem no dia" },
        },
      },
      Day: {
        type: "object",
        properties: {
          date: { type: "string", format: "date", example: "2026-09-01" },
          kind: { type: "string", enum: ["normal", "feriado", "fim de semana", "falta"] },
          holiday: { type: "string", example: "Independência do Brasil" },
          punches: { type: "array", items: { $ref: "#/components/schemas/Punch" } },
          worked: { type: "integer", description: "Minutos trabalhados" },
          expected: { type: "integer", description: "Minutos esperados" },
          balance: { type: "integer", description: "Saldo do dia em minutos" },
          complete: { type: "boolean", description: "Número par de marcações" },
        },
      },
      Report: {
        type: "object",
        properties: {
          days: { type: "array", items: { $ref: "#/components/schemas/Day" } },
          totalWorked: { type: "integer" },
          totalBalance: { type: "integer" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: { tags: ["Auth"], summary: "Verifica se a API está no ar", responses: { 200: { description: "OK", content: json({ type: "object", properties: { ok: { type: "boolean" } } }) } } },
    },
    "/auth/register": {
      post: {
        tags: ["Auth"], summary: "Cria uma conta e já devolve o token",
        requestBody: { required: true, content: json({
          type: "object", required: ["name", "email", "password"],
          properties: { name: { type: "string", example: "Ana Souza" }, email: { type: "string", example: "ana@exemplo.com" }, password: { type: "string", minLength: 8, example: "senha-segura-123" } },
        }) },
        responses: {
          201: { description: "Conta criada", content: json({ $ref: "#/components/schemas/AuthResponse" }) },
          400: { description: "Dados inválidos", content: json(error) },
          409: { description: "Email já cadastrado", content: json(error) },
          429: { description: "Muitas tentativas", content: json(error) },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"], summary: "Login com email e senha",
        requestBody: { required: true, content: json({
          type: "object", required: ["email", "password"],
          properties: { email: { type: "string", example: "ana@exemplo.com" }, password: { type: "string", example: "senha-segura-123" } },
        }) },
        responses: {
          200: { description: "Login ok", content: json({ $ref: "#/components/schemas/AuthResponse" }) },
          401: { description: "Email ou senha incorretos", content: json(error) },
          429: { description: "Muitas tentativas", content: json(error) },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"], summary: "Dados do usuário logado", security: [{ bearer: [] }],
        responses: { 200: { description: "Usuário", content: json({ $ref: "#/components/schemas/User" }) }, 401: { description: "Não autenticado", content: json(error) } },
      },
      put: {
        tags: ["Auth"], summary: "Altera a jornada diária", security: [{ bearer: [] }],
        requestBody: { required: true, content: json({ type: "object", properties: { dailyMinutes: { type: "integer", minimum: 60, maximum: 960, example: 480 } } }) },
        responses: { 200: { description: "Usuário atualizado", content: json({ $ref: "#/components/schemas/User" }) }, 400: { description: "Fora do limite (1h a 16h)", content: json(error) } },
      },
    },
    "/punches": {
      post: {
        tags: ["Marcações"], summary: "Registra uma marcação (agora, ou no horário informado)", security: [{ bearer: [] }],
        requestBody: { content: json({
          type: "object",
          properties: { at: { type: "string", format: "date-time", example: "2026-09-29T08:00:00-03:00" }, note: { type: "string", maxLength: 200 } },
        }) },
        responses: {
          201: { description: "Marcação criada", content: json({ $ref: "#/components/schemas/Punch" }) },
          429: { description: "Batida automática a menos de 30 s da anterior", content: json(error) },
        },
      },
    },
    "/punches/{id}": {
      delete: {
        tags: ["Marcações"], summary: "Remove uma marcação", security: [{ bearer: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 204: { description: "Removida" }, 404: { description: "Não encontrada (ou é de outro usuário)" } },
      },
    },
    "/punches/report": {
      get: {
        tags: ["Marcações"], summary: "Espelho do mês com saldo, faltas e feriados", security: [{ bearer: [] }],
        parameters: [monthParam],
        responses: { 200: { description: "Espelho", content: json({ $ref: "#/components/schemas/Report" }) }, 400: { description: "Mês inválido", content: json(error) } },
      },
    },
    "/punches/report.csv": {
      get: {
        tags: ["Marcações"], summary: "Espelho do mês em CSV (abre no Excel)", security: [{ bearer: [] }],
        parameters: [monthParam],
        responses: { 200: { description: "Arquivo CSV", content: { "text/csv": { schema: { type: "string" } } } } },
      },
    },
    "/punches/report.xml": {
      get: {
        tags: ["Marcações"], summary: "Espelho do mês em XML", security: [{ bearer: [] }],
        parameters: [monthParam],
        responses: { 200: { description: "Arquivo XML", content: { "application/xml": { schema: { type: "string" } } } } },
      },
    },
  },
} as const;
