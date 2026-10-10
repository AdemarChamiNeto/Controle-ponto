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
- **Documentação interativa da API** com Swagger (OpenAPI 3) em `/api/docs`: dá para criar conta, autorizar com o token e testar cada rota pelo navegador.
- **Segurança básica:** limite de tentativas no login e cadastro (contra força bruta), cabeçalhos HTTP de segurança (helmet), limite de tamanho do corpo da requisição e 404 em JSON para rotas inexistentes.

## Arquitetura

```
frontend/src/
  store/            Redux Toolkit
    api.ts          RTK Query — endpoints, cache com tags e logout automático em 401
    authSlice.ts    token da sessão (persistido no localStorage)
    reportSlice.ts  mês selecionado
  Dashboard.tsx · Login.tsx
backend/src/
  app.ts            Express (separado do listen, para testar em memória) + Swagger, helmet, rate limit
  openapi.ts        especificação OpenAPI 3 da API
  calc.ts           regras de cálculo: pares entrada/saída, saldo, faltas, feriados
  holidays.ts       cliente da BrasilAPI + cache no PostgreSQL
  xml.ts            geração do espelho em XML
  routes/           auth (JWT + bcrypt) e punches
```

### Decisões

- **O tipo da marcação não é gravado.** Entrada, saída para almoço etc. são derivados da ordem das marcações no dia, então adicionar ou remover uma marcação nunca deixa o histórico inconsistente.
- **Fuso fixo** `America/Sao_Paulo` para agrupar as marcações por dia.
- **Dia incompleto** (número ímpar de marcações) não entra no saldo.
- **O cache de feriados fica no banco, e não em memória.** Assim ele sobrevive a restart. Quando a consulta falha, só tenta de novo depois de 10 minutos.
- **Estado do servidor no RTK Query, estado da interface em slices.** A lista do espelho, o usuário e as mutações ficam no cache do RTK Query, que invalida o espelho sozinho a cada batida. O mês selecionado e o token ficam em slices comuns.

## Rodando com Docker

```bash
cp .env.example .env          # preencha JWT_SECRET (openssl rand -hex 32)
docker compose up -d --build  # app em http://localhost:8080
```

## Rodando em desenvolvimento

```bash
docker compose up -d db               # PostgreSQL
cd backend && cp .env.example .env    # edite JWT_SECRET
npm install && npm run dev            # API em :3001
# em outro terminal
cd frontend && npm install && npm run dev   # app em :5173 (proxy /api → :3001)
```

## Deploy (grátis): Neon + Render

A imagem do `Dockerfile` da raiz junta tudo num serviço só: a API Express também entrega o front compilado.

1. **Banco:** crie um projeto no [Neon](https://neon.tech). Copie a *connection string*, que termina com `?sslmode=require`.
2. **App:** no [Render](https://render.com), vá em **New + → Blueprint** e escolha este repositório. O `render.yaml` já configura tudo.
3. Quando ele pedir `DATABASE_URL`, cole a string do Neon. O `JWT_SECRET` é gerado sozinho.
4. Em alguns minutos o app sobe em `https://<nome>.onrender.com`. As tabelas são criadas na primeira subida.

> No plano grátis, o Render "dorme" depois de 15 minutos sem acesso. A primeira visita depois disso demora uns 30 segundos.

## Testes

```bash
cd backend && npm test     # unitários (cálculo, XML, BrasilAPI com fetch falso)
DATABASE_URL=postgres://ponto:ponto@localhost:5432/ponto npm test   # + integração da API
cd frontend && npm test    # store Redux e tratamento de erros
```

Os testes de integração sobem o Express em memória contra um PostgreSQL real. Eles cobrem cadastro e login, rotas protegidas, espelho, CSV, XML, bloqueio de batida dupla, isolamento entre usuários, limite de tentativas de login e se toda rota está documentada no Swagger. No GitHub Actions eles rodam com um container PostgreSQL a cada push.

## API (REST)

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/auth/register` · `/api/auth/login` | cria conta / entra (retorna JWT) |
| GET · PUT | `/api/auth/me` | dados do usuário / jornada diária |
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
