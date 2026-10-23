> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 18 — (Fase 3) Clientes e custos

### T-18.1 — Clientes
- **Depende de:** Fase 2 · **Paralelo com:** Fase 19
- **Requisitos:** A07
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/clientes.ts`, `apps/api/src/modules/clientes/{service.ts,routes.ts,clientes.test.ts}`, `apps/api/src/modules/{chamados/service.ts,chamados/consultas.ts}`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Model `Cliente {id, nome @unique, documento VarChar(20)? @unique, dominioEmail?, ativo}`.
  2. `clienteId?` em Unidade, Usuario, Chamado (herdado do solicitante na abertura) e Ativo.
  3. Filtro `clienteIds` na lista. Não altera o escopo.
- **Pronto quando:**
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-18.2 — Centros de custo e autorização de custos
- **Depende de:** T-18.1 · **Paralelo com:** T-18.3
- **Requisitos:** A09, C26
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/custos.ts`, `packages/shared/src/enums.ts`, `apps/api/src/lib/enums-check.ts` (`CustoStatus`, eventos CUSTO_*), `apps/api/src/modules/custos/{service.ts,routes.ts,custos.test.ts}`, `apps/api/src/modules/chamados/acoes.ts`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Model `CentroCusto {id, nome, clienteId?, ativo}`.
  2. `Chamado` ganha `centroCustoId?`, `custo Decimal(12,2)?`, `custoStatus CustoStatus (SEM_CUSTO|AGUARDANDO|AUTORIZADO|NEGADO)` e `custoDecididoPorId?`. `Usuario.limiteAutorizacao Decimal?`.
  3. Fluxo:
     - `PUT /chamados/:id/custo {versao, valor}` (`podeAtender`) leva a AGUARDANDO;
     - `POST /chamados/:id/custo/decidir {autorizar}` exige gerente da área (T-13.3) ou ADMIN com `limiteAutorizacao ≥ valor`;
     - concluir com AGUARDANDO dá 422.
  4. Eventos novos CUSTO_*.
- **Pronto quando:**
  - [ ] testes do fluxo;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-18.3 — Recursos alocáveis
- **Depende de:** T-18.1 · **Paralelo com:** T-18.2
- **Requisitos:** C27
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/recursos.ts`, `apps/api/src/modules/recursos/{service.ts,routes.ts,recursos.test.ts}`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Models `Recurso {id, nome @unique, unidadeMedida VarChar(20), ativo}` e `ChamadoRecurso {chamadoId, recursoId, quantidade Decimal(10,2) > 0, @@id}`.
  2. `PUT /chamados/:id/recursos` (`podeAtender`) e relatório de consumo.
- **Pronto quando:**
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-18.4 — Telas: clientes, custos e recursos
- **Depende de:** T-18.1–T-18.3 · **Paralelo com:** Fase 19
- **Requisitos:** A07, A09, C26, C27
- **Arquivos:** `apps/web/src/routes/_app/admin/{clientes.tsx,centros-custo.tsx,recursos.tsx}`, `apps/web/src/features/{clientes,custos,recursos}/queries.ts`, `apps/web/src/features/chamados/components/custo-section.tsx`, `apps/web/src/routes/_app/admin/{clientes.test.tsx,centros-custo.test.tsx,recursos.test.tsx}`
- **Passos:** cadastros e a seção "Custo e recursos" no trilho, com autorização.
- **Pronto quando:**
  - [ ] `clientes.test.tsx`, `centros-custo.test.tsx` e `recursos.test.tsx` com `renderRota` + `apiFalsa` (T-9.16): (a) renderiza com os dados; (b) o submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M
