> Relatório do especialista, copiado literalmente (referência). Em conflito vale a Parte A (`docs/plano/fundamentos/`), depois a Parte B (`docs/plano/tarefas/`), depois este relatório.

# Stack, bibliotecas e arquitetura da API (Vinimon v2)

Todas as versões abaixo foram conferidas com `npm view` em 21/10/2026, com a rede funcionando. Os sites prisma.io e pnpm.io não resolveram DNS. Por isso, os detalhes do Prisma 7 foram conferidos direto no pacote publicado (tipos de `@prisma/config`, opções da CLI e código do gerador) e os do pnpm no repositório de docs no GitHub. O que não consegui conferir está marcado como **(não verificado)**.

## 0. Decisões que afetam as tarefas Haiku

1. **Prisma 7.10.1, nunca 8.** No pacote `prisma`, a dist-tag `latest` aponta para `8.0.0-rc.24`, que é RC e muda a linguagem do schema. Um `pnpm add -D prisma` sem versão instala a RC. A versão exata `7.10.1` fica fixada no catalog.
2. **Prisma 7 bloqueia agentes de IA.** O CLI detecta a variável `CLAUDECODE` e recusa `migrate reset`, `db push --force-reset`, `db push --accept-data-loss` e o reset que o `migrate dev` faz quando há drift. A liberação exige `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. O plano nunca usa reset em fluxo automático:
   - os testes usam `migrate deploy` + `TRUNCATE`;
   - um agente Haiku nunca define essa variável;
   - se o `migrate dev` pedir reset, o agente para e avisa o humano.
3. **TypeScript 6.0.3, não 7.0.2.**
   - O TS 7 é nativo e não expõe mais a API JS. O `main` do pacote é só `version.cjs`.
   - Isso quebra ferramentas que importam `typescript`: `typescript-eslint` aceita TS `<6.1.0` e `openapi-typescript` declara peer `^5.x`.
   - O tsconfig proposto já serve para o 7. Migrar depois é trocar uma linha do catalog.
4. **Biome 2.5.15 em vez de ESLint + Prettier.** Justificativa na seção 1.
5. **Contratos Zod compartilhados, sem geração de código.** Cada rota é descrita uma vez em `packages/shared` (método, caminho, params, query, body e resposta). A API registra a rota a partir do contrato. O front chama `chamar(contrato, entrada)` com tipos de ponta a ponta.
6. **pnpm 12.14.0.**
   - Scripts de instalação de dependências ficam bloqueados (`strictDepBuilds=true`). Libere com `allowBuilds` (esbuild, prisma, @prisma/engines).
   - Use `minimumReleaseAge: 1440` (proteção de supply chain).
   - Por causa dessa idade mínima, escolhi versões publicadas há mais de 24 h. Exemplos: Vite 8.3.4 em vez de 8.3.5 e Biome 2.5.15, porque as três 2.6.x saíram hoje.
7. **Node 24 LTS (24.22.1, "Krypton").** O Node 26 ainda não é LTS.

## 1. Bibliotecas recomendadas

### 1.1 API (`apps/api`)

| Pacote | Versão | Para quê | Alternativa considerada / por que não |
|---|---|---|---|
| fastify | 5.12.7 | Servidor HTTP, hooks, encapsulamento, `inject` para testes | Express 5: sem tipagem por schema, mais lento. Hono: ótimo, mas os plugins de multipart/static/rate-limit para Node são menos maduros. NestJS: pesado e com muita mágica para o Haiku. |
| fastify-type-provider-zod | 7.0.0 | Zod como validador e serializador do Fastify e gerador de OpenAPI | TypeBox: seria uma segunda biblioteca de schema, e o front já usa Zod. A v7 usa `safeEncode` na resposta, o que viabiliza codecs de data. |
| zod | 4.6.7 | Todos os schemas (API, front, env, socket) | Valibot e ArkType: ecossistema menor (RHF, TanStack) e o Haiku os conhece menos. |
| fastify-plugin | 6.0.1 | Plugins sem encapsulamento | — |
| @fastify/cookie | 11.1.3 | Cookie de sessão (parse/set) e `app.parseCookie` para o Socket.IO | Parse manual (como hoje) |
| @fastify/helmet | 13.2.0 | CSP, HSTS, nosniff, frame-ancestors | Cabeçalhos manuais (como hoje): fácil esquecer algum |
| @fastify/rate-limit | 11.2.1 | Limite por rota (login, upload, busca). `global: false` | Map em memória feito à mão (como hoje) |
| @fastify/cors | **não usar** | — | A origem é a mesma: proxy do Vite em dev e Fastify servindo a SPA em produção. Abrir CORS só aumenta a superfície de ataque. |
| @fastify/multipart | 10.1.4 | Upload em streaming para o disco, com limite de tamanho | Base64 em JSON de 12 MB (hoje): 33% maior e tudo em memória |
| @fastify/static | 10.1.6 | Servir a SPA (`apps/web/dist`) com cache imutável em `/assets` | Servir pelo Caddy (ver seção 5) |
| @fastify/swagger | 9.9.2 | OpenAPI 3.1 gerado das rotas | — |
| @scalar/fastify-api-reference | 1.75.0 | UI da documentação em `/api/docs` (JSON em `/api/docs/openapi.json`) | @fastify/swagger-ui 6.1.2: interface datada. O Scalar tem busca e cliente HTTP. Fica ligado só em dev (`API_DOCS`), porque a CSP de produção bloqueia a página **(não verificado)**. |
| close-with-grace | 2.5.0 | Desligamento gracioso (SIGTERM) | Handlers manuais |
| prisma / @prisma/client / @prisma/adapter-pg | **7.10.1** (os três exatos) | ORM, migrações, driver `pg` | Prisma 8 (RC). Drizzle (descartado pela decisão de usar Prisma). |
| @node-rs/argon2 | 2.2.2 | Hash argon2id. `parseOptions` detecta quando é preciso refazer o hash | `argon2` 0.45.1 tem script `install` (node-gyp-build): exige `allowBuilds` e toolchain no Windows. O @node-rs vem pré-compilado via optionalDependencies, sem scripts. |
| socket.io | 4.8.4 | Chat, presença, "digitando…", leitura e push de notificações | `ws` puro (sem salas, reconexão ou ack). SSE é unidirecional, e "digitando" precisa ir do cliente ao servidor. |
| pg-boss | 12.38.0 | Filas e cron no próprio Postgres (e-mail, SLA, IMAP, limpeza) | BullMQ: exige Redis. graphile-worker: bom, mas o pg-boss já foi decidido. Export nomeado `{ PgBoss }`. O worker recebe um array de jobs. |
| nodemailer | 10.1.7 | Envio SMTP (Mailpit em dev). Traz tipos próprios, não instale `@types/nodemailer`. | — |
| imapflow + mailparser | 2.5.8 + 3.10.0 | Abrir chamado por e-mail (recurso do OCOMON). Ambos trazem tipos. | node-imap: abandonado |
| ldapts | 9.2.0 | Login LDAP/AD | ldapjs: descontinuado |
| otplib | 13.5.0 | 2FA TOTP. A v13 foi reescrita com API assíncrona: `generateSecret`, `generate`, `verify` → `{ valid }`, `generateURI`. Nomes dos parâmetros do `generateURI` **(não verificado)**. | speakeasy: abandonado |
| file-type | 22.2.0 | MIME real pelos magic bytes (`fileTypeFromFile`) | Confiar no mimetype do cliente: inseguro |
| pino (embutido no Fastify) + pino-pretty | 13.2.0 (dev) | Logs JSON com requestId; leitura legível em dev | winston. Não instale `pino` direto, use `app.log`. |
| Validação de env | zod (já incluído) | `env.ts` | @t3-oss/env-core 0.13 e envalid 8: dependência extra para algo que o Zod já faz. Também não use `dotenv`: `process.loadEnvFile` do Node basta, e variáveis já definidas no ambiente têm prioridade (testado). |
| date-fns + @date-fns/tz | 4.4.0 + 1.5.0 | SLA com jornada, feriados e fuso `America/Sao_Paulo` (`TZDate`) | dayjs e luxon. Temporal ainda não serve no Node 24 sem flag. |
| vitest | 5.0.5 | Testes. Um `vitest.config.ts` por pacote (a v5 não procura config na pasta pai). | Jest: atrito com ESM/TS. node:test: sem ecossistema. |
| @faker-js/faker | 10.6.0 | Seed de demonstração e fábricas de teste | — |
| tsx | 4.23.15 | `dev` com watch e scripts (seed, importação) | `node --experimental-strip-types`: não lida com o client gerado do Prisma nem com imports sem extensão |
| tsdown | 0.23.1 | Build da API: bundle ESM `dist/server.mjs` que embute `@vinimon/shared` (`deps.alwaysBundle`) | `tsc` emit não resolve o TS do workspace em runtime. tsup está em manutenção. |
| typescript | 6.0.3 | Typecheck (`tsc --noEmit`) | 7.0.2 (ver seção 0, item 3) |
| @biomejs/biome | 2.5.15 | Lint + formatação + organizar imports, num só binário | ESLint 10 + typescript-eslint 8.72 + Prettier 3.9: três ferramentas, vários plugins e configs, e o typescript-eslint trava o TS em `<6.1`. O Biome cobre o que importa (`noFloatingPromises`, `useExhaustiveDependencies`, `useImportType`). |
| husky / lint-staged | **não adotar agora** | — | Os agentes rodam `pnpm verificar` como critério de pronto e o CI bloqueia o merge. Git hooks travam commits de agentes de formas difíceis de diagnosticar. |

### 1.2 Front (`apps/web`)

| Pacote | Versão | Para quê | Alternativa / por que não |
|---|---|---|---|
| react / react-dom | 19.3.1 | UI | — |
| vite + @vitejs/plugin-react | 8.3.4 + 6.1.2 | Dev server e build (Rolldown) | — |
| @tanstack/react-router + @tanstack/router-plugin | 1.170.45 + 1.168.47 | Rotas por arquivo (`tanstackRouter({ target: 'react', autoCodeSplitting: true })`, sempre antes de `react()`). Search params validados com Zod 4 direto. **Commitar `routeTree.gen.ts`.** | React Router 7: tipagem de search params mais fraca |
| @tanstack/react-query | 5.104.5 | Estado do servidor e cache | SWR |
| tailwindcss + @tailwindcss/vite | 4.3.3 + 4.3.3 | Estilo | — |
| shadcn (CLI) | 4.22.1 | `pnpm dlx shadcn@4.22.1 init --base radix`. Usa o pacote unificado `radix-ui` 1.8.1 + class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0, tw-animate-css 1.4.0 | Base UI (a outra opção do CLI v4): o Haiku conhece menos |
| lucide-react | 1.59.0 | Ícones | — |
| react-hook-form + @hookform/resolvers | 7.90.0 + 6.0.0 | Formulários com `zodResolver`. A v6 só mudou o resolver do Effect. | — |
| socket.io-client | 4.8.4 | Tempo real | — |
| cmdk | 1.1.1 (via `Command` do shadcn) | Ctrl+K e lista de @menções | — |
| sonner | 2.0.8 | Toasts | — |
| recharts | 3.10.1 (via `Chart` do shadcn) | Painel e relatórios | ECharts: pesado. Nivo/visx: sem integração com o shadcn. |
| @tanstack/react-table | **8.21.3** | Tabelas com paginação no servidor (`manualPagination`) | A 9.x saiu em 08/2026 com API nova; os exemplos do shadcn e o conhecimento do Haiku são da v8 |
| date-fns + @date-fns/tz | 4.4.0 + 1.5.0 | Formatar datas em pt-BR e no fuso | — |
| Editor de comentário | **textarea + Popover + Command** (sem dependência nova) | O usuário digita "@" e escolhe na lista. O texto fica `@Maria Souza`, puro, e o body leva `mencoes: number[]`. O servidor valida ids e escopo. A renderização destaca `@Nome` dos mencionados, sem HTML guardado, então sem risco de XSS. | tiptap 3.32: ProseMirror com mais de 150 KB, HTML/JSON para sanitizar e popup de sugestão manual. Comentários do OCOMON são texto puro. |
| @playwright/test | 1.64.1 | E2E | — |

## 2. Arquitetura da API

### 2.1 Estrutura de pastas

```
apps/api/
  package.json  tsconfig.json  tsdown.config.ts  vitest.config.ts  prisma.config.ts  .env.example
  prisma/
    schema.prisma            # generator prisma-client + datasource sem url
    migrations/
    seed.ts                  # tsx; nunca grava senha padrão fixa (usa SEED_ADMIN_SENHA)
  scripts/
    importar-sqlite.ts       # migração do v1: data/VINIMON.db → Postgres (ids preservados, setval nas sequences, BLOB → arquivos)
  src/
    server.ts                # entrypoint: buildApp + realtime + jobs + listen + shutdown
    app.ts                   # buildApp(): instancia e registra tudo, SEM listen (usado nos testes)
    env.ts
    generated/prisma/        # gerado por `prisma generate` (gitignored)
    lib/
      prisma.ts  erros.ts  paginacao.ts  senha.ts  sessao.ts
      config.ts              # cache em memória da tabela config
      filas.ts               # porta para o pg-boss (implementação em memória nos testes)
      eventos.ts             # porta para o Socket.IO (publicar só após commit)
      armazenamento.ts       # interface Armazenamento + DiscoLocal (S3 depois)
      sla.ts                 # funções puras: adicionarMinutosUteis(inicio, min, calendario)
      email.ts  ldap.ts  totp.ts
    plugins/
      erros.ts  origem.ts  autenticacao.ts  docs.ts  spa.ts
    modules/
      saude/routes.ts
      auth/{routes,service,schemas}.ts              # login, logout, sessão, 2FA, LDAP
      areas/{routes,service,schemas,areas.test.ts}  # ← módulo canônico
      usuarios/ prioridades/ status/ problemas/ locais/ equipamentos/ faq/ feriados/ jornadas/ config/
      chamados/{routes,service,schemas,escopo,politicas}.ts
      assentamentos/ anexos/ notificacoes/ atividade/ busca/ painel/ relatorios/ presenca/
    realtime/
      servidor.ts  salas.ts  presenca.ts  handlers.ts
    jobs/
      index.ts  email-enviar.ts  email-importar.ts  sla-verificar.ts  limpeza.ts
  test/
    constantes.ts  global-setup.ts  setup.ts  ajudantes.ts
