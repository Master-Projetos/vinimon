> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 14 — (Fase 2) Abertura avançada

### T-14.1 — Categorias de tipos de problema
- **Depende de:** MVP · **Paralelo com:** T-14.2, T-14.5
- **Requisitos:** B07
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/{config.ts,modulos/categorias.ts,modulos/problemas.ts}`, `apps/api/src/modules/categorias/{service.ts,routes.ts,categorias.test.ts}`, `apps/api/src/modules/problemas/service.ts`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato), `packages/shared/src/modulos/meta.ts`, `apps/api/src/modules/meta/service.ts`, `apps/web/src/features/problemas/problemas.test.tsx`
- **Passos:**
  1. Model `Categoria {id, grupo SmallInt (1–3, CHECK), nome, ativo, @@unique([grupo, nome])}`. `Problema.categoria1Id?`, `categoria2Id?` e `categoria3Id?`, cada um com FK e CHECK de grupo via trigger simples ou validação no service: categoria`N` precisa ter `grupo=N`.
  2. Config `abertura.rotulosCategorias` (`string[3]`, padrão "Categoria 1..3") e `abertura.preFiltros` (`int[]` ⊂ {1,2,3}, padrão `[]`).
  3. CRUD `/categorias` (`cadastro.gerenciar`). `meta` inclui categorias e pré-filtros.
- **Pronto quando:**
  - [ ] categoria de grupo errado no problema dá 422;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-14.2 — Campos personalizados: definição
- **Depende de:** MVP · **Paralelo com:** T-14.1, T-14.5
- **Requisitos:** B11
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/{modulos/campos-personalizados.ts,campos.ts,campos.test.ts,enums.ts}`, `apps/api/src/lib/enums-check.ts` (enums `TipoCampo` e `VisibilidadeCampo`), `apps/api/src/modules/campos-personalizados/{service.ts,routes.ts,campos.test.ts}`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Models:
     - `CampoPersonalizado {id, chave VarChar(60) @unique (^[a-z][a-z0-9_]{1,59}$), rotulo, tipo TipoCampo (TEXTO|NUMERO|SELECAO|SELECAO_MULTIPLA|DATA|HORA|DATA_HORA|AREA_TEXTO|CHECKBOX), opcoes String[], obrigatorio, regex VarChar(100)?, ajuda VarChar(300)?, visibilidade VisibilidadeCampo (ABERTURA|SO_EDICAO|OCULTO_SOLICITANTE), ordem, ativo}`;
     - `CampoProblema {campoId, problemaId, obrigatorio Boolean?, @@id}`;
     - `ChamadoCampoValor {chamadoId, campoId, valorTexto Text?, valorNumero Decimal(18,4)?, valorData Timestamptz?, valorOpcoes String[], @@id}`.
  2. Shared `schemaDosCampos(campos, etapa: 'abertura'|'edicao')` monta um `z.strictObject` por `chave` com a regra de cada tipo. A regex é aplicada com `new RegExp(regex, 'u')` só em valores com até 500 caracteres; uma regex inválida na definição dá 400.
  3. CRUD `/campos-personalizados` (`cadastro.gerenciar`) e `GET /campos-personalizados/aplicaveis?problemaId=` (`autenticado`; USUARIO não recebe OCULTO_SOLICITANTE).
- **Pronto quando:**
  - [ ] testes de `schemaDosCampos` por tipo;
  - [ ] seleção sem opções dá 400;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-14.3 — Campos personalizados: valores no chamado
- **Depende de:** T-14.2 · **Paralelo com:** T-14.4
- **Requisitos:** B11, C22
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração (enum), `packages/shared/src/{modulos/chamados.ts,enums.ts}`, `apps/api/src/lib/enums-check.ts`, `apps/api/src/modules/chamados/{service.ts,acoes.ts,consultas.ts,routes.ts,campos-valores.test.ts}`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. `CriarChamadoSchema.campos?: z.record(z.string(), z.unknown())`, validado no service com `schemaDosCampos`.
  2. `PUT /chamados/:id/campos {versao, campos}` (`podeAtender`).
  3. Novo `TipoEvento` CAMPOS_ALTERADOS com `{chave, de, para}` em cada mudança.
  4. Filtro de lista `campo.<chave>` (igual, faixa `de`/`ate` para número, data e data/hora; fora AREA_TEXTO e CHECKBOX).
  5. O detalhe mostra os valores conforme a visibilidade.
- **Pronto quando:**
  - [ ] obrigatório ausente dá 400 no campo `campos.<chave>`;
  - [ ] a alteração gera evento;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-14.4 — Formulários de abertura e obrigatoriedade por etapa
