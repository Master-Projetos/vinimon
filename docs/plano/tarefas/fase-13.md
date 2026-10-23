> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 13 — (Fase 2) Acesso avançado

### T-13.1 — LDAP/AD
- **Depende de:** MVP · **Paralelo com:** T-13.2
- **Requisitos:** A12; S125–S131
- **Arquivos:** `apps/api/src/env.ts`, `apps/api/prisma/schema.prisma` + migração, `apps/api/src/lib/ldap.ts`, `apps/api/src/modules/auth/{service.ts,ldap.test.ts}`, `apps/api/src/modules/config/routes.ts`, `packages/shared/src/enums.ts`, `apps/api/src/lib/enums-check.ts`, `apps/api/package.json` (ldapts 9.2.0, versão exata do plano)
- **Passos:**
  1. Instalar `ldapts@9.2.0`.
  2. Env `LDAP_URL`, `LDAP_CA_FILE`, `LDAP_BIND_DN`, `LDAP_BIND_SENHA`, `LDAP_BASE_DN`, `LDAP_ATTR_LOGIN` (padrão `sAMAccountName`), `LDAP_ATTR_EMAIL`, `LDAP_ATTR_NOME`, `LDAP_ATTR_TELEFONE`, `LDAP_GRUPO_ADMIN`, `LDAP_GRUPO_OPERADOR`, `LDAP_AREA_PADRAO_ID`: todas ou nenhuma (`superRefine`); `ldap://` sem StartTLS proibido em production.
  3. `enum OrigemAutenticacao { LOCAL LDAP @@map("origem_autenticacao") }` e `origemAutenticacao OrigemAutenticacao @default(LOCAL) @map("origem_autenticacao")` em `Usuario` (constante e tipo em `packages/shared/src/enums.ts`; `Igual` em `enums-check.ts`). A T-19.2 acrescenta `OIDC`.
  4. Em `entrar`: usuário LOCAL existente autentica localmente; senão, `autenticarLdap`:
     - senha vazia ou só espaços recusada **antes**;
     - bind de serviço;
     - busca com `AndFilter`/`EqualityFilter`, `sizeLimit: 2`, exatamente 1 resultado;
     - bind com o DN encontrado;
     - `userAccountControl & 2` nega;
     - perfil por `memberOf`;
     - `unbind` no `finally`.
     - Cria ou atualiza o usuário (OPERADOR recebe a área padrão). Erro responde igual a S9 e conta em S40.
  5. Usuário LDAP não troca nem recupera senha (422).
  6. `POST /config/ldap/testar` (`config.gerenciar`).
- **Pronto quando:**
  - [ ] `vi.mock('ldapts')`: login `*)(uid=*` dá 400 (Zod); o filtro escapa; senha vazia não chama `bind`; 2 resultados dão 401;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-13.2 — Isolamento por área configurável
- **Depende de:** MVP · **Paralelo com:** T-13.1
- **Requisitos:** A03; S44
- **Arquivos:** `packages/shared/src/config.ts`, `apps/api/src/lib/sessao.ts`, `apps/api/src/autorizacao/{chamados.ts,chamados.test.ts}`, `apps/api/src/lib/tempo-real.ts`, `apps/api/src/realtime/revalidacao.ts`, `apps/api/src/modules/config/service.ts`, `apps/api/test/escopo-equivalencia.test.ts`
- **Passos:**
  1. Config `chamado.isolarAreas` (padrão `true`).
  2. `UsuarioSessao.verTodasAreas = perfil==='OPERADOR' && !cfg['chamado.isolarAreas']`.
  3. Com `verTodasAreas`, `escopoChamados` devolve `{}` e `podeVerChamado` devolve `true`; `podeAtender` **não muda** (só as áreas do operador).
  4. O PATCH dessa chave chama `tempoReal.revalidarTodos()` (novo método: revalida os usuários conectados em lotes).
  5. estender a fixture de `escopo-equivalencia.test.ts` com o novo ator (operador com isolamento desligado) e manter o teste verde.
- **Pronto quando:**
  - [ ] com `false`, o operador vê outra área e recebe 403 ao assumir;
  - [ ] T33 continua verde com `true`;
  - [ ] `escopo-equivalencia.test.ts` verde com o ator novo;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-13.3 — Gerente de área
- **Depende de:** T-13.2 · **Paralelo com:** T-13.4
- **Requisitos:** A04
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `apps/api/src/lib/sessao.ts`, `apps/api/src/autorizacao/chamados.ts`, `apps/api/src/modules/areas-geridas/{service.ts,routes.ts,areas-geridas.test.ts}`, `packages/shared/src/modulos/areas-geridas.ts`, `apps/api/test/escopo-equivalencia.test.ts`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Model `AreaGerente {areaId, usuarioId, @@id}`. USUARIO só gerencia área com `atende=false`; OPERADOR e ADMIN só áreas entre as suas `areaIds` (validado no PATCH de usuário: `areasGeridasIds`).
  2. `UsuarioSessao.areasGeridas`. O escopo acrescenta `{ solicitante: { areaId: { in: areasGeridas } } }` dentro do `OR`; `podeVerChamado` recebe `solicitanteAreaId` em `ChamadoEscopo`.
  3. Visão `areas-geridas`.
  4. `GET /areas-geridas/:areaId/usuarios` e `PATCH /areas-geridas/:areaId/usuarios/:id {telefone?, departamentoId?, ativo?}`, com auditoria.
  5. estender a fixture de `escopo-equivalencia.test.ts` com o novo ator (gerente) e manter o teste verde.