packages/shared/src/
  index.ts  http.ts  permissoes.ts  zod-pt.ts  realtime.ts
  modulos/areas.ts           # um arquivo por módulo: schemas + tipos + contrato `xxxApi`
```

### 2.2 Convenções

- **Prefixo:** `/api/v1`. Caminhos em kebab-case pt-BR no plural (`/areas`, `/tipos-problema`, `/chamados/:id/assumir`). JSON em camelCase pt-BR (`criadoEm`). Tabelas em snake_case via `@@map`/`@map`. Toda `DateTime` usa `@db.Timestamptz(3)`.
- **Respostas:**
  - Recurso único vem direto, sem envelope.
  - Criação responde 201 com o recurso.
  - Exclusão responde 204.
  - Ações de chamado (`POST /chamados/:id/encerrar`) devolvem o chamado atualizado. Use endpoints de ação explícitos, não um `acao` genérico como hoje: assim cada ação tem schema e permissão próprios.
- **Datas:** string ISO-8601 UTC no JSON e `Date` no código. Nos schemas de resposta, sempre `zDataHora()`, que é um codec: a API devolve `Date`, o serializer converte para string, e o front faz `schema.parse` e recebe `Date` de volta.
- **Erro padrão**, sempre:
  ```json
  { "erro": { "codigo": "VALIDACAO", "mensagem": "…", "detalhes": [{ "campo": "nome", "mensagem": "…" }], "requestId": "…" } }
  ```
  Mapa de status:
  - 400 VALIDACAO
  - 401 NAO_AUTENTICADO
  - 403 SEM_PERMISSAO / ORIGEM_INVALIDA
  - 404 NAO_ENCONTRADO / ROTA_INEXISTENTE
  - 409 CONFLITO (P2002) / REGISTRO_EM_USO (P2003)
  - 413 ARQUIVO_GRANDE
  - 415 TIPO_ARQUIVO_INVALIDO
  - 422 REGRA_NEGOCIO
  - 429 MUITAS_TENTATIVAS
  - 500 INTERNO

  Lance erros só com os helpers de `lib/erros.ts`, nunca com `reply.code(4xx).send(...)` à mão.
- **Paginação: offset** (`pagina`, `porPagina` ≤ 100) → `{ itens, total, pagina, porPagina }`.
  - Por quê: a UI do OCOMON mostra número de página e total; as listas são filtradas e ordenadas por várias colunas; o volume é de milhares a centenas de milhares de linhas.
  - Exceção com **cursor** (`antesDe`, `limite`) → `{ itens, proximoCursor }`, só para fluxos que só crescem e recebem inserções em tempo real: linha do tempo/chat do chamado, feed de Atividade e notificações. Nesses, offset duplica ou pula itens.
  - Ordenação sempre com desempate por `id`.
- **OpenAPI:** gerado pelo `@fastify/swagger` com `jsonSchemaTransform`. Toda rota declara `tags`, `summary`, params/querystring/body e `response`.
- **Camadas:** `routes.ts` só declara a rota, valida e autoriza. `service.ts` faz todo o acesso ao Prisma e as regras. É proibido importar `prisma` em `routes.ts` e proibido importar de `@prisma/client`: use `lib/prisma` e os tipos de `generated/prisma/client`.

### 2.3 Autorização central (3 camadas)

1. **Rota (RBAC):** `preHandler: exigePermissao('cadastros:gerenciar')`. Perfis e permissões ficam em `@vinimon/shared` (`temPermissao`), e o front usa a mesma função para esconder botões. Rotas públicas: `/saude*`, `/auth/login`, `/publico`.
2. **Escopo de recurso (contra IDOR):** toda query de chamado (lista, detalhe, painel, relatório, busca, notificação) usa `escopoChamados(usuario)` de `modules/chamados/escopo.ts`. Um chamado fora do escopo devolve **404**, não 403 como hoje, para não revelar que o id existe.
   ```ts
   export function escopoChamados(u: UsuarioSessao): Prisma.ChamadoWhereInput {
     switch (u.perfil) {
       case 'ADMIN': return {}
       case 'OPERADOR': return { OR: [{ areaId: u.areaId ?? -1 }, { operadorId: u.id }, { solicitanteId: u.id }] }
       case 'USUARIO': return { solicitanteId: u.id }
     }
   }
   ```
3. **Ação e campo:** políticas puras em `modules/chamados/politicas.ts` (`podeAssumir`, `podeVerPrivado`, …), com teste unitário. Comentário privado é filtrado na query para o perfil USUARIO.

### 2.4 Transações e efeitos colaterais

- Mutações com mais de um passo usam `prisma.$transaction(async (tx) => { … })`. Funções auxiliares recebem `tx: Tx` (`Prisma.TransactionClient`).
- Nunca faça rede dentro da transação (e-mail, socket). O padrão é: a transação devolve `{ resultado, notificacoes, eventos }`; **depois do commit**, publique com `lib/eventos` e enfileire com `lib/filas`.
- Concorrência em chamado: use `updateMany({ where: { id, versao }, data: { …, versao: { increment: 1 } } })`. Se `count === 0`, lance `conflito('O chamado foi alterado por outra pessoa. Recarregue.')`.

### 2.5 `packages/shared`: TS fonte direto, sem build

- `"exports": { ".": "./src/index.ts" }`. Vite, Vitest, tsx e `tsc` (`moduleResolution: bundler`) consomem o fonte. O build da API (tsdown) embute o shared no bundle.
- Restrições:
  - só depende de `zod`;
  - sem Node, DOM ou Prisma;
  - enums do domínio como uniões de string (`PERFIS`), com checagem de tipo na API de que são iguais aos enums gerados pelo Prisma;
  - nomes exportados sempre prefixados pela entidade, para evitar colisão no barrel.
- `z.config(z.locales.ptBR())` é chamado explicitamente (`configurarZodPtBr()`) em `app.ts` e no `main.tsx`, porque o pacote é `sideEffects: false`.
- Não use `.meta({ id })`: o registro global de ids quebra com o HMR.

### 2.6 Como o front chama a API

Use **contratos + `chamar()` + TanStack Query `queryOptions`**:
- caminho, método e schemas vêm do mesmo objeto que a API registra, então não divergem;
- a resposta é validada e decodificada com `contrato.resposta.parse`, recebendo `Date` de verdade;
- não há passo de codegen.

Rejeitados:
- openapi-typescript + openapi-fetch: codegen que o Haiku precisa lembrar de rodar, e peer `typescript ^5.x`;
- ts-rest: mais uma lib, com suporte a Zod 4 incerto;
- tRPC: perde REST e OpenAPI.

Regras para os schemas compartilhados:
- **Formulário (body):** sem `.default()` nem `.transform()`, para que input e output sejam iguais no RHF.
- **Query:** só escalares, enum ou `z.iso.date()`.
- **Resposta:** só codecs (`zDataHora`), sem `.transform()`.

## 3. Código canônico

O código abaixo pressupõe estes campos mínimos no schema Prisma. O schema da trilha de banco prevalece, mas precisa conter:
- `Area {id Int, nome String @unique, atende, ativo, criadoEm, atualizadoEm @updatedAt}`
- `enum Perfil {ADMIN OPERADOR USUARIO}`
- `Usuario {id, login @unique, nome, email?, senhaHash, perfil, areaId?, ativo}`
- `Sessao {id String @id @default(uuid(7)) @db.Uuid, tokenHash @unique, usuarioId (onDelete: Cascade), criadoEm, ultimoUsoEm, expiraEm, ip?, userAgent?}`

### 3.0 `packages/shared`

```ts
// packages/shared/src/http.ts
import { z } from 'zod'

