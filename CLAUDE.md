# CLAUDE.md — Vinimon v2 (instruções para agentes)

Você implementa UMA tarefa por vez do plano em `docs/plano/`, com o modelo indicado no cartão (Haiku, Sonnet ou Opus). Não reabra decisões. Se algo do plano for
impossível (erro de versão, API que não existe), PARE e termine sua resposta com `BLOQUEADO: <motivo e evidência>`,
sem improvisar outra solução.

## Onde ler (leia só o que a tarefa cita)
- Cartão da tarefa: `docs/plano/tarefas/fase-NN.md` (ex.: T-5.4 → `fase-05.md`). Convenções de todas as tarefas: `docs/plano/tarefas/00-convencoes.md`.
- "§N" no cartão remete à Parte A, em `docs/plano/fundamentos/`: §1 `01-escopo.md` · §2 `02-decisoes-libs.md` · §3 `03-arquitetura.md` ·
  §4 `04-dados.md` · §5 `05-seguranca.md` (S# e testes T##) · §6 `06-design.md` · §7 `07-codigo-canonico.md`. §9–§11: `tarefas/corte-verificacao-riscos.md`.
- `docs/plano/relatorios/*.md` são referência literal dos especialistas; só leia quando o cartão citar.
- Precedência em conflito: Parte A (`fundamentos/`) > Parte B (`tarefas/`) > relatórios.
- Nomes: `T-x.y` = tarefa; `T##` (dois dígitos, ex.: T07) = teste de segurança da §5.2; `TM1`–`TM8` = recursos estilo Teams; `S#` = requisito de segurança.
- Ao terminar, marque o cartão concluído só no commit (`T-x.y: …`); não edite o plano para "encaixar" o código.

## Comandos
- Instalar: `pnpm install` (nunca `npm`; nunca `@latest`; dependência nova: `pnpm --filter <pacote> add -E <nome>@<versão exata do plano>`)
- Banco de dev: `pnpm db:up` (Postgres 18.6 + Mailpit). Copie `apps/api/.env.example` para `apps/api/.env`.
- Migração nova: `pnpm --filter @vinimon/api exec prisma migrate dev --name <nome_snake>`; SQL manual: `--create-only`, editar, rodar de novo.
- Aplicar migrações: `pnpm db:deploy` · Seed: `pnpm db:seed` · Demo: `pnpm --filter @vinimon/api seed:dev`
- Desenvolvimento: `pnpm dev` (API :3000, web :5173 com proxy de /api e /socket.io)
- Antes de concluir QUALQUER tarefa: `pnpm verificar` (= `pnpm lint && pnpm typecheck && pnpm test`) tem de ficar verde.
- Teste de um arquivo: `pnpm --filter @vinimon/api exec vitest run src/modules/areas` · E2E: `pnpm test:e2e`
- Não passe `--` para scripts pnpm (o pnpm repassa o `--` ao script): `pnpm -F @vinimon/api importar:v1 --sqlite x.db`.
- Toda tarefa que cria, renomeia ou remove arquivo em `apps/web/src/routes` roda `pnpm -F @vinimon/web exec tsr generate` e commita `src/routeTree.gen.ts`.
- Enums do `schema.prisma` e de `packages/shared/src/enums.ts` mudam juntos, na mesma tarefa, com `apps/api/src/lib/enums-check.ts`.

## Estrutura
- `packages/shared`: schemas Zod, tipos, enums, permissões e contratos de rota (`modulos/<m>.ts`). Só depende de `zod`.
- `apps/api`: Fastify 5 + Prisma 7 + Socket.IO + pg-boss. `src/modules/<m>/{schemas,service,routes}.ts` + `<m>.test.ts`.
  Escopo de chamado: SOMENTE `src/autorizacao/chamados.ts`. Cliente Prisma: `src/lib/prisma.ts` (gerado em `src/generated/prisma`).
- `apps/web`: React 19 + TanStack Router/Query + Tailwind 4 + shadcn. HTTP só por `chamar()` de `src/lib/api.ts`.
- `legado/v1`: sistema antigo, só leitura.

## Regras
1. Siga o plano literalmente: nomes de arquivos, rotas, campos, mensagens e versões exatas. Não adicione dependências fora da lista.
2. Nunca relaxe segurança. Proibido: desligar CSRF/CSP/rate limit, `trustProxy: true`, `@fastify/cors`, `data: request.body`,
   `$queryRawUnsafe`/`$executeRawUnsafe`, `dangerouslySetInnerHTML` (fora de components/ui), `innerHTML`, `eval`/`new Function`,
   logar corpo/senha/token, `console.log` em apps/api/src, espalhar escopo e filtro no mesmo objeto, devolver 403 para
   recurso fora do escopo (é 404), guardar segredo em localStorage.
3. Toda rota /api/v1 declara `config: { acesso: ... }` e `schema` com `response`. Todo body é `z.strictObject`.
4. Mutação com mais de um passo: `prisma.$transaction(async (tx) => …)`; efeitos (socket, fila) só DEPOIS do commit.
   Cadastros e configurações sempre chamam `auditar()`.
5. Prisma 7: nunca rode `prisma migrate reset`, `db push --force-reset` nem defina `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
   Se `migrate dev` acusar drift ou pedir reset, rode uma vez `pnpm --filter @vinimon/api db:dev:recriar` e `db:teste:recriar`; se persistir, PARE (BLOQUEADO). O banco de teste se recria só com `pnpm --filter @vinimon/api db:teste:recriar`.
6. TypeScript: proibido `any`, `!` (non-null assertion), `enum` do TS, `@ts-ignore`, `@ts-expect-error`, `biome-ignore`, `as unknown as`,
   `.skip(`/`.only(`/`it.todo` em testes e editar migração que já existe na base. Use uniões de string de `@vinimon/shared`.
7. Idioma: interface, mensagens de erro, comentários e nomes de domínio em português do Brasil, com acentuação na interface;
   identificadores sem acento (`Chamado`, `Assentamento`, `criadoEm`); termos técnicos em inglês (`service`, `routes`, `schema`).
8. Commits pequenos, um por tarefa: `T-x.y: <o que foi feito>` (ex.: `T-2.3: módulo de prioridades`). Não faça commit com teste vermelho.
   Você só faz commit local: nunca `git push`, `gh`, rebase, merge, nem criar ou trocar de branch. O runner (`scripts/plano/rodar.mjs`)
   publica e abre o PR (protocolo em `docs/plano/execucao/README.md`).
9. Testes: Vitest contra Postgres real (`vinimon_test`); nunca mocke Prisma/escopo. Cada módulo cobre 401, 403, 400 com detalhes,
   caminho feliz, 404/409. Bug corrigido = teste que falhava antes.

## Armadilhas de versão
- Zod 4.6.7: `z.email()`, `z.uuid()`, `z.url()`, `z.int()` no topo; `z.strictObject`; `error:` em vez de `message:`;
  `z.record(chave, valor)`; `err.issues`; `z.coerce.*` tem input `unknown`; `.default()` recebe valor de saída; datas da API com `zDataHora()`.
- Fastify 5: `listen({ host, port })`; `decorateRequest('x', null)`; `request.routeOptions.config`/`.url`; num handler async,
  retorne o valor OU use `reply.send`, nunca os dois (exceto `return reply.code(201).send(x)`).
- Prisma 7.10.1: import de `../generated/prisma/client`; adapter `PrismaPg` obrigatório; `.env` não é lido sozinho;
  `migrate dev` não roda seed nem generate; não existe `$use`; FKs por campo escalar, nunca `connect`.
- TS 6: `types` padrão é `[]` (declare); sem `baseUrl` (use `paths`); `noUncheckedIndexedAccess` ligado: trate `arr[i]` como possível `undefined`.
- otplib 13: `generateSecret()`, `generateURI({ issuer, label, secret })`, `await verify({ secret, token, epochTolerance: 30, afterTimeStep })` → `{ valid, timeStep }`.
- pg-boss 12: `import { PgBoss } from 'pg-boss'`; `getQueue`/`createQueue` antes de `work`/`schedule`; handler recebe ARRAY de jobs.
- TanStack Table: v8 (8.21.3). TanStack Router: commitar `routeTree.gen.ts`; plugin do router antes de `react()` no Vite.
- shadcn: nunca `init -d`; `components.json` à mão.

## Receita de módulo (API)
1. `packages/shared/src/modulos/<m>.ts`: schemas + tipos + `<m>Api` com `contrato()`; exporte no `index.ts`.
2. `apps/api/src/modules/<m>/schemas.ts`: reexporta o contrato; `select<Entidade>` com `satisfies Prisma.XSelect`.
3. `service.ts`: único lugar com `prisma`; listas com `paginar` + `$transaction([findMany, count])`; `escaparLike` em `contains`.
4. `routes.ts`: `app.route` a partir do contrato; `config.acesso`; `contextoDe(req)` nas mutações.
5. Registrar em `src/app.ts` (escopo /api/v1, ordem alfabética). 6. `<m>.test.ts`. 7. `pnpm verificar`.

## Código canônico
O código de referência (shared/http, permissões, env.ts, prisma.ts, erros, sessão, plugins, app.ts, módulo `areas`,
testes e a tela de cadastro do front) está em `docs/plano/fundamentos/07-codigo-canonico.md`. Copie o padrão; não "melhore".