- **Pronto quando:**
  - [ ] o gerente vê os chamados dos usuários da área gerida e não vê comentários internos se for USUARIO;
  - [ ] `escopo-equivalencia.test.ts` verde com o ator novo;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-13.4 — Áreas destino por área solicitante
- **Depende de:** MVP · **Paralelo com:** T-13.3
- **Requisitos:** A05
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/areas.ts`, `apps/api/src/modules/areas/{service.ts,areas-destino.test.ts}`, `apps/api/src/modules/chamados/service.ts`, `apps/api/src/modules/meta/service.ts`
- **Passos:**
  1. Model `AreaDestino {areaOrigemId, areaDestinoId, padrao Boolean, @@id([areaOrigemId, areaDestinoId])}`, com no máximo uma padrão por origem.
  2. Body de área ganha `destinos: {areaId, padrao}[]`.
  3. Abrir: se a área do solicitante tem destinos, `areaId` precisa estar entre eles (422) e os problemas sem área permitida não servem.
  4. `meta` devolve `destinosPermitidos` do usuário.
- **Pronto quando:**
  - [ ] área sem destinos configurados permite todas;
  - [ ] destino fora da lista dá 422;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-13.5 — Módulo de inventário por área, A19 e B03
- **Depende de:** T-13.2 · **Paralelo com:** T-13.4
- **Requisitos:** A17, A19, B03
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/config.ts`, `apps/api/src/lib/sessao.ts`, `apps/api/src/autorizacao/chamados.ts`, `apps/api/src/modules/{ativos/routes.ts,chamados/service.ts,usuarios/routes.ts}`, `apps/api/test/regras-f2.test.ts`
- **Passos:**
  1. `Area.moduloInventario Boolean @default(true)`. OPERADOR sem nenhuma área com o módulo recebe 403 nas rotas `inventario.*` (`UsuarioSessao.inventarioHabilitado`); ADMIN sempre acessa.
  2. Config `chamado.operadorTrataProprio` (padrão `true`): com `false`, `podeAtender` é `false` quando o operador é o solicitante.
  3. Config `chamado.usuarioAbreParaOutros` (padrão `false`): com `true`, USUARIO pode informar `solicitanteId` do mesmo departamento. `GET /usuarios/mesmo-departamento?q=` (`autenticado`) devolve `{id, nome}`.
- **Pronto quando:**
  - [ ] testes das três regras;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-13.6 — Telas: configurações de acesso
- **Depende de:** T-13.1, T-13.2, T-13.4, T-13.5 · **Paralelo com:** T-13.7
- **Requisitos:** A05, A12, A17, A19, B03
- **Arquivos:** `apps/web/src/routes/_app/admin/{configuracoes.tsx,areas.tsx}`, `apps/web/src/features/config/queries.ts`, `apps/web/src/features/chamados/components/novo-chamado-form.tsx`, `apps/web/src/routes/_app/admin/{configuracoes.test.tsx,areas.test.tsx}`
- **Passos:**
  1. Seção "Acesso": isolar áreas, operador trata o próprio chamado, usuário abre para outros, "Testar LDAP".
  2. Sheet de área: destinos com padrão, módulo de inventário.
  3. Novo chamado: seletor "Para outro colega" para USUARIO quando permitido.
- **Pronto quando:**
  - [ ] `configuracoes.test.tsx` e `areas.test.tsx` com `renderRota` + `apiFalsa` (T-9.16): (a) renderiza com os dados; (b) o submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-13.7 — Telas: áreas geridas
- **Depende de:** T-13.3 · **Paralelo com:** T-13.6
- **Requisitos:** A04
- **Arquivos:** `apps/web/src/routes/_app/areas-geridas.tsx`, `apps/web/src/features/areas-geridas/{queries.ts,components/usuarios-area-table.tsx}`, `apps/web/src/features/chamados/components/visoes-pane.tsx`, `apps/web/src/routes/_app/admin/usuarios.tsx`, `apps/web/src/routes/_app/areas-geridas.test.tsx`
- **Passos:**
  1. Visão "Áreas geridas".
  2. Página com os usuários da área e edição de telefone, departamento e ativo.
  3. Campo "Áreas geridas" no Sheet de usuário.
- **Pronto quando:**
  - [ ] `areas-geridas.test.tsx` com `renderRota` + `apiFalsa` (T-9.16): (a) renderiza com os dados; (b) o submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P