/** Data/hora: string ISO-8601 no JSON; Date no código (API e front, via schema.parse). */
export const zDataHora = () =>
  z.codec(z.iso.datetime({ offset: true }), z.date(), {
    decode: (iso) => new Date(iso),
    encode: (data) => data.toISOString(),
  })

export const zId = () => z.coerce.number().int().positive()
export const IdParamsSchema = z.object({ id: zId() })

export const PaginacaoQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
})
export type PaginacaoQuery = z.output<typeof PaginacaoQuerySchema>

export const paginaDe = <T extends z.ZodType>(item: T) =>
  z.object({ itens: z.array(item), total: z.int().min(0), pagina: z.int().min(1), porPagina: z.int().min(1) })

export const CursorQuerySchema = z.object({
  antesDe: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
})
export const cursorDe = <T extends z.ZodType>(item: T) =>
  z.object({ itens: z.array(item), proximoCursor: z.int().nullable() })

export const CODIGOS_ERRO = [
  'VALIDACAO', 'NAO_AUTENTICADO', 'SEM_PERMISSAO', 'NAO_ENCONTRADO', 'CONFLITO', 'REGISTRO_EM_USO',
  'REGRA_NEGOCIO', 'ORIGEM_INVALIDA', 'MUITAS_TENTATIVAS', 'ARQUIVO_GRANDE', 'TIPO_ARQUIVO_INVALIDO',
  'REQUISICAO_INVALIDA', 'ROTA_INEXISTENTE', 'INTERNO',
] as const
export type CodigoErro = (typeof CODIGOS_ERRO)[number]

export const ErroRespostaSchema = z.object({
  erro: z.object({
    codigo: z.enum(CODIGOS_ERRO),
    mensagem: z.string(),
    detalhes: z.array(z.object({ campo: z.string(), mensagem: z.string() })).optional(),
    requestId: z.string().optional(),
  }),
})
export type ErroResposta = z.output<typeof ErroRespostaSchema>

export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export interface Contrato {
  metodo: Metodo
  /** Relativo a /api/v1, no formato do Fastify (ex.: '/areas/:id'). */
  caminho: `/${string}`
  params?: z.ZodType
  query?: z.ZodType
  body?: z.ZodType
  resposta: z.ZodType
  status?: 200 | 201 | 204
}
export const contrato = <const C extends Contrato>(c: C): C => c
```

```ts
// packages/shared/src/permissoes.ts
export const PERFIS = ['ADMIN', 'OPERADOR', 'USUARIO'] as const
export type Perfil = (typeof PERFIS)[number]

export const PERMISSOES = [
  'chamados:abrir', 'chamados:abrir_em_nome', 'chamados:atender', 'chamados:ver_area', 'chamados:ver_todos',
  'chamados:comentario_privado', 'cadastros:ler', 'cadastros:gerenciar', 'equipamentos:gerenciar',
  'faq:gerenciar', 'usuarios:gerenciar', 'config:gerenciar', 'relatorios:ver',
] as const
export type Permissao = (typeof PERMISSOES)[number]

const DO_OPERADOR: readonly Permissao[] = [
  'chamados:abrir', 'chamados:abrir_em_nome', 'chamados:atender', 'chamados:ver_area',
  'chamados:comentario_privado', 'cadastros:ler', 'equipamentos:gerenciar', 'faq:gerenciar', 'relatorios:ver',
]

export const PERMISSOES_POR_PERFIL: Record<Perfil, ReadonlySet<Permissao>> = {
  ADMIN: new Set(PERMISSOES),
  OPERADOR: new Set(DO_OPERADOR),
  USUARIO: new Set<Permissao>(['chamados:abrir']),
}

export const temPermissao = (perfil: Perfil, permissao: Permissao): boolean =>
  PERMISSOES_POR_PERFIL[perfil].has(permissao)
```

```ts
// packages/shared/src/zod-pt.ts
import { z } from 'zod'
export const configurarZodPtBr = (): void => {
  z.config(z.locales.ptBR())
}
```

```ts
// packages/shared/src/modulos/areas.ts
import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora } from '../http'

export const AreaSchema = z.object({
  id: z.int(),
  nome: z.string(),
  atende: z.boolean(),
  ativo: z.boolean(),
  criadoEm: zDataHora(),
  atualizadoEm: zDataHora(),
})
export type Area = z.output<typeof AreaSchema>

export const CriarAreaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(80, 'Use no máximo 80 caracteres.'),
  atende: z.boolean(),
  ativo: z.boolean(),
})
export type CriarArea = z.output<typeof CriarAreaSchema>

export const AtualizarAreaSchema = CriarAreaSchema.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Informe ao menos um campo.',
)
export type AtualizarArea = z.output<typeof AtualizarAreaSchema>

export const ListarAreasQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
  ordem: z.enum(['nome', 'criadoEm']).default('nome'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
})
export type ListarAreasQuery = z.output<typeof ListarAreasQuerySchema>

export const areasApi = {
  listar: contrato({ metodo: 'GET', caminho: '/areas', query: ListarAreasQuerySchema, resposta: paginaDe(AreaSchema) }),
  obter: contrato({ metodo: 'GET', caminho: '/areas/:id', params: IdParamsSchema, resposta: AreaSchema }),
  criar: contrato({ metodo: 'POST', caminho: '/areas', body: CriarAreaSchema, resposta: AreaSchema, status: 201 }),
  atualizar: contrato({
    metodo: 'PATCH', caminho: '/areas/:id', params: IdParamsSchema, body: AtualizarAreaSchema, resposta: AreaSchema,
  }),
  excluir: contrato({ metodo: 'DELETE', caminho: '/areas/:id', params: IdParamsSchema, resposta: z.undefined(), status: 204 }),
}
```

```ts
// packages/shared/src/index.ts
export * from './http'
export * from './permissoes'
export * from './zod-pt'
export * from './modulos/areas'
// cada módulo novo: + export * from './modulos/<modulo>'
```

### 3.a `apps/api/src/env.ts`

```ts
import { existsSync } from 'node:fs'
import { z } from 'zod'

// Carrega .env do diretório atual (apps/api). Variáveis já definidas no ambiente têm prioridade.
if (existsSync('.env')) process.loadEnvFile('.env')

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  APP_URL: z.url().default('http://localhost:5173'),
  TRUST_PROXY: z.stringbool().default(false),
  SESSAO_COOKIE: z.string().regex(/^[A-Za-z0-9_-]+$/).default('vinimon_sessao'),
  ARGON2_MEMORIA_KIB: z.coerce.number().int().min(1024).default(19_456),
  ARMAZENAMENTO_DIR: z.string().min(1).default('./storage'),
  ANEXO_MAX_MB: z.coerce.number().int().min(1).max(100).default(10),
  WEB_DIST_DIR: z.string().min(1).optional(),
  API_DOCS: z.stringbool().default(false),
  JOBS_HABILITADOS: z.stringbool().default(true),
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
  EMAIL_REMETENTE: z.string().default('Vinimon <nao-responda@localhost>'),
  FUSO_HORARIO: z.string().default('America/Sao_Paulo'),
})

const resultado = EnvSchema.safeParse(process.env)
if (!resultado.success) {
  console.error(`Variáveis de ambiente inválidas:\n${z.prettifyError(resultado.error)}`)
  process.exit(1)
}

export const env = resultado.data
export type Env = typeof env
```

### 3.b `app.ts` (`buildApp`), `server.ts` e plugins de base

```ts
// apps/api/src/lib/prisma.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import type { Prisma } from '../generated/prisma/client'
import { env } from '../env'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: 10 })
export const prisma = new PrismaClient({ adapter, log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] })
export type Tx = Prisma.TransactionClient
// NÃO chame prisma.$disconnect() em hooks do buildApp: o pool do pg não reabre. Só em server.ts e test/setup.ts.
```

```ts
// apps/api/src/lib/erros.ts
import type { CodigoErro } from '@vinimon/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'

export interface DetalheErro { campo: string; mensagem: string }

export class ErroApp extends Error {
  readonly status: number
  readonly codigo: CodigoErro
  readonly detalhes: DetalheErro[] | undefined
  constructor(status: number, codigo: CodigoErro, mensagem: string, detalhes?: DetalheErro[]) {
    super(mensagem)
    this.name = 'ErroApp'
    this.status = status
    this.codigo = codigo
    this.detalhes = detalhes
  }
}

export const naoAutenticado = () => new ErroApp(401, 'NAO_AUTENTICADO', 'Faça login para continuar.')
export const semPermissao = (m = 'Você não tem permissão para esta ação.') => new ErroApp(403, 'SEM_PERMISSAO', m)
export const naoEncontrado = (m = 'Registro não encontrado.') => new ErroApp(404, 'NAO_ENCONTRADO', m)
export const conflito = (m: string) => new ErroApp(409, 'CONFLITO', m)
export const regraNegocio = (m: string) => new ErroApp(422, 'REGRA_NEGOCIO', m)

/** Código Pxxxx de erros conhecidos do Prisma (checagem estrutural, independe de instanceof). */
export function codigoPrisma(erro: unknown): string | undefined {
  if (typeof erro === 'object' && erro !== null && 'code' in erro && typeof erro.code === 'string') {
    return /^P\d{4}$/.test(erro.code) ? erro.code : undefined
  }
  return undefined
}