- **Depende de:** T-14.3 · **Paralelo com:** —
- **Requisitos:** B09, B10
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/formularios.ts`, `apps/api/src/modules/formularios/{service.ts,routes.ts,formularios.test.ts}`, `apps/api/src/modules/chamados/{service.ts,acoes.ts}`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Model `FormularioAbertura {id, nome @unique, padrao Boolean, regras Json}` com `regras` validado por Zod:
     - `{campos: Record<'departamento'|'ativo'|'contato'|'telefone'|'contatoEmail'|'prioridade'|'anexo'|'tags', {visivel, obrigatorio}>, obrigatoriosConclusao: string[]}`;
     - exatamente um padrão.
  2. `Problema.formularioId?`.
  3. Abrir aplica as regras: anexo obrigatório leva o chamado a nascer com o flag `anexoPendente` e o front envia o anexo antes de liberar; a regra é conferida no `POST anexos`. **Decisão:** anexo obrigatório é validado no front e marcado no evento CRIADO; a API não bloqueia (o upload é posterior à criação).
  4. Concluir exige os campos em `obrigatoriosConclusao` (422).
- **Pronto quando:**
  - [ ] a conclusão sem o campo obrigatório dá 422;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-14.5 — Filtro de tags E/OU/NÃO
- **Depende de:** MVP · **Paralelo com:** T-14.1, T-14.2
- **Requisitos:** B14
- **Arquivos:** `packages/shared/src/modulos/chamados.ts`, `apps/api/src/modules/chamados/{consultas.ts,tags-filtro.test.ts}`
- **Passos:**
  1. `ChamadoFiltros` ganha `tagIdsAlguma` e `tagIdsNenhuma`, além do `tagIds` (todas).
  2. Prisma: `{ tags: { some: { tagId: { in: alguma } } } }` e `{ tags: { none: { tagId: { in: nenhuma } } } }`, combinados no `AND`.
  3. USUARIO com filtro de tag dá 403.
- **Pronto quando:**
  - [ ] as três combinações na fixture;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-14.6 — Telas: categorias e formulários
- **Depende de:** T-14.1, T-14.4 · **Paralelo com:** T-14.7
- **Requisitos:** B07, B09, B10
- **Arquivos:** `apps/web/src/routes/_app/admin/{categorias.tsx,formularios.tsx,problemas.tsx}`, `apps/web/src/features/{categorias,formularios}/queries.ts`, `apps/web/src/features/chamados/components/novo-chamado-form.tsx`, `apps/web/src/routes/_app/admin/{categorias.test.tsx,formularios.test.tsx}`
- **Passos:**
  1. Admin de categorias e de formulários (matriz campo × visível/obrigatório).
  2. Problema: categorias e formulário.
  3. Novo chamado: pré-filtros em cadeia antes do tipo e regras do formulário aplicadas.
- **Pronto quando:**
  - [ ] `categorias.test.tsx` e `formularios.test.tsx` com `renderRota` + `apiFalsa` (T-9.16): (a) renderiza com os dados; (b) o submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-14.7 — Telas: campos personalizados
- **Depende de:** T-14.3 · **Paralelo com:** T-14.6
- **Requisitos:** B11
- **Arquivos:** `apps/web/src/routes/_app/admin/campos.tsx`, `apps/web/src/features/campos-personalizados/{queries.ts,components/opcoes-editor.tsx,components/campo-personalizado-input.tsx}`, `apps/web/src/features/chamados/components/{novo-chamado-form.tsx,chamado-detalhes.tsx}`
- **Passos:**
  1. Editor com prévia ao vivo; `OpcoesEditor` (adicionar, remover, subir, descer).
  2. `CampoPersonalizadoInput` por tipo.
  3. "Informações adicionais" na abertura e na aba Detalhes, com edição pela equipe.
- **Pronto quando:**
  - [ ] o campo criado aparece no novo chamado do tipo vinculado;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-14.8 — Telas: filtros de tags e de campos na lista
- **Depende de:** T-14.5, T-14.3 · **Paralelo com:** T-14.6, T-14.7
- **Requisitos:** B11, B14
- **Arquivos:** `apps/web/src/features/chamados/{filtros.ts,components/filtro-tags.tsx,components/filtro-campos.tsx}`, `apps/web/src/routes/_app/chamados/route.tsx`
- **Passos:** filtro de tags com modos "todas / alguma / nenhuma" e filtros de campos personalizados (faixas), na URL.
- **Pronto quando:**
  - [ ] recarregar mantém os filtros;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P
