> Parte A (fundamentos), §2. Decisão fechada: não reabrir. Índice e regras de leitura em `docs/plano/README.md`.

## 2. Decisões técnicas

### 2.1 Plataforma

| Item | Versão | Justificativa |
|---|---|---|
| Node.js | 24.22.1 LTS (`.nvmrc` = `24`) | LTS atual; `node:sqlite` estável para o importador |
| pnpm | 12.14.0 (`packageManager`) | Bloqueia scripts de instalação por padrão (`allowBuilds`) e aplica `minimumReleaseAge` |
| PostgreSQL | 18.6 (`postgres:18.6-alpine`) | Imagem oficial; `pg_trgm` e `unaccent` incluídos e *trusted* |
| Mailpit | `axllent/mailpit:v1.31` (só dev) | SMTP local para a Fase 2 |
| Caddy | 2.x (pacote da distro) | TLS automático ou interno, compressão |

Decisão: PostgreSQL 18.6, não 17. É a imagem verificada em `docs/plano/relatorios/stack.md` §4 (`docker-compose.yml`), e `BEGIN ATOMIC` exige ≥ 14.

### 2.2 Bibliotecas (versões exatas, sem `^`)

**API (`apps/api`)**

| Pacote | Versão | Por quê |
|---|---|---|
| fastify | 5.12.7 | HTTP rápido, hooks, encapsulamento, `inject` nos testes |
| fastify-plugin | 6.0.1 | Plugins sem encapsulamento |
| fastify-type-provider-zod | 7.0.0 | Zod como validador e serializador; `jsonSchemaTransform` para OpenAPI |
| zod | 4.6.7 (catalog) | Um único sistema de schemas para API, front, env e socket |
| @fastify/cookie | 11.1.3 | Cookie de sessão e `app.parseCookie` no Socket.IO |
| @fastify/helmet | 13.2.0 | CSP e cabeçalhos de segurança |
| @fastify/rate-limit | 11.2.1 | Limite global e por rota |
| @fastify/under-pressure | 9.2.1 | 503 quando o event loop atrasa |
| @fastify/multipart | 10.1.4 | Upload em streaming com limites |
| @fastify/static | 10.1.6 | Serve a SPA em produção |
| @fastify/swagger | 9.9.2 | OpenAPI 3.1 a partir das rotas |
| @scalar/fastify-api-reference | 1.75.0 | Interface de documentação (só em dev) |
| @fastify/proxy-addr | 5.1.2 | Mesmo cálculo de IP do `trustProxy` no handshake do socket |
| close-with-grace | 2.5.0 | Desligamento gracioso |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.1 / 7.10.1 / 7.10.1 | ORM, migrações, driver `pg`. **Nunca a 8.x RC** |
| @node-rs/argon2 | 2.2.2 | Argon2id pré-compilado, sem scripts de instalação, funciona no Windows |
| otplib | 13.5.0 | TOTP (API funcional v13) |
| @zxcvbn-ts/core / language-common / language-pt-br | 4.2.0 / 4.1.3 / 4.1.1 | Força da senha |
| socket.io | 4.8.4 | Tempo real com salas e ack |
| rate-limiter-flexible | 11.2.3 | Limites por evento de socket (`RateLimiterMemory`) |
| pg-boss | 12.38.0 | Filas e cron no próprio Postgres |
| file-type | 22.2.0 | Tipo real do arquivo pelos primeiros bytes |
| content-disposition | 3.0.0 | Cabeçalho de download seguro (traz tipos próprios) |
| luxon / @types/luxon | 3.7.2 / 3.7.6 | Calendário de SLA com fuso e horário de verão |
| nodemailer | 10.1.7 | Fase 2 (traz tipos próprios) |
| ldapts | 9.2.0 | Fase 2 |
| dev: tsx | 4.23.15 | `dev` com watch e scripts |
| dev: tsdown | 0.23.1 | Bundle ESM `dist/server.mjs` que embute o shared |
| dev: vitest | 5.0.5 (catalog) | Testes |
| dev: @types/node | 24.19.2 (catalog) | Tipos do Node 24 |
| dev: pino-pretty | 13.2.0 | Logs legíveis em dev |
| dev: @faker-js/faker | 10.6.0 | Fábricas e seed de demonstração |
| dev: fast-check | 4.10.2 | Testes de propriedade do SLA |
| dev: socket.io-client | 4.8.4 | Testes de socket |

**Front (`apps/web`)**