export function responderRotaInexistente(req: FastifyRequest, reply: FastifyReply) {
  return reply.code(404).send({ erro: { codigo: 'ROTA_INEXISTENTE', mensagem: 'Rota não encontrada.', requestId: req.id } })
}
```

```ts
// apps/api/src/lib/paginacao.ts
import type { PaginacaoQuery } from '@vinimon/shared'
export const paginar = ({ pagina, porPagina }: PaginacaoQuery) => ({ skip: (pagina - 1) * porPagina, take: porPagina })
```

```ts
// apps/api/src/plugins/erros.ts
import type { CodigoErro } from '@vinimon/shared'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod'
import { codigoPrisma, type DetalheErro, ErroApp } from '../lib/erros'

function responder(
  req: FastifyRequest, reply: FastifyReply, status: number, codigo: CodigoErro, mensagem: string, detalhes?: DetalheErro[],
) {
  return reply.code(status).send({ erro: { codigo, mensagem, detalhes, requestId: req.id } })
}

const ERROS_PRISMA: Record<string, [number, CodigoErro, string]> = {
  P2002: [409, 'CONFLITO', 'Já existe um registro com esse valor.'],
  P2003: [409, 'REGISTRO_EM_USO', 'Registro em uso por outros dados. Desative-o em vez de excluir.'],
  P2025: [404, 'NAO_ENCONTRADO', 'Registro não encontrado.'],
}

export const errosPlugin = fp(
  async (app) => {
    app.setErrorHandler((erro: FastifyError, req, reply) => {
      if (erro instanceof ErroApp) return responder(req, reply, erro.status, erro.codigo, erro.message, erro.detalhes)

      if (hasZodFastifySchemaValidationErrors(erro)) {
        const detalhes = erro.validation.map((v) => ({
          campo: v.instancePath.replace(/^\//, '').replaceAll('/', '.') || (erro.validationContext ?? 'corpo'),
          mensagem: v.message ?? 'Valor inválido.',
        }))
        return responder(req, reply, 400, 'VALIDACAO', 'Verifique os campos informados.', detalhes)
      }

      const mapeado = ERROS_PRISMA[codigoPrisma(erro) ?? '']
      if (mapeado) return responder(req, reply, ...mapeado)

      if (isResponseSerializationError(erro)) {
        req.log.error({ err: erro, issues: erro.cause.issues }, 'resposta fora do schema')
        return responder(req, reply, 500, 'INTERNO', 'Erro interno do servidor.')
      }

      const status = erro.statusCode ?? 500
      if (status === 429) return responder(req, reply, 429, 'MUITAS_TENTATIVAS', 'Muitas tentativas. Aguarde e tente novamente.')
      if (status === 413) return responder(req, reply, 413, 'ARQUIVO_GRANDE', 'Arquivo ou requisição maior que o permitido.')
      if (status >= 400 && status < 500) return responder(req, reply, status, 'REQUISICAO_INVALIDA', 'Requisição inválida.')

      req.log.error({ err: erro }, 'erro não tratado')
      return responder(req, reply, 500, 'INTERNO', 'Erro interno do servidor.')
    })
  },
  { name: 'erros' },
)
```

```ts
// apps/api/src/plugins/origem.ts — CSRF: toda mutação precisa vir da própria aplicação
import fp from 'fastify-plugin'
import { env } from '../env'
import { ErroApp } from '../lib/erros'

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const origemPlugin = fp(
  async (app) => {
    const permitida = new URL(env.APP_URL).origin
    app.addHook('onRequest', async (req) => {
      if (METODOS_SEGUROS.has(req.method)) return
      if (req.headers.origin !== permitida) throw new ErroApp(403, 'ORIGEM_INVALIDA', 'Origem da requisição não permitida.')
    })
  },
  { name: 'origem' },
)
```

```ts
// apps/api/src/plugins/docs.ts (registrado só com API_DOCS=true; padrão em dev)
import swagger from '@fastify/swagger'
import scalar from '@scalar/fastify-api-reference'
import fp from 'fastify-plugin'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'
import { env } from '../env'

export const docsPlugin = fp(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: { title: 'Vinimon API', version: '1.0.0' },
        components: { securitySchemes: { sessao: { type: 'apiKey', in: 'cookie', name: env.SESSAO_COOKIE } } },
        security: [{ sessao: [] }],
      },
      transform: jsonSchemaTransform,
    })
    await app.register(scalar, { routePrefix: '/api/docs' })
  },
  { name: 'docs' },
)
```

```ts
// apps/api/src/plugins/spa.ts — em produção o Fastify serve apps/web/dist
import { resolve, sep } from 'node:path'
import fastifyStatic from '@fastify/static'
import fp from 'fastify-plugin'
import { responderRotaInexistente } from '../lib/erros'

