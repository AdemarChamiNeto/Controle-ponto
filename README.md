# Controle de Ponto

Sistema pessoal de registro de ponto. Você bate o ponto, vê o espelho do mês com horas trabalhadas, saldo, faltas e feriados, e exporta o mês em CSV ou XML.

**Stack:** React 18 + TypeScript + Vite · Redux Toolkit + RTK Query · Node.js + Express 5 + TypeScript · PostgreSQL · JWT · BrasilAPI (webservice de feriados) · Docker Compose · GitHub Actions

## Funcionalidades

- Batida de ponto em um clique ou marcação manual, com bloqueio de clique duplo (menos de 30 s entre batidas).
- Espelho mensal com horas trabalhadas, jornada esperada e saldo por dia e no mês.
- **Faltas:** dia útil sem marcação conta como falta e desconta a jornada inteira. Dias antes do cadastro e o dia de hoje não contam.
- **Feriados nacionais:** vêm do webservice da [BrasilAPI](https://brasilapi.com.br/docs#tag/Feriados-Nacionais) e ficam em cache no banco, então a API externa só é chamada uma vez por ano. Trabalho em feriado ou fim de semana vira hora extra. Se a BrasilAPI estiver fora do ar, o espelho continua funcionando sem os feriados.
- **Exportação** em CSV (abre no Excel, com BOM UTF-8) e em **XML**, para integração com outros sistemas.
- Jornada diária configurável.

## Arquitetura

```
frontend/src/
  store/            Redux Toolkit
    api.ts          RTK Query — endpoints, cache com tags e logout automático em 401
    authSlice.ts    token da sessão (persistido no localStorage)
    reportSlice.ts  mês selecionado
  Dashboard.tsx · Login.tsx
backend/src/
  app.ts            Express (separado do listen, para testar em memória)
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

## Testes

```bash
cd backend && npm test     # unitários (cálculo, XML, BrasilAPI com fetch falso)
DATABASE_URL=postgres://ponto:ponto@localhost:5432/ponto npm test   # + integração da API
cd frontend && npm test    # store Redux e tratamento de erros
```

Os testes de integração sobem o Express em memória contra um PostgreSQL real. Eles cobrem cadastro e login, rotas protegidas, espelho, CSV, XML, bloqueio de batida dupla e isolamento entre usuários. No GitHub Actions eles rodam com um container PostgreSQL a cada push.

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
- Deploy.

## Autor

Ademar C. Neto