| Pacote | Versão | Por quê |
|---|---|---|
| react / react-dom | 19.3.1 | UI |
| @types/react / @types/react-dom | 19.3.0 | Tipos |
| vite / @vitejs/plugin-react | 8.3.4 / 6.1.2 | Build. A 8.3.5 tem menos de 24 h e é barrada pelo `minimumReleaseAge` |
| @tanstack/react-router / @tanstack/router-plugin | 1.170.45 / 1.168.47 | Rotas por arquivo, search params tipados |
| @tanstack/react-query / -devtools | 5.104.5 / 5.104.5 | Cache de servidor |
| @tanstack/react-table | 8.21.3 | Tabelas com paginação no servidor (v8, não v9) |
| tailwindcss / @tailwindcss/vite / tw-animate-css | 4.3.3 / 4.3.3 / 1.4.0 | Estilo |
| shadcn (CLI via dlx) | 4.22.1 | Componentes Radix |
| radix-ui, class-variance-authority, clsx, tailwind-merge | 1.8.1, 0.7.1, 2.1.1, 3.7.0 | Instalados pelo `shadcn add` |
| lucide-react | 1.59.0 | Ícones. A 1.61.0 saiu hoje e é barrada pela idade mínima |
| cmdk / sonner / recharts / input-otp / react-day-picker | 1.1.1 / 2.0.8 / 3.10.1 / 1.5.0 / 10.0.2 | Via componentes shadcn |
| react-hook-form / @hookform/resolvers | 7.90.0 / 6.0.0 | Formulários com `zodResolver` |
| socket.io-client | 4.8.4 | Tempo real |
| date-fns | 4.4.0 | Formatação pt-BR |
| react-markdown / remark-gfm | 10.1.0 / 4.0.1 | Markdown seguro (sem `rehype-raw`) |
| react-dropzone | 20.1.4 | Upload por arrastar e colar |
| qrcode.react | 4.2.0 | QR do 2FA no cliente |
| @fontsource-variable/inter / jetbrains-mono | 5.3.0 / 5.3.0 | Fontes locais (sem CDN) |
| @zxcvbn-ts/* | as mesmas da API | Medidor de força (chunk carregado sob demanda) |
| dev: @tanstack/router-cli | 1.167.45 | `tsr generate` antes do `tsc -b` (regenera `src/routeTree.gen.ts`); usa o mesmo `@tanstack/router-generator@1.167.45` do `@tanstack/router-plugin@1.168.47` |
| dev: vitest 5.0.5, jsdom 30.1.3, @testing-library/react 16.3.3, user-event 14.6.8, jest-dom 7.0.1 | — | Testes de componente |
| dev: @playwright/test 1.64.1, @axe-core/playwright 4.14.0 | — | E2E e acessibilidade |

**Ferramentas:** typescript 6.0.3 (catalog), @biomejs/biome 2.5.15, gitleaks (action no CI), Renovate.

### 2.3 Decisões de conflito entre relatórios

- Decisão: **TypeScript 6.0.3 + Biome 2.5.15**, sem ESLint/Prettier. O TS 7 não expõe a API JS; o typescript-eslint trava em TS < 6.1. As regras de a11y e de segurança de `docs/plano/relatorios/design.md` §0 e §4.2 (lá previstas em ESLint) viram regras do Biome (`noDangerouslySetInnerHtml`, `noRestrictedGlobals`, recommended a11y).
- Decisão: **luxon 3.7.2 só na API**, para o motor de SLA (código pronto e testado em `docs/plano/relatorios/dados.md` §6.2 e §6.5). **date-fns 4.4.0 só no front**, para formatação. O `@date-fns/tz` sai.
- Decisão: **prefixo `/api/v1`**, formato de erro `{ erro: { codigo, mensagem, detalhes?, requestId } }` e paginação `{ itens, total, pagina, porPagina }`, como em `docs/plano/relatorios/stack.md` §2.2.
- Decisão: **contratos Zod em `packages/shared` + `chamar()`** no front, sem codegen e sem `features/*/api.ts`. Só `lib/api.ts` chama `fetch`.
- Decisão: **CSRF em duas camadas** (Origin/Sec-Fetch-Site e `X-CSRF-Token` HMAC da sessão), mais SameSite=Strict. O `origemPlugin` simples de `docs/plano/relatorios/stack.md` §3.b é substituído.
- Decisão: **cookie `__Host-vinimon_sid`** em HTTPS e `vinimon_sid` em HTTP, derivado de `APP_ORIGIN`. Não existe env `SESSAO_COOKIE`.
- Decisão: **perfis fixos** (enum `Perfil`) com tabela de permissões em código (`packages/shared/src/permissoes.ts`). As tabelas RBAC de `docs/plano/relatorios/dados.md` §1 (`papeis`, `permissoes`) saem.
- Decisão: **ids `Int` autoincrement** (preservam os ids da v1 e facilitam cursores). `Sessao` e `Anexo` usam `uuid`.
- Decisão: **`interno: Boolean`** em assentamento, anexo, evento e notificação, no lugar de `tipo=privado` ou `visibilidade`.
- Decisão: **a notificação não guarda texto do usuário**. O trecho é montado na leitura, reaplicando a visibilidade. A notificação na área de trabalho nunca leva o texto da mensagem.
- Decisão: **menção inválida não bloqueia o envio**. Vira texto simples, não notifica, e volta em `mencoesIgnoradas`, com o nome tirado do token (não do banco).
- Decisão: **socket só por WebSocket** (`transports: ['websocket']`), Origin obrigatório e **sem** `connectionStateRecovery`. O cliente se corrige via REST ao reconectar.
- Decisão: **toda escrita persistente passa pelo REST** (comentário, leitura, status manual de presença, seguir). O socket só leva sinais efêmeros e o push do servidor.
- Decisão: **busca Ctrl+K pelo Prisma** (`contains` em `buscaNorm` com índice trigram) combinada com `escopoChamados`. Não há SQL cru para chamados. O tsvector fica só em `artigos`.
- Decisão: **`escaparLike()`** em todo `contains` que recebe texto livre. O teste T62 confirma.
- Decisão: **QR do 2FA gerado no cliente** (`qrcode.react`). A API devolve só `otpauthUri` e `segredo`. O `qrcode` no servidor sai.
- Decisão: **jitless do Zod** em `public/theme-init.js` (`window.__zod_globalConfig = { jitless: true }`), carregado antes do bundle. O Zod lê esse objeto ao carregar, e assim a CSP não registra violação.
- Decisão: **cada cadastro tem sua própria rota** no front (`routes/_app/admin/<entidade>.tsx`), copiada do exemplo canônico de áreas. O `EntidadeDescritor` genérico sai.
- Decisão: **deploy em processo único** (systemd + Caddy). Sem compose de produção. Backup por timer systemd com restic.
- Decisão: **localização dos arquivos**:
  - escopo em `apps/api/src/autorizacao/chamados.ts`;
  - SLA em `apps/api/src/modules/sla/`;
  - situação de SLA para a interface em `packages/shared/src/sla.ts`.

### 2.4 Sugestões de libs para a API (pedido do usuário)

**Recomendação principal (adotada):** Fastify 5.12.7 + Zod 4.6.7 + fastify-type-provider-zod 7.0.0 + Prisma 7.10.1 (adapter-pg) + Socket.IO 4.8.4 + pg-boss 12.38.0.
- Validação e serialização numa só fonte: o schema da resposta remove campos não declarados.
- OpenAPI gerado.
- Testes sem rede com `app.inject`.
- Plugins oficiais maduros (helmet, rate-limit, multipart, static, cookie).
- É um padrão que o Haiku conhece bem.

| Alternativa | Versão hoje | Quando escolher | Por que não aqui |
|---|---|---|---|
| Hono + @hono/zod-openapi + @hono/node-server | 4.13.13 / 1.6.3 / 2.1.5 | API multi-runtime (edge, Bun, Workers), OpenAPI nativo | Ecossistema Node para multipart, static e rate-limit menos maduro; Socket.IO fora do modelo |
| NestJS | 12.2.0 | Times grandes acostumados a DI e decorators | Muita "mágica" (decorators, módulos) para agentes Haiku; mais código por funcionalidade |
| Express 5 + zod | 5.3.0 | Equipe só conhece Express | Sem tipagem por schema nem serializador; segurança montada à mão |
| tRPC | 11.19.0 | Front e back só em TS, sem clientes externos | Perde REST/OpenAPI e a futura API pública (H01) |
| Elysia (Bun) | 1.4.30 | Projeto já em Bun | Exige trocar o runtime |

**Por necessidade da API:**
- **Autenticação:** sessão própria em tabela (S17–S25) com @node-rs/argon2 e otplib. Alternativa: better-auth 1.7.12 (pronto, mas impõe o próprio schema; não adotado). lucia 3.2.2 está descontinuado.
- **Validação de env:** o próprio Zod, sem dotenv (`process.loadEnvFile`).
- **Filas:** pg-boss (sem Redis). Alternativa: BullMQ (exige Redis).
- **Tempo real:** Socket.IO. Alternativas: `ws` puro (sem salas e ack) ou SSE (unidirecional).
- **E-mail:** nodemailer.
- **LDAP:** ldapts.
- **Upload:** @fastify/multipart + file-type.
- **Logs:** pino, embutido no Fastify.
- **Documentação:** @fastify/swagger + Scalar.