export const spaPlugin = fp<{ raiz: string }>(
  async (app, { raiz }) => {
    await app.register(fastifyStatic, {
      root: resolve(raiz),
      setHeaders: (res, caminho) => {
        const imutavel = caminho.includes(`${sep}assets${sep}`)
        res.setHeader('Cache-Control', imutavel ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    })
    app.setNotFoundHandler((req, reply) => {
      const ehApi = req.url.startsWith('/api/') || req.url.startsWith('/socket.io/')
      if (req.method !== 'GET' || ehApi) return responderRotaInexistente(req, reply)
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
    })
  },
  { name: 'spa' },
)
```

```ts
// apps/api/src/app.ts
import { randomUUID } from 'node:crypto'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import { configurarZodPtBr } from '@vinimon/shared'
import Fastify, { type FastifyServerOptions } from 'fastify'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { env } from './env'
import { responderRotaInexistente } from './lib/erros'
import { rotasAreas } from './modules/areas/routes'
import { rotasSaude } from './modules/saude/routes'
import { autenticacaoPlugin } from './plugins/autenticacao'
import { docsPlugin } from './plugins/docs'
import { errosPlugin } from './plugins/erros'
import { origemPlugin } from './plugins/origem'
import { spaPlugin } from './plugins/spa'

configurarZodPtBr()

export interface OpcoesApp {
  logger?: FastifyServerOptions['logger']
}

export async function buildApp(opcoes: OpcoesApp = {}) {
  const urlApp = new URL(env.APP_URL)
  const https = urlApp.protocol === 'https:'

  const app = Fastify({
    logger: opcoes.logger ?? {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1_048_576,
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(errosPlugin)
  await app.register(helmet, {
    contentSecurityPolicy:
      env.NODE_ENV === 'production'
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'", urlApp.origin.replace(/^http/, 'ws')],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              upgradeInsecureRequests: https ? [] : null,
            },
          }
        : false,
    strictTransportSecurity: https ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  })
  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  await app.register(multipart, { limits: { fileSize: env.ANEXO_MAX_MB * 1024 * 1024, files: 5, fields: 20 } })
  if (env.API_DOCS) await app.register(docsPlugin)

  await app.register(
    async (api) => {
      await api.register(origemPlugin)
      await api.register(autenticacaoPlugin)
      await api.register(rotasSaude)
      await api.register(rotasAreas)
      // cada módulo novo: 1 import + 1 linha aqui (ordem alfabética)
    },
    { prefix: '/api/v1' },
  )

  if (env.WEB_DIST_DIR) await app.register(spaPlugin, { raiz: env.WEB_DIST_DIR })
  else app.setNotFoundHandler(responderRotaInexistente)

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>
```

```ts
// apps/api/src/server.ts
import closeWithGrace from 'close-with-grace'
import { buildApp } from './app'
import { env } from './env'
import { iniciarJobs } from './jobs' // ← entra na tarefa de jobs
import { prisma } from './lib/prisma'
import { iniciarRealtime } from './realtime/servidor' // ← entra na tarefa de realtime

const app = await buildApp()
iniciarRealtime(app)
const jobs = env.JOBS_HABILITADOS ? await iniciarJobs(app.log) : null

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) app.log.error({ err }, 'encerrando após erro')
  else app.log.info({ signal }, 'encerrando')
  await app.close()
  await jobs?.stop({ graceful: true, timeout: 5_000 })
  await prisma.$disconnect()
})

await app.listen({ host: env.HOST, port: env.PORT })
```

### 3.c Módulo de exemplo `modules/areas/`

```ts
// apps/api/src/modules/areas/schemas.ts
import type { Prisma } from '../../generated/prisma/client'

export { areasApi } from '@vinimon/shared'

/** Projeção única usada por todo o módulo (nunca devolva a linha inteira). */
export const selectArea = {
  id: true, nome: true, atende: true, ativo: true, criadoEm: true, atualizadoEm: true,
} satisfies Prisma.AreaSelect
```

```ts
// apps/api/src/modules/areas/service.ts
import type { AtualizarArea, CriarArea, ListarAreasQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { naoEncontrado } from '../../lib/erros'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { selectArea } from './schemas'

export async function listarAreas(q: ListarAreasQuery) {
  const where: Prisma.AreaWhereInput = {
    ...(q.busca ? { nome: { contains: q.busca, mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const ordem: Record<ListarAreasQuery['ordem'], Prisma.AreaOrderByWithRelationInput> = {
    nome: { nome: q.direcao },
    criadoEm: { criadoEm: q.direcao },
  }
  const [itens, total] = await prisma.$transaction([
    prisma.area.findMany({ where, select: selectArea, orderBy: [ordem[q.ordem], { id: 'asc' }], ...paginar(q) }),
    prisma.area.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterArea(id: number) {
  const area = await prisma.area.findUnique({ where: { id }, select: selectArea })
  if (!area) throw naoEncontrado('Área não encontrada.')
  return area
}

/** Nome duplicado → P2002 → 409 CONFLITO (handler global). */
export function criarArea(dados: CriarArea) {
  return prisma.area.create({ data: dados, select: selectArea })
}

/** Id inexistente → P2025 → 404 (handler global). */
export function atualizarArea(id: number, dados: AtualizarArea) {
  return prisma.area.update({ where: { id }, data: dados, select: selectArea })
}

/** Área em uso → P2003 → 409 REGISTRO_EM_USO. */
export async function excluirArea(id: number) {
  await prisma.area.delete({ where: { id } })
}
```

```ts
// apps/api/src/modules/areas/routes.ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { exigePermissao } from '../../plugins/autenticacao'
import { areasApi as c } from './schemas'
import * as service from './service'

const tags = ['Áreas']

export const rotasAreas: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: { tags, summary: 'Lista áreas', querystring: c.listar.query, response: { 200: c.listar.resposta } },
    preHandler: exigePermissao('cadastros:ler'),
    handler: (req) => service.listarAreas(req.query),
  })

  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: { tags, summary: 'Obtém área', params: c.obter.params, response: { 200: c.obter.resposta } },
    preHandler: exigePermissao('cadastros:ler'),
    handler: (req) => service.obterArea(req.params.id),
  })

  app.route({
    method: c.criar.metodo,
    url: c.criar.caminho,
    schema: { tags, summary: 'Cria área', body: c.criar.body, response: { 201: c.criar.resposta } },
    preHandler: exigePermissao('cadastros:gerenciar'),
    handler: async (req, reply) => reply.code(201).send(await service.criarArea(req.body)),
  })

  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags, summary: 'Atualiza área', params: c.atualizar.params, body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    preHandler: exigePermissao('cadastros:gerenciar'),
    handler: (req) => service.atualizarArea(req.params.id, req.body),
  })

  app.route({
    method: c.excluir.metodo,
    url: c.excluir.caminho,
    schema: { tags, summary: 'Exclui área', params: c.excluir.params, response: { 204: c.excluir.resposta } },
    preHandler: exigePermissao('cadastros:gerenciar'),
    handler: async (req, reply) => {
      await service.excluirArea(req.params.id)
      return reply.code(204).send()
    },
  })
}
```

### 3.d Sessão e autenticação

```ts
// apps/api/src/lib/senha.ts
import { scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { hash, verify } from '@node-rs/argon2'
import { env } from '../env'

const scryptAsync = promisify(scrypt) as (senha: string, salt: string, tamanho: number) => Promise<Buffer>
const OPCOES = { memoryCost: env.ARGON2_MEMORIA_KIB, timeCost: 2, parallelism: 1 } // argon2id é o padrão
let hashFalso: Promise<string> | undefined

export const hashSenha = (senha: string) => hash(senha, OPCOES)

/** Aceita argon2id e o formato legado "salt:hash" (scrypt, keylen 64) do Vinimon v1. */
export async function conferirSenha(senha: string, armazenado: string | null) {
  if (!armazenado) {
    hashFalso ??= hashSenha('usuario-inexistente') // iguala o tempo de resposta (anti-enumeração)
    await verify(await hashFalso, senha)
    return { ok: false, precisaRehash: false }
  }
  if (armazenado.startsWith('$argon2')) return { ok: await verify(armazenado, senha), precisaRehash: false }
  const [salt, hex] = armazenado.split(':')
  if (!salt || !hex) return { ok: false, precisaRehash: false }
  const calculado = await scryptAsync(senha, salt, 64)
  const original = Buffer.from(hex, 'hex')
  const ok = calculado.length === original.length && timingSafeEqual(calculado, original)
  return { ok, precisaRehash: ok } // login ok com hash legado → regravar com hashSenha()
}
```

```ts
// apps/api/src/lib/sessao.ts
import { createHash, randomBytes } from 'node:crypto'
import type { CookieSerializeOptions } from '@fastify/cookie'
import type { Perfil } from '@vinimon/shared'
import { env } from '../env'
import { prisma } from './prisma'

export interface UsuarioSessao { id: number; nome: string; login: string; perfil: Perfil; areaId: number | null }

const RENOVAR_ULTIMO_USO_MS = 5 * 60_000
const sha256 = (valor: string) => createHash('sha256').update(valor).digest('hex')

/** O cookie leva o token bruto; o banco guarda só o SHA-256. */
export async function criarSessao(d: { usuarioId: number; horas: number; ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString('base64url')
  await prisma.sessao.create({
    data: {
      tokenHash: sha256(token),
      usuarioId: d.usuarioId,
      expiraEm: new Date(Date.now() + d.horas * 3_600_000),
      ip: d.ip ?? null,
      userAgent: d.userAgent?.slice(0, 300) ?? null,
    },
  })
  return { token }
}

export async function carregarSessao(token: string | undefined): Promise<{ sessaoId: string; usuario: UsuarioSessao } | null> {
  if (!token || token.length > 100) return null
  const sessao = await prisma.sessao.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true, expiraEm: true, ultimoUsoEm: true,
      usuario: { select: { id: true, nome: true, login: true, perfil: true, areaId: true, ativo: true } },
    },
  })
  if (!sessao || sessao.expiraEm <= new Date() || !sessao.usuario.ativo) return null
  if (Date.now() - sessao.ultimoUsoEm.getTime() > RENOVAR_ULTIMO_USO_MS) {
    await prisma.sessao.update({ where: { id: sessao.id }, data: { ultimoUsoEm: new Date() } })
  }
  const { id, nome, login, perfil, areaId } = sessao.usuario
  return { sessaoId: sessao.id, usuario: { id, nome, login, perfil, areaId } }
}

export async function encerrarSessao(token: string | undefined) {
  if (token) await prisma.sessao.deleteMany({ where: { tokenHash: sha256(token) } })
}

export function opcoesCookieSessao(horas: number): CookieSerializeOptions {
  return { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/', maxAge: horas * 3600 }
}
```

```ts
// apps/api/src/plugins/autenticacao.ts
import { type Permissao, temPermissao } from '@vinimon/shared'
import type { FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '../env'
import { naoAutenticado, semPermissao } from '../lib/erros'
import { carregarSessao, type UsuarioSessao } from '../lib/sessao'

declare module 'fastify' {
  interface FastifyRequest {
    usuario: UsuarioSessao | null
    sessaoId: string | null
  }
}

/** Carrega a sessão em toda requisição /api/v1. Não bloqueia: quem bloqueia é o preHandler da rota. */
export const autenticacaoPlugin = fp(
  async (app) => {
    app.decorateRequest('usuario', null)
    app.decorateRequest('sessaoId', null)
    app.addHook('onRequest', async (req) => {
      const sessao = await carregarSessao(req.cookies[env.SESSAO_COOKIE])
      if (sessao) {
        req.usuario = sessao.usuario
        req.sessaoId = sessao.sessaoId
      }
    })
  },
  { name: 'autenticacao' },
)

/** Em handlers: devolve o usuário com tipo não nulo (o preHandler já garantiu). */
export function exigeLogin(req: FastifyRequest): UsuarioSessao {
  if (!req.usuario) throw naoAutenticado()
  return req.usuario
}

export const autenticado = async (req: FastifyRequest): Promise<void> => {
  exigeLogin(req)
}

export function exigePermissao(...permissoes: [Permissao, ...Permissao[]]) {
  return async (req: FastifyRequest): Promise<void> => {
    const usuario = exigeLogin(req)
    if (!permissoes.every((p) => temPermissao(usuario.perfil, p))) throw semPermissao()
  }
}
```

Trecho da rota de login (`modules/auth/routes.ts`):

```ts
app.route({
  method: authApi.entrar.metodo,
  url: authApi.entrar.caminho,
  schema: { tags: ['Autenticação'], body: authApi.entrar.body, response: { 200: authApi.entrar.resposta } },
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  handler: async (req, reply) => {
    // service.entrar: login em minúsculas, bloqueio persistido (falhas/bloqueadoAte), conferirSenha, rehash, criarSessao
    const { token, horas, usuario } = await service.entrar(req.body, { ip: req.ip, userAgent: req.headers['user-agent'] ?? null })
    reply.setCookie(env.SESSAO_COOKIE, token, opcoesCookieSessao(horas))
    return usuario
  },
})
```

Esqueleto do tempo real, que reaproveita a sessão:

```ts
// apps/api/src/realtime/servidor.ts
import { Server } from 'socket.io'
import type { App } from '../app'
import { env } from '../env'
import { carregarSessao, type UsuarioSessao } from '../lib/sessao'

export function iniciarRealtime(app: App) {
  const permitida = new URL(env.APP_URL).origin
  // Tipar com os eventos de @vinimon/shared/realtime quando existirem: new Server<EvCliente, EvServidor, {}, Dados>
  const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, { usuario: UsuarioSessao }>(
    app.server,
    {
      path: '/socket.io',
      serveClient: false,
      allowRequest: (req, aceitar) => {
        // anti-CSWSH: só a própria aplicação abre conexão
        const origem = req.headers.origin
        aceitar(null, origem ? origem === permitida : req.headers['sec-fetch-site'] === 'same-origin')
      },
    },
  )
  io.use(async (socket, proximo) => {
    try {
      const cookies = app.parseCookie(socket.handshake.headers.cookie ?? '')
      const sessao = await carregarSessao(cookies[env.SESSAO_COOKIE])
      if (!sessao) return proximo(new Error('NAO_AUTENTICADO'))
      socket.data.usuario = sessao.usuario
      proximo()
    } catch (err) {
      app.log.error({ err }, 'falha no handshake do socket')
      proximo(new Error('INTERNO'))
    }
  })
  io.on('connection', (socket) => {
    void socket.join(`usuario:${socket.data.usuario.id}`)
    // registrar handlers de presença, digitando, leitura e entrar/sair da sala do chamado (checando escopo)
  })
  app.addHook('preClose', async () => {
    io.local.disconnectSockets(true)
  })
  app.addHook('onClose', async () => {
    await io.close().catch(() => undefined)
  })
  return io
}
```

### 3.e Teste Vitest com `app.inject` e banco de teste

```ts
// apps/api/test/constantes.ts
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')

export const URL_BANCO_TESTE =
  process.env.DATABASE_URL_TESTE ?? 'postgresql://vinimon:vinimon@localhost:5432/vinimon_test'

export function garantirBancoDeTeste(url: string): void {
  if (!new URL(url).pathname.endsWith('_test')) throw new Error(`O banco de teste precisa terminar em _test (recebido: ${url})`)
}
```

```ts
// apps/api/vitest.config.ts
import { defineConfig } from 'vitest/config'
import { garantirBancoDeTeste, URL_BANCO_TESTE } from './test/constantes'

garantirBancoDeTeste(URL_BANCO_TESTE)

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: URL_BANCO_TESTE,
      APP_URL: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
      API_DOCS: 'false',
      JOBS_HABILITADOS: 'false',
      ARGON2_MEMORIA_KIB: '1024',
    },
  },
})
```

```ts
// apps/api/test/global-setup.ts
import { execSync } from 'node:child_process'
import { garantirBancoDeTeste, URL_BANCO_TESTE } from './constantes'

export default function setup() {
  garantirBancoDeTeste(URL_BANCO_TESTE)
  // Só aplica migrações pendentes. NUNCA use "migrate reset" aqui: é destrutivo e o Prisma 7 bloqueia agentes.
  execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: URL_BANCO_TESTE } })
}
```

```ts
// apps/api/test/setup.ts
import { afterAll } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { garantirBancoDeTeste } from './constantes'

