# Controle de Ponto

Sistema pessoal de registro de ponto. Você bate o ponto, vê o espelho do mês com horas trabalhadas, saldo, faltas e feriados, e exporta o mês em CSV ou XML.

**Stack:** React 18 + TypeScript + Vite · Redux Toolkit + RTK Query · Node.js + Express 5 + TypeScript · PostgreSQL · JWT · OpenAPI/Swagger · BrasilAPI (webservice de feriados) · Docker · GitHub Actions

**Demo:** [controle-ponto-jvo5.onrender.com](https://controle-ponto-jvo5.onrender.com) · **Documentação da API:** [/api/docs](https://controle-ponto-jvo5.onrender.com/api/docs)

> Hospedado no plano grátis do Render: se ficar parado, a primeira visita demora uns 30 segundos para "acordar".

## Funcionalidades

- Batida de ponto em um clique ou marcação manual, com bloqueio de clique duplo (menos de 30 s entre batidas).
- Espelho mensal com horas trabalhadas, jornada esperada e saldo por dia e no mês.
- **Faltas:** dia útil sem marcação conta como falta e desconta a jornada inteira. Dias antes do cadastro e o dia de hoje não contam.
- **Feriados nacionais:** vêm do webservice da [BrasilAPI](https://brasilapi.com.br/docs#tag/Feriados-Nacionais) e ficam em cache no banco, então a API externa só é chamada uma vez por ano. Trabalho em feriado ou fim de semana vira hora extra. Se a BrasilAPI estiver fora do ar, o espelho continua funcionando sem os feriados.
- **Exportação** em CSV (abre no Excel, com BOM UTF-8) e em **XML**, para integração com outros sistemas.
- Jornada diária configurável.
- **Documentação interativa da API** com Swagger (OpenAPI 3) em `/api/docs`: dá para criar conta e testar cada rota pelo navegador (a sessão vai no cookie).
- **Verificação em duas etapas (opcional):** o usuário ativa pela tela, lendo um QR code no app autenticador (Google Authenticator, Authy…), e recebe 10 códigos de recuperação. Depois disso o login pede o código de 6 dígitos.
- **Segurança:**
  - sessão em cookie `httpOnly` + `Secure` + `SameSite=Lax`, fora do alcance do JavaScript da página;
  - senha com bcrypt custo 12 (hashes antigos são refeitos no próximo login);
  - rate limit em **todos** os endpoints, com 429 e `Retry-After`;
  - helmet, limite de tamanho do corpo da requisição e 404 em JSON;
  - o servidor não sobe se faltar variável de ambiente obrigatória.
- **Pronto para publicar:**
  - ícones (favicon, Apple, PWA), manifest, Open Graph 1200×630, JSON-LD, `robots.txt` (bloqueia `/api/`, libera o Swagger), sitemap e `llms.txt`;
  - página de privacidade e 404 de verdade para caminhos que não existem;
  - respostas comprimidas (gzip);
  - Lighthouse: performance 99, acessibilidade 100, boas práticas 96 e SEO 100.
- **Estatísticas só com consentimento (LGPD):** GA4 e Clarity carregam apenas depois de "Aceitar", e só se os IDs estiverem configurados. No Clarity, a área do espelho de ponto é mascarada (`data-clarity-mask`): nome e horários não vão para a gravação.

## Arquitetura

```
frontend/src/
  store/            Redux Toolkit
    api.ts          RTK Query — endpoints, cache com tags; `me` = quem está logado (401 → tela de login)
    reportSlice.ts  mês selecionado
  Dashboard.tsx · Login.tsx (login em dois passos) · TwoFactorCard.tsx (ativar/desativar 2FA)
backend/src/
  app.ts            Express (separado do listen, para testar em memória) + Swagger, helmet
  env.ts            variáveis obrigatórias validadas com Zod
  auth.ts           sessão em cookie httpOnly (JWT) e login pendente de 2FA
  limits.ts         rate limit: leitura, escrita, login, cadastro e 2FA
  totp.ts           TOTP (RFC 6238) com o crypto do Node, sem dependência
  secrets.ts        AES-256-GCM do segredo do 2FA + códigos de recuperação
  openapi.ts        especificação OpenAPI 3 da API
  calc.ts           regras de cálculo: pares entrada/saída, saldo, faltas, feriados
  holidays.ts       cliente da BrasilAPI + cache no PostgreSQL
  xml.ts            geração do espelho em XML
  routes/           auth (bcrypt + 2FA) e punches
```

### Decisões

- **O tipo da marcação não é gravado.** Entrada, saída para almoço etc. são derivados da ordem das marcações no dia, então adicionar ou remover uma marcação nunca deixa o histórico inconsistente.
- **Fuso fixo** `America/Sao_Paulo` para agrupar as marcações por dia.
- **Dia incompleto** (número ímpar de marcações) não entra no saldo.
- **O cache de feriados fica no banco, e não em memória.** Assim ele sobrevive a restart. Quando a consulta falha, só tenta de novo depois de 10 minutos.
- **Estado do servidor no RTK Query, estado da interface em slices.** A lista do espelho, o usuário e as mutações ficam no cache do RTK Query, que invalida o espelho sozinho a cada batida. O mês selecionado fica num slice comum.
- **Sessão em cookie httpOnly, e não no `localStorage`.** Com o token no `localStorage`, qualquer XSS rouba a sessão. Como front e API saem do mesmo domínio, o cookie vai sozinho, sem CORS, e `SameSite=Lax` impede que outro site mande um POST usando a sessão (CSRF). O front descobre quem está logado perguntando ao `/api/auth/me`.
- **2FA opcional.** O padrão do projeto é ter 2FA, mas obrigatório ele impediria quem visita a demo de testar sem um app autenticador. O fluxo existe e tem teste de ponta a ponta.
  - O segredo é criptografado com AES-256-GCM (chave em `TOTP_ENCRYPTION_KEY`).
  - O código não pode ser reutilizado: o banco guarda o último passo de 30 s usado.
  - Desativar o 2FA pede a senha e um código.
  - Os códigos de recuperação são guardados com SHA-256 e não com bcrypt: são aleatórios e longos, então não precisam do custo que existe para senhas escolhidas por pessoas.
- **Tabelas novas no padrão, antigas como estão.**
  - `user_totp` e `recovery_codes` ficam separadas do perfil, com `timestamptz`, `updated_at` por trigger e `ON DELETE CASCADE` comentado.
  - `users` e `punches` continuam com id inteiro, porque migrar seria uma refatoração destrutiva.
  - O isolamento entre usuários é feito na aplicação (toda consulta filtra pelo usuário da sessão), com teste.
- **Rate limit em memória.** O Render grátis roda uma instância só. Com mais de uma, o contador precisa ir para um armazenamento compartilhado (Redis ou o próprio Postgres).

## Rodando com Docker

```bash
cp .env.example .env          # preencha JWT_SECRET e TOTP_ENCRYPTION_KEY (openssl rand -hex 32, um para cada)
docker compose up -d --build  # app em http://localhost:8080
```

## Rodando em desenvolvimento

```bash
docker compose up -d db               # PostgreSQL
cd backend && cp .env.example .env    # edite JWT_SECRET e TOTP_ENCRYPTION_KEY
npm install && npm run dev            # API em :3001
# em outro terminal
cd frontend && npm install && npm run dev   # app em :5173 (proxy /api → :3001)
```

## Deploy (grátis): Neon + Render

A imagem do `Dockerfile` da raiz junta tudo num serviço só: a API Express também entrega o front compilado.

1. **Banco:** crie um projeto no [Neon](https://neon.tech). Copie a *connection string*, que termina com `?sslmode=require`.
2. **App:** no [Render](https://render.com), vá em **New + → Blueprint** e escolha este repositório. O `render.yaml` já configura tudo.
3. Quando ele pedir `DATABASE_URL`, cole a string do Neon. O `JWT_SECRET` e a `TOTP_ENCRYPTION_KEY` são gerados sozinhos.
4. Em alguns minutos o app sobe em `https://<nome>.onrender.com`. As tabelas são criadas na primeira subida.

GA4 e Clarity (opcionais): no painel do Render, crie `VITE_GA_ID` e `VITE_CLARITY_ID` em **Environment** e faça um novo deploy. São IDs públicos que entram no build do front (o Dockerfile recebe como build args).

> No plano grátis, o Render "dorme" depois de 15 minutos sem acesso. A primeira visita depois disso demora uns 30 segundos.

## Testes

```bash
cd backend && npm test     # unitários (cálculo, XML, BrasilAPI com fetch falso, TOTP com os vetores da RFC 6238, criptografia)
DATABASE_URL=postgres://ponto:ponto@localhost:5432/ponto npm test   # + integração da API
cd frontend && npm test    # sessão (login com e sem 2FA, sessão vencida, logout), store e erros + aviso de cookies
```

Os testes de integração sobem o Express em memória contra um PostgreSQL real e cobrem:
- cadastro e login, com o cookie `HttpOnly` e sem token no corpo;
- rotas protegidas, espelho, CSV, XML e bloqueio de batida dupla;
- isolamento entre usuários;
- o fluxo inteiro do 2FA: ativar, login em dois passos, código reutilizado recusado, código de recuperação de uso único e desativar;
- rehash de senha antiga;
- rate limit de login e de escrita, com `Retry-After`;
- se toda rota está documentada no Swagger.

No GitHub Actions eles rodam com um container PostgreSQL a cada push.

## API (REST)

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/auth/register` · `/api/auth/login` | cria conta / entra (sessão no cookie; com 2FA, responde `twoFactorRequired`) |
| POST | `/api/auth/login/2fa` | segundo passo do login: código do app ou de recuperação |
| POST | `/api/auth/logout` | encerra a sessão |
| GET · PUT | `/api/auth/me` | dados do usuário / jornada diária |
| POST | `/api/auth/2fa/setup` · `/enable` · `/disable` | gera o QR code / ativa com o primeiro código / desativa (senha + código) |
| POST | `/api/punches` | registra marcação (agora, ou `at` manual) |
| DELETE | `/api/punches/:id` | remove marcação |
| GET | `/api/punches/report?month=YYYY-MM` | espelho do mês (JSON) |
| GET | `/api/punches/report.csv?month=YYYY-MM` | espelho em CSV |
| GET | `/api/punches/report.xml?month=YYYY-MM` | espelho em XML |

Exemplo de XML:

```xml
<espelhoPonto mes="2026-09" geradoEm="2026-09-30T12:00:00.000Z">
  <colaborador><nome>Ana</nome><email>ana@exemplo.com</email></colaborador>
  <dias>
    <dia data="2026-09-01" tipo="normal" completo="true">
      <marcacoes>
        <marcacao tipo="Entrada" horario="08:00" instante="2026-09-01T11:00:00.000Z"/>
        <marcacao tipo="Saída almoço" horario="12:00" instante="2026-09-01T15:00:00.000Z"/>
      </marcacoes>
      <trabalhadoMin>240</trabalhadoMin>
      <esperadoMin>480</esperadoMin>
      <saldoMin>-240</saldoMin>
    </dia>
    <dia data="2026-09-07" tipo="feriado" feriado="Independência do Brasil" completo="true">
      ...
    </dia>
  </dias>
  <totais trabalhadoMin="240" saldoMin="-240"/>
</espelhoPonto>
```

## Próximos passos

- Edição de marcação.
- Feriados estaduais e municipais.

## Autor

Ademar C. Neto
