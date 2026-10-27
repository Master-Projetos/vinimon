> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 20 — (Fase 3) Organização, inventário restante e escala

### T-20.1 — Projetos
- **Depende de:** T-15.4 · **Paralelo com:** T-20.2
- **Requisitos:** C21
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/projetos.ts`, `apps/api/src/modules/projetos/{schemas.ts,service.ts,routes.ts,projetos.test.ts}`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Model `Projeto {id, nome, descricao?, chamadoRaizId @unique, criadoPorId, criadoEm}`.
  2. `GET /projetos/:id` com a árvore de subchamados visíveis (recursivo até 5 níveis via `findMany` iterativo).
- **Pronto quando:**
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-20.2 — Nuvem de tags e relatórios de nicho
- **Depende de:** Fase 2 · **Paralelo com:** T-20.1
- **Requisitos:** B15, G06
- **Arquivos:** `apps/api/src/modules/relatorios/{nicho.ts,nicho.test.ts,routes.ts}`, `apps/web/src/features/painel/components/nuvem-tags.tsx`, `apps/web/src/routes/_app/painel.tsx`
- **Passos:** relatórios `nuvem-tags` (contagem por período), `top-problemas`, `custos` e `recursos`. Card da nuvem no painel, só para a equipe.
- **Pronto quando:**
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-20.3 — Campos personalizados de ativo e cadastro em lote
- **Depende de:** T-14.2, T-17.4 · **Paralelo com:** T-20.4, T-20.5
- **Requisitos:** I11, I15
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `apps/api/src/modules/ativos/{lote.ts,lote.test.ts,campos.ts}`, `packages/shared/src/modulos/ativos.ts`, `packages/shared/src/enums.ts`, `apps/api/src/lib/enums-check.ts` (enum do `alvo`)
- **Passos:**
  1. `CampoPersonalizado.alvo (CHAMADO|ATIVO)` e `AtivoCampoValor`, espelho de `ChamadoCampoValor`.
  2. `POST /ativos/lote` (multipart CSV ≤ 1 MiB, ≤ 2000 linhas): parse próprio por `;` com aspas; validação por linha; tudo ou nada; relatório de erros por linha; numeração automática `prefixo + sequência`.
- **Pronto quando:**
  - [ ] o CSV com uma linha inválida não grava nada;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-20.4 — Softwares e licenças
- **Depende de:** T-17.4 · **Paralelo com:** T-20.3, T-20.5
- **Requisitos:** I12
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/softwares.ts`, `apps/api/src/modules/softwares/{service.ts,routes.ts,softwares.test.ts}`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Models `Software {id, nome, fabricanteId?, tipoLicenca, quantidadeLicencas Int?, chaveCifrada String? (cifrar), validade Date?}` e `SoftwareInstalacao {softwareId, ativoId, @@id}`.
  2. A chave da licença só é mostrada para `inventario.gerenciar`, com auditoria de leitura.
  3. Contagem de licenças usadas.
- **Pronto quando:**
  - [ ] a chave nunca sai sem a permissão;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-20.5 — Alocação com termo e empréstimos
- **Depende de:** T-17.6 · **Paralelo com:** T-20.3, T-20.4
- **Requisitos:** I13, I17
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/alocacoes.ts`, `apps/api/src/modules/alocacoes/{service.ts,routes.ts,alocacoes.test.ts}`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Model `TermoResponsabilidade {id, ativoId, usuarioId, emitidoEm, assinadoEm?, assinaturaAnexoId String?}`. A assinatura é um PNG do canvas enviado pelo pipeline de anexos do ativo.
  2. Model `Emprestimo {id, ativoId, usuarioId, retiradaEm, previstaDevolucaoEm, devolvidoEm?}`, com no máximo um em aberto por ativo (índice parcial único).
- **Pronto quando:**
  - [ ] o segundo empréstimo em aberto dá 409;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-20.6 — Telas: projetos e inventário restante
- **Depende de:** T-20.1, T-20.3–T-20.5 · **Paralelo com:** T-20.7
- **Requisitos:** C21, I11–I13, I15, I17
- **Arquivos:** `apps/web/src/routes/_app/{projetos.$projetoId.tsx,inventario/softwares.tsx,inventario/emprestimos.tsx}`, `apps/web/src/features/{projetos,softwares,alocacoes}/queries.ts`, `apps/web/src/features/inventario/components/{lote-dialog.tsx,termo-assinatura.tsx}`, `apps/web/src/routes/_app/inventario/{softwares.test.tsx,emprestimos.test.tsx}`
- **Passos:**
  1. Árvore do projeto, softwares, empréstimos e importação em lote.
  2. Assinatura em `<canvas>` (pointer events), exportada com `toBlob('image/png')`.
- **Pronto quando:**
  - [ ] `softwares.test.tsx` e `emprestimos.test.tsx` com `renderRota` + `apiFalsa` (T-9.16): (a) renderiza com os dados; (b) o submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-20.7 — Escala horizontal
- **Depende de:** Fase 2 · **Paralelo com:** T-20.6
- **Requisitos:** Escala (§1.4); S90–S97
- **Arquivos:** `apps/api/src/realtime/{plugin.ts,presenca.ts,limites.ts}`, `apps/api/src/lib/{config.ts,cache-invalidacao.ts}`, `apps/api/prisma/schema.prisma` + migração, `docs/operacao.md`, `apps/api/package.json` (@socket.io/postgres-adapter 0.5.0, versão exata do plano)
- **Passos:**
  1. Instalar `@socket.io/postgres-adapter@0.5.0` + `pg`; tabela `socket_io_attachments` por migração, modelada com `@@ignore`. Env `REALTIME_ADAPTER=memoria|postgres`.
  2. Presença com conexões contadas por `fetchSockets()` e manual na tabela.
  3. `RateLimiterPostgres` para os eventos.
  4. Invalidação de config e calendário via `LISTEN/NOTIFY` (`vinimon_cache`).
  5. Instâncias web com `JOBS_HABILITADOS=false`; uma instância de jobs.
- **Pronto quando:**
  - [ ] teste com dois `buildApp` no mesmo banco: o evento emitido numa instância chega ao socket da outra; a revogação derruba nas duas;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M