garantirBancoDeTeste(process.env.DATABASE_URL ?? '')

afterAll(async () => {
  await prisma.$disconnect()
})
```

```ts
// apps/api/test/ajudantes.ts
import type { Perfil } from '@vinimon/shared'
import { env } from '../src/env'
import { prisma } from '../src/lib/prisma'
import { hashSenha } from '../src/lib/senha'
import { criarSessao } from '../src/lib/sessao'

export const ORIGEM = new URL(env.APP_URL).origin

/** Esvazia todas as tabelas do schema public (o schema pgboss não é tocado). */
export async function limparBanco(): Promise<void> {
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tabelas.length === 0) return
  const lista = tabelas.map((t) => `"public"."${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`)
}

let sequencia = 0
export async function criarUsuario(dados: { perfil: Perfil; areaId?: number | null; senha?: string }) {
  sequencia += 1
  return prisma.usuario.create({
    data: {
      login: `usuario${sequencia}`,
      nome: `Usuário ${sequencia}`,
      email: `usuario${sequencia}@teste.local`,
      senhaHash: await hashSenha(dados.senha ?? 'Senha-de-teste-123'),
      perfil: dados.perfil,
      areaId: dados.areaId ?? null,
    },
  })
}

/** Cabeçalhos de um usuário logado (sessão criada direto no banco, sem passar pelo rate limit do login). */
export async function headersDe(usuarioId: number) {
  const { token } = await criarSessao({ usuarioId, horas: 1 })
  return { cookie: `${env.SESSAO_COOKIE}=${token}`, origin: ORIGEM }
}
```

```ts
// apps/api/src/modules/areas/areas.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'

describe('módulo áreas', () => {
  let app: App

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
  })

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/areas' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para perfil USUARIO', async () => {
    const usuario = await criarUsuario({ perfil: 'USUARIO' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/areas', headers: await headersDe(usuario.id) })
    expect(res.statusCode).toBe(403)
    expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
  })

  it('ADMIN cria, lista paginado e recebe 409 em nome duplicado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criada = await app.inject({
      method: 'POST', url: '/api/v1/areas', headers, payload: { nome: '  Tecnologia  ', atende: true, ativo: true },
    })
    expect(criada.statusCode).toBe(201)
    expect(criada.json()).toMatchObject({ nome: 'Tecnologia', atende: true, ativo: true })
    expect(criada.json().criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    await app.inject({ method: 'POST', url: '/api/v1/areas', headers, payload: { nome: 'Manutenção', atende: true, ativo: true } })
    const lista = await app.inject({ method: 'GET', url: '/api/v1/areas?porPagina=1&pagina=2', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 2, pagina: 2, porPagina: 1, itens: [{ nome: 'Tecnologia' }] })

    const duplicada = await app.inject({
      method: 'POST', url: '/api/v1/areas', headers, payload: { nome: 'Tecnologia', atende: false, ativo: true },
    })
    expect(duplicada.statusCode).toBe(409)
    expect(duplicada.json().erro.codigo).toBe('CONFLITO')
  })

  it('400 com detalhes por campo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({ method: 'POST', url: '/api/v1/areas', headers: await headersDe(admin.id), payload: { nome: 'x' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().erro.codigo).toBe('VALIDACAO')
    expect(res.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nome' })]))
  })

  it('403 ORIGEM_INVALIDA em mutação sem Origin', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const { cookie } = await headersDe(admin.id)
    const res = await app.inject({
      method: 'POST', url: '/api/v1/areas', headers: { cookie }, payload: { nome: 'Teste', atende: true, ativo: true },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().erro.codigo).toBe('ORIGEM_INVALIDA')
  })

  it('404 para área inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/areas/999', headers: await headersDe(admin.id) })
    expect(res.statusCode).toBe(404)
    expect(res.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })
})
```

### 3.f Cliente do front (`apps/web/src/lib/api.ts`)

```ts
import type { Contrato, ErroResposta } from '@vinimon/shared'
import type { z } from 'zod'

type Entrada<C extends Contrato> =
  (C extends { params: infer P extends z.ZodType } ? { params: z.output<P> } : unknown) &
  (C extends { query: infer Q extends z.ZodType } ? { query?: Partial<z.output<Q>> } : unknown) &
  (C extends { body: infer B extends z.ZodType } ? { body: z.input<B> } : unknown)

type EntradaBruta = { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown }

export class ErroApi extends Error {
  readonly status: number
  readonly codigo: string
  readonly detalhes: { campo: string; mensagem: string }[]
  constructor(status: number, corpo: ErroResposta | null) {
    super(corpo?.erro.mensagem ?? 'Falha de comunicação com o servidor.')
    this.name = 'ErroApi'
    this.status = status
    this.codigo = corpo?.erro.codigo ?? 'INTERNO'
    this.detalhes = corpo?.erro.detalhes ?? []
  }
}

function montarUrl(c: Contrato, params?: Record<string, unknown>, query?: Record<string, unknown>): string {
  let caminho: string = c.caminho
  for (const [k, v] of Object.entries(params ?? {})) caminho = caminho.replace(`:${k}`, encodeURIComponent(String(v)))
  const busca = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue
    busca.set(k, String(v))
  }
  const qs = busca.toString()
  return `/api/v1${caminho}${qs ? `?${qs}` : ''}`
}

export async function chamar<C extends Contrato>(
  c: C, entrada: Entrada<C> & EntradaBruta, signal?: AbortSignal,
): Promise<z.output<C['resposta']>> {
  const { params, query, body } = entrada
  const resposta = await fetch(montarUrl(c, params, query), {
    method: c.metodo,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  if (resposta.status === 204) return undefined as z.output<C['resposta']>
  const json: unknown = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new ErroApi(resposta.status, json as ErroResposta | null)
  return c.resposta.parse(json) as z.output<C['resposta']>
}
```

```ts
// apps/web/src/features/areas/consultas.ts (uso)
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { areasApi, type ListarAreasQuery } from '@vinimon/shared'
import type { z } from 'zod'
import { chamar } from '@/lib/api'

export const areasConsultas = {
  lista: (query: Partial<ListarAreasQuery>) =>
    queryOptions({ queryKey: ['areas', 'lista', query], queryFn: ({ signal }) => chamar(areasApi.listar, { query }, signal) }),
}

export function useCriarArea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof areasApi.criar.body>) => chamar(areasApi.criar, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['areas'] }),
  })
}
```

### 3.g Receita de módulo para o Haiku (critério de pronto)

1. `packages/shared/src/modulos/<m>.ts`: schemas, tipos e `<m>Api` com `contrato(...)`. Adicionar a linha no `index.ts`.
2. `apps/api/src/modules/<m>/schemas.ts`: re-export do contrato e `select<Entidade>` com `satisfies Prisma.XSelect`.
3. `service.ts`: só aqui se usa `prisma`. Listas usam `paginar` + `$transaction([findMany, count])`. Chamados sempre usam `escopoChamados`. Efeitos colaterais só depois do commit.
4. `routes.ts`: `app.route` a partir do contrato, com `schema` completo e `preHandler` (`exigePermissao` ou `autenticado`).
5. Registrar em `app.ts`, dentro do escopo `/api/v1`.
6. `<m>.test.ts` cobrindo no mínimo: 401, 403, 400 com `detalhes`, caminho feliz e 404/409.
7. `pnpm verificar` verde.

Armadilhas de versão (incluir em toda tarefa):
- **Zod 4:**
  - `z.email()`, `z.uuid()` e `z.url()` no topo, não `.string().email()`;
  - `error:` no lugar de `message:`;
  - `z.record(chave, valor)` com dois argumentos;
  - `z.strictObject`;
  - `err.issues`;
  - `z.coerce.*` tem input `unknown`;
  - `.default()` recebe valor do tipo de saída.
- **Fastify 5:**
  - `listen({ host, port })`;
  - `decorateRequest(nome, null)`;
  - `request.routeOptions.url`;
  - não misture `return` com `reply.send`.
- **Prisma 7:**
  - import de `../generated/prisma/client`;
  - `prisma generate` não roda sozinho (os scripts já chamam);
  - não existe `$use` (use `$extends`);
  - `migrate dev` não roda seed nem generate.
- **TS 6:**
  - `types` é `[]` por padrão, sempre declare;
  - `strict` vem ligado;
  - `baseUrl` está obsoleto (use `paths`).
- **Proibido:**
  - `any`, `!` (non-null assertion) e `enum` TS;
  - `prisma migrate reset`;
  - definir `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.

## 4. Ferramentas do monorepo

```json
// package.json (raiz)
{
  "name": "vinimon",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.14.0",
  "engines": { "node": ">=24.11" },
  "scripts": {
    "dev": "pnpm --parallel --filter @vinimon/api --filter @vinimon/web run dev",
    "build": "pnpm --filter @vinimon/web build && pnpm --filter @vinimon/api build",
    "typecheck": "pnpm -r typecheck",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "test": "pnpm -r test",
    "test:e2e": "pnpm --filter @vinimon/web test:e2e",
    "db:up": "docker compose up -d",
    "db:generate": "pnpm --filter @vinimon/api db:generate",
    "db:migrate": "pnpm --filter @vinimon/api db:migrate",
    "db:deploy": "pnpm --filter @vinimon/api db:deploy",
    "db:seed": "pnpm --filter @vinimon/api db:seed",
    "verificar": "pnpm lint && pnpm typecheck && pnpm test"
  },
  "devDependencies": { "@biomejs/biome": "2.5.15", "typescript": "catalog:" }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*

savePrefix: ''            # versões exatas (chave camelCase do pnpm, não verificado)
minimumReleaseAge: 1440   # só instala versões publicadas há >= 24 h (supply chain)

# pnpm >= 10.26 bloqueia scripts de instalação. Se aparecer ERR_PNPM_IGNORED_BUILDS com um pacote novo,
# adicione-o aqui com false (ou true se for prisma/esbuild) e avise na tarefa.
allowBuilds:
  esbuild: true
  prisma: true
  '@prisma/engines': true

catalog:
  zod: 4.6.7
  typescript: 6.0.3
  vitest: 5.0.5
  '@types/node': 24.19.2
```

```json
// tsconfig.base.json (raiz) — válido em TS 6 e TS 7
{
  "compilerOptions": {
    "target": "es2024",
    "module": "preserve",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

Os tsconfigs de cada pacote:
- `apps/api/tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["es2024"], "types": ["node"] }, "include": ["src", "test", "prisma", "scripts", "*.config.ts"] }`
- `packages/shared/tsconfig.json`: igual, com `"types": []` e `"include": ["src"]`.
- `apps/web`: modelo do Vite. `tsconfig.json` com `files: []`, `references` para `tsconfig.app.json` e `tsconfig.node.json`, e `paths: { "@/*": ["./src/*"] }` também na raiz por causa do shadcn. O `tsconfig.app.json` usa `lib: ["ES2024","DOM","DOM.Iterable"]`, `jsx: "react-jsx"`, `types: ["vite/client"]`, os mesmos `paths` e nenhum `baseUrl`. Typecheck com `tsc -b`.

```json
// apps/api/package.json
{
  "name": "@vinimon/api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "prisma generate && tsx watch --clear-screen=false src/server.ts",
    "build": "prisma generate && tsdown",
    "start": "node --enable-source-maps dist/server.mjs",
    "typecheck": "prisma generate && tsc --noEmit",
    "test": "prisma generate && vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "db:teste:recriar": "docker compose -f ../../docker-compose.yml exec -T postgres psql -U vinimon -d postgres -c \"DROP DATABASE IF EXISTS vinimon_test WITH (FORCE)\" -c \"CREATE DATABASE vinimon_test OWNER vinimon\""
  },
  "dependencies": {
    "@date-fns/tz": "1.5.0", "@fastify/cookie": "11.1.3", "@fastify/helmet": "13.2.0", "@fastify/multipart": "10.1.4",
    "@fastify/rate-limit": "11.2.1", "@fastify/static": "10.1.6", "@fastify/swagger": "9.9.2",
    "@node-rs/argon2": "2.2.2", "@prisma/adapter-pg": "7.10.1", "@prisma/client": "7.10.1",
    "@scalar/fastify-api-reference": "1.75.0", "close-with-grace": "2.5.0", "date-fns": "4.4.0",
    "fastify": "5.12.7", "fastify-plugin": "6.0.1", "fastify-type-provider-zod": "7.0.0", "file-type": "22.2.0",
    "imapflow": "2.5.8", "ldapts": "9.2.0", "mailparser": "3.10.0", "nodemailer": "10.1.7", "otplib": "13.5.0",
    "pg-boss": "12.38.0", "socket.io": "4.8.4", "zod": "catalog:"
  },
  "devDependencies": {
    "@faker-js/faker": "10.6.0", "@types/node": "catalog:", "@vinimon/shared": "workspace:*",
    "pino-pretty": "13.2.0", "prisma": "7.10.1", "tsdown": "0.23.1", "tsx": "4.23.15",
    "typescript": "catalog:", "vitest": "catalog:"
  }
}
```

`@vinimon/shared` fica em devDependencies porque o tsdown o embute no bundle. O `db:teste:recriar` só é usado se o banco **de teste** ficar inconsistente, e apaga apenas `vinimon_test`.

Os demais manifestos:
- `packages/shared/package.json`: `"name": "@vinimon/shared"`, `"type": "module"`, `"sideEffects": false`, `"exports": { ".": "./src/index.ts" }`, scripts `typecheck: tsc --noEmit` e `test: vitest run --passWithNoTests`, dependência `zod: catalog:`.
- `apps/web/package.json`:
  - dependencies: as versões da seção 1.2, mais `@vinimon/shared: workspace:*`, `zod: catalog:` e `@types/react` / `@types/react-dom` 19.3.0 (estes dois em devDependencies);
  - scripts: `dev: vite`, `build: vite build`, `typecheck: tsc -b`, `test: vitest run --passWithNoTests`, `test:e2e: playwright test`.

```ts
// apps/api/prisma.config.ts
import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Prisma 7 não carrega .env sozinho. Variáveis já definidas no ambiente têm prioridade.
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL },
})
```

```prisma
// apps/api/prisma/schema.prisma (cabeçalho obrigatório no Prisma 7)
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "esm"
}

datasource db {
  provider = "postgresql"
}
```

O que o Prisma 7 muda na prática:
- o gerador agora é `prisma-client` e exige `output`;
- o import é `../generated/prisma/client`;
- `url` saiu do bloco `datasource` e foi para o `prisma.config.ts`;
- adapter obrigatório: `new PrismaClient({ adapter: new PrismaPg(...) })`, sem binário Rust de query (compilador wasm), com o pool configurado no `pg`;
- `.env` não é lido automaticamente;
- `migrate dev` e `reset` não rodam mais `generate` nem `seed` (as flags `--skip-*` deixaram de existir);
- `$use` foi removido;
- guarda contra agentes de IA (seção 0, item 2);
- requisitos: Node ^20.19, ^22.12 ou >=24 e TS >=5.4.

Como o tsconfig usa `moduleResolution: bundler`, o gerador escreve imports sem extensão.

```ts
// apps/api/tsdown.config.ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  deps: { alwaysBundle: [/^@vinimon\//] }, // embute o shared (TS fonte); o resto fica externo
})
```

```json
// biome.json (raiz)
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!**/generated", "!**/routeTree.gen.ts", "!**/dist", "!apps/web/src/components/ui"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 120 },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded", "trailingCommas": "all" } },
  "css": { "parser": { "tailwindDirectives": true } },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "useImportType": "error", "noEnum": "error", "noParameterProperties": "error", "noNonNullAssertion": "error" },
      "suspicious": { "noExplicitAny": "error", "noConsole": { "level": "warn", "options": { "allow": ["error", "warn"] } } },
      "correctness": { "noUnusedImports": "error", "noUnusedVariables": "error" },
      "nursery": { "noFloatingPromises": "warn" }
    }
  },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

```yaml
# docker-compose.yml (raiz)
name: vinimon
services:
  postgres:
    image: postgres:18.6-alpine
    environment:
      POSTGRES_USER: vinimon
      POSTGRES_PASSWORD: vinimon
      POSTGRES_DB: vinimon
    ports: ['127.0.0.1:5432:5432']
    volumes:
      - pgdata:/var/lib/postgresql            # Postgres 18+: montar o diretório pai (PGDATA=/var/lib/postgresql/18/docker)
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U vinimon -d vinimon']
      interval: 5s
      timeout: 5s
      retries: 10
  mailpit:
    image: axllent/mailpit:v1.31
    ports: ['127.0.0.1:1025:1025', '127.0.0.1:8025:8025']
volumes:
  pgdata:
```

O arquivo `docker/postgres/init/01-banco-teste.sql` contém apenas `CREATE DATABASE vinimon_test OWNER vinimon;`.

```dotenv
# apps/api/.env.example  (copiar para apps/api/.env)
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgresql://vinimon:vinimon@localhost:5432/vinimon
DATABASE_URL_TESTE=postgresql://vinimon:vinimon@localhost:5432/vinimon_test
APP_URL=http://localhost:5173
TRUST_PROXY=false
SESSAO_COOKIE=vinimon_sessao
API_DOCS=true
JOBS_HABILITADOS=true
ARMAZENAMENTO_DIR=./storage
ANEXO_MAX_MB=10
SMTP_URL=smtp://localhost:1025
EMAIL_REMETENTE="Vinimon <nao-responda@vinimon.local>"
FUSO_HORARIO=America/Sao_Paulo
# Produção: WEB_DIST_DIR=../web/dist  TRUST_PROXY=true  APP_URL=https://chamados.suaempresa.com.br  SESSAO_COOKIE=__Host-vinimon_sessao
# Seed: SEED_ADMIN_SENHA=defina-uma-senha-forte
```

Adições ao `.gitignore`: `node_modules/`, `dist/`, `apps/api/src/generated/`, `apps/api/storage/`, `.env`, `*.db`, `*.db-wal`, `*.db-shm`, `coverage/`, `.vitest/`, `playwright-report/`, `test-results/`.

Os arquivos `data/*.db*` contêm hashes de senha e precisam sair do git (`git rm --cached`). Remover do histórico é uma decisão do humano. Antes disso, faça backup: o `importar-sqlite.ts` precisa do `VINIMON.db`.

O frontend (`apps/web/vite.config.ts`) usa:
- plugins `[tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()]`;
- `resolve.alias['@'] = fileURLToPath(new URL('./src', import.meta.url))`;
- `server.proxy`: `'/api'` → `http://localhost:3000` e `'/socket.io'` → `{ target: 'http://localhost:3000', ws: true }`.

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  verificar:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:18.6-alpine
        env:
          POSTGRES_USER: vinimon
          POSTGRES_PASSWORD: vinimon
          POSTGRES_DB: vinimon_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U vinimon -d vinimon_test"
          --health-interval 5s --health-timeout 5s --health-retries 20
    env:
      DATABASE_URL_TESTE: postgresql://vinimon:vinimon@localhost:5432/vinimon_test
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6          # lê packageManager do package.json
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc         # conteúdo: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm exec biome ci .
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

Um job de E2E com Playwright entra depois, na trilha de front.

**Estratégia do banco de teste:**
- Banco separado `vinimon_test` no mesmo Postgres, criado pelo init do compose. No CI é o banco do service.
- `migrate deploy` uma vez por execução (globalSetup).
- `TRUNCATE ... RESTART IDENTITY CASCADE` antes de cada teste.
- Arquivos rodam em sequência (`fileParallelism: false`).
- Três travas contra apagar o banco de dev: a URL precisa terminar em `_test`, e isso é conferido no config, no globalSetup e no setup.
- Schema por worker foi rejeitado: dá mais trabalho para o Haiku, e o volume de testes não justifica.
- `migrate reset` foi rejeitado: é bloqueado para agentes e é destrutivo.

## 5. Otimização e deploy

Problemas do código atual e a correção de cada um:

1. **Painel e relatórios em memória.** Hoje `dashboard()` carrega todos os chamados abertos e `relatorio()` carrega todos os do período, rodando `enriquece` em JS.
   - Correção: KPIs com `count`/`groupBy` do Prisma usando `where: { ...escopoChamados(u), ... }`, e nomes resolvidos com um único `findMany({ where: { id: { in } } })`.
   - Isso exige colunas desnormalizadas em `chamados`, mantidas pelo service: `tipoStatus` (enum), `prazoRespostaEm`, `prazoSolucaoEm`, `primeiraRespostaEm`, `encerradoEm`, `tempoSolucaoMin`, `respostaNoPrazo`, `solucaoNoPrazo`.
   - Com elas, "SLA estourado" vira `count({ where: { tipoStatus: { not: 'ENCERRADO' }, prazoSolucaoEm: { lt: agora } } })`, o tempo médio vira `_avg.tempoSolucaoMin` e "dentro/fora do SLA" vira `groupBy(solucaoNoPrazo)`. Nada de SQL cru.
2. **Prazos de SLA armazenados.** São calculados por `lib/sla.ts` (função pura com jornada, feriados e fuso via `@date-fns/tz`) na abertura, na troca de problema/prioridade e na retomada após pendência. O job `sla.verificar` (pg-boss, a cada 5 min) avisa quem estiver perto do prazo usando o índice `(tipo_status, prazo_solucao_em)`.
3. **Índices.** O Postgres não indexa FK sozinho: indexe toda FK usada em join ou delete. Em `chamados`:
   - `(area_id, tipo_status)`
   - `(operador_id, tipo_status)`
   - `(solicitante_id, aberto_em DESC)`
   - `(tipo_status, prazo_solucao_em)`
   - `(aberto_em)` e `(encerrado_em)`
   - GIN `pg_trgm` em `assunto`, para busca, Ctrl+K e `ILIKE`

   Nas outras tabelas:
   - `assentamentos(chamado_id, id)` para o cursor da linha do tempo;
   - `notificacoes(usuario_id, id DESC)` e `(usuario_id, lida_em)`;
   - `sessoes(expira_em)`;
   - `anexos(chamado_id)`;
   - trigram em `usuarios.nome` (autocompletar de @menção) e em `equipamentos.etiqueta`.
4. **N+1 da função `notifica`.** Hoje faz 2 queries mais 2 por destinatário. A correção:
   - uma query dos participantes (`DISTINCT autor_id` dos assentamentos + solicitante + operador + mencionados);
   - um `findMany` dos usuários ativos;
   - filtro de visibilidade em memória com `podeVerChamado(usuario, chamado)`, sem query por pessoa;
   - `createMany` na mesma transação;
   - depois do commit, emissão em `usuario:{id}` e um job de e-mail com a lista de ids.
5. **Polling de 15 s substituído por push via Socket.IO.** Com 50 usuários, elimina cerca de 200 req/min. O REST continua como reconciliação ao reconectar.
6. **Anexos fora do banco.** Multipart em streaming para o disco (`ARMAZENAMENTO_DIR/anexos/aaaa/mm/<uuid>`), com MIME conferido por `file-type`. O download usa `createReadStream`, `Content-Disposition`, `nosniff` e `CSP sandbox`, e não depende do `@fastify/static`, que só existe em produção.
7. **Cache de config.** `lib/config.ts` lê a tabela uma vez e atualiza o cache no `PUT /config`. Hoje há uma query `cfg()` por requisição. Isso vale para processo único; com várias instâncias, usar `LISTEN/NOTIFY`.
8. **Listas limitadas e projeções.** `porPagina` no máximo 100, `select` explícito (sem `descricao` na lista), e o `/api/meta` atual vira endpoints de opções leves. Equipamentos e usuários passam a usar combobox com busca no servidor, em vez de listas inteiras.
9. **Sessão no banco.** Uma query indexada por requisição autenticada; `ultimoUsoEm` é gravado no máximo a cada 5 min. O job diário `limpeza` apaga sessões expiradas.
10. **Compressão e cache.** O Caddy faz `encode zstd gzip`, sem `@fastify/compress`. `/assets/*` é servido com `immutable` e `index.html` com `no-cache`. O front faz code splitting por rota e usa `staleTime` no React Query.

**Deploy (decisão: o Fastify serve a SPA; o Caddy só faz HTTPS e compressão).**
- Por que o Fastify serve a SPA:
  - um artefato e uma origem;
  - CSP e headers num lugar só (helmet);
  - funciona igual sem proxy (rede local/Windows);
  - o custo de servir estáticos com cache imutável é desprezível para um helpdesk interno.
- Passos de cada release: `git pull && pnpm install --frozen-lockfile && pnpm build && pnpm db:deploy && systemctl restart vinimon`.
- Processo único: `node --enable-source-maps dist/server.mjs`, com `WorkingDirectory=/opt/vinimon/apps/api`. Ele concentra API, SPA, Socket.IO e workers do pg-boss.
- Para escalar no futuro: `@socket.io/postgres-adapter` e `JOBS_HABILITADOS=false` nas instâncias web.

```
# /etc/caddy/Caddyfile
chamados.suaempresa.com.br {
	encode zstd gzip
	request_body {
		max_size 60MB
	}
	reverse_proxy 127.0.0.1:3000
}
# Intranet sem DNS público: adicionar "tls internal" (CA local do Caddy) ou "tls /cert.pem /key.pem" da empresa.
```

```ini
# /etc/systemd/system/vinimon.service
[Unit]
Description=Vinimon
After=network.target postgresql.service
[Service]
User=vinimon
WorkingDirectory=/opt/vinimon/apps/api
EnvironmentFile=/etc/vinimon/api.env
ExecStart=/usr/bin/node --enable-source-maps dist/server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/vinimon
[Install]
WantedBy=multi-user.target
```

O `api.env` de produção leva `HOST=127.0.0.1`, `TRUST_PROXY=true`, `APP_URL=https://…`, `WEB_DIST_DIR=../web/dist`, `ARMAZENAMENTO_DIR=/var/lib/vinimon/storage` e `SESSAO_COOKIE=__Host-vinimon_sessao`.

Backup diário: `pg_dump` mais cópia do diretório de storage. Em Windows Server, o equivalente é NSSM para o Node e o serviço do Caddy.

**Saúde:** `GET /api/v1/saude` (liveness) e `GET /api/v1/saude/pronto` (faz `SELECT 1` e confere se o pg-boss iniciou).

## 6. Ordem das tarefas de fundação (cada uma termina com verificação objetiva)

| # | Tarefa | Verificação |
|---|---|---|
| F1 | `.gitignore` e retirada dos `.db` do git; `package.json` raiz, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.nvmrc`, `docker-compose.yml` e init SQL | `pnpm install` sem erro, `pnpm db:up` com containers healthy, `pnpm lint` |
| F2 | `packages/shared`: `http.ts`, `permissoes.ts`, `zod-pt.ts`, `modulos/areas.ts`, `index.ts`, e teste de `zDataHora` (decode/encode) | `pnpm --filter @vinimon/shared typecheck && pnpm --filter @vinimon/shared test` |
| F3 | `apps/api`: `package.json`, `tsconfig`, `prisma.config.ts`, `schema.prisma` (Area, Usuario, Sessao, Perfil), `env.ts`, `lib/prisma.ts` | `pnpm db:migrate -- --name inicial`, `pnpm --filter @vinimon/api typecheck` |
| F4 | `lib/erros.ts`, `lib/paginacao.ts`, `plugins/erros.ts`, `plugins/origem.ts`, `app.ts`, `server.ts` (sem realtime/jobs), `modules/saude` | `pnpm --filter @vinimon/api dev`; `curl -s localhost:3000/api/v1/saude` devolve `{"ok":true}` |
| F5 | `lib/senha.ts`, `lib/sessao.ts`, `plugins/autenticacao.ts` | typecheck |
| F6 | Infra de teste (config, constantes, global-setup, setup, ajudantes) e `modules/areas` com o teste | `pnpm --filter @vinimon/api test`: 6 testes verdes |
| F7 | `modules/auth` (entrar, sair, sessão), rate limit, bloqueio persistido, rehash scrypt → argon2, com testes | testes verdes |
| F8 | `plugins/docs.ts` | `http://localhost:3000/api/docs` abre e lista "Áreas" |
| F9 | `plugins/spa.ts` e `tsdown.config.ts` | `pnpm build && WEB_DIST_DIR=../web/dist pnpm --filter @vinimon/api start` serve `index.html` em `/qualquer-rota` |
| F10 | `.github/workflows/ci.yml` | pipeline verde no PR |
| F11 | `lib/filas.ts` (memória e pg-boss), `jobs/index.ts`, `lib/eventos.ts`, `realtime/servidor.ts` | `dev` sobe sem erro; o schema `pgboss` aparece no banco |
| F12 | `scripts/importar-sqlite.ts` (ids preservados, `setval`, BLOB → arquivo, hashes scrypt mantidos) | contagens iguais entre SQLite e Postgres |

## 7. O que não foi verificado

- **pg-boss 12:** confirmado só o exemplo do README (`{ PgBoss }`, `createQueue`, `work` com array). Não conferi os nomes exatos de opções como `getQueue`, `batchSize`, `stop({ graceful, timeout })` e `schedule(..., { tz })`.
- **otplib 13:** parâmetros do `generateURI`.
- **Scalar sob CSP de produção.**
- **Chave `savePrefix`** no `pnpm-workspace.yaml`.
- **TS 6.0.3 com o client gerado do Prisma 7.10:** o gerador tem opção de preâmbulo `@ts-nocheck`, o que deve evitar erros nos arquivos gerados.
- **Zod 4 direto no `validateSearch`** do TanStack Router.

Fontes: [Prisma: Upgrade to v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [Prisma 7 → 8 (RC)](https://www.prisma.io/docs/guides/upgrade-prisma-orm/postgresql), [Vitest 5 changes](https://blog.openreplay.com/vitest-5-changes/), [TypeScript 6.0 (Visual Studio Magazine)](https://visualstudiomagazine.com/articles/2026/03/23/typescript-6-0-ships-as-final-javascript-based-release-clears-path-for-go-native-7-0.aspx), [shadcn CLI v4](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4), [pnpm 12.0.0-rc.8](https://newreleases.io/project/npm/pnpm/release/12.0.0-rc.8), [fastify-type-provider-zod README](https://raw.githubusercontent.com/turkerdev/fastify-type-provider-zod/main/README.md), [pnpm build settings](https://raw.githubusercontent.com/pnpm/pnpm.io/main/docs/settings/build.md), [Dockerfile oficial postgres:18](https://raw.githubusercontent.com/docker-library/postgres/master/18/alpine3.24/Dockerfile), [pnpm/action-setup](https://github.com/pnpm/action-setup/releases), [actions/setup-node](https://github.com/actions/setup-node/releases), [actions/checkout](https://github.com/actions/checkout/releases). Também inspecionei os tarballs publicados no npm de prisma 7.10.1, @prisma/config, @prisma/adapter-pg, @prisma/client, zod 4.6.7, fastify-type-provider-zod 7.0.0, tsdown 0.23.1, @node-rs/argon2, @fastify/cookie, socket.io e Biome 2.5.15.
