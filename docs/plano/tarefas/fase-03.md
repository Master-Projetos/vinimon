> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 3 — Usuários, cadastros, config, auditoria e meta

### T-3.1 — Fábricas de teste
- **Depende de:** T-2.2 · **Paralelo com:** T-3.2–T-3.10
- **Requisitos:** §7 (`ajudantes.ts`)
- **Arquivos:** `apps/api/test/fabricas.ts`, `apps/api/test/fabricas.test.ts`
- **Passos:**
  1. `semearBase()` roda `seedBase(prisma-tx, {catalogos:true})` e devolve `{ statusPorPapel: Record<PapelStatus, number>, prioridadePadraoId, canalWebId, canalTelefoneId, jornada24x7Id, jornadaComercialId, unidadeId }`.
  2. `criarDepartamento()`, `criarProblema({ areaIds, areaPadraoId?, slaRespostaMin?, slaSolucaoMin? })`, `criarTipoAtivo()`, `criarAtivo()`.
  3. O `criarChamado` entra na T-4.3.
- **Pronto quando:**
  - [ ] o teste chama cada fábrica duas vezes sem colisão de nomes;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.2 — Unidades
- **Depende de:** T-1.10 · **Paralelo com:** T-3.3–T-3.10
- **Requisitos:** S54, S55, S87; padrão de cadastro
- **Arquivos:** padrão de cadastro com `<m>=unidades` (7 arquivos)
- **Passos:**
  1. Campos `{nome: zNome(), endereco?: z.string().max(300).nullable(), ativo}`.
  2. Lista com `busca` e `ativo`. Acesso `cadastro.gerenciar`.
  3. Excluir unidade com departamento dá 409 `REGISTRO_EM_USO`.
- **Pronto quando:**
  - [ ] testes do padrão + 409 em uso;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.3 — Departamentos
- **Depende de:** T-3.2 · **Paralelo com:** T-3.4–T-3.10
- **Requisitos:** padrão de cadastro; A06
- **Arquivos:** padrão de cadastro com `<m>=departamentos`
- **Passos:**
  1. Campos `{unidadeId, nome, ativo}`, com unique `(unidadeId, nome)`.
  2. Filtro `unidadeId`. A resposta inclui `unidade:{id,nome}`.
- **Pronto quando:**
  - [ ] o mesmo nome em outra unidade é aceito; na mesma unidade dá 409;
  - [ ] `unidadeId` inexistente dá 422 `REFERENCIA_INVALIDA`;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.4 — Prioridades
- **Depende de:** T-1.10 · **Paralelo com:** T-3.2, T-3.3, T-3.5–T-3.10
- **Requisitos:** C03; S56 (cor)
- **Arquivos:** padrão de cadastro com `<m>=prioridades`
- **Passos:**
  1. Campos `{nome, cor: zCor(), ordem: z.int().min(0).max(1000), padrao, slaRespostaMin, slaSolucaoMin (z.int().positive().nullable()), ativo}`.
  2. Na transação:
     - `padrao=true` grava `padrao=false` nas demais;
     - desmarcar a única padrão dá 422 "Defina outra prioridade como padrão.";
     - inativar a padrão dá 422.
  3. Ordenação padrão por `ordem`.
- **Pronto quando:**
  - [ ] sempre existe exatamente uma padrão (teste);
  - [ ] cor `#fff` dá 400;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.5 — Status
- **Depende de:** T-1.10 · **Paralelo com:** T-3.2–T-3.4, T-3.6–T-3.10
- **Requisitos:** C01, C02; §4.1, §4.3 (`ck_status_*`)
- **Arquivos:** padrão de cadastro com `<m>=status`
- **Passos:**
  1. Campos `{nome, tipo, papel: z.enum(PAPEIS_STATUS).nullable(), cor, pausaSla, ignorado, ordem, ativo}`.
  2. `refine` no Zod com a tabela papel→tipo do CHECK `ck_status_papel` e `pausaSla` obrigatório em CONCLUIDO/ENCERRADO.
  3. Regras:
     - mudar `tipo` de status usado por chamado dá 422 "Status em uso: o tipo não pode mudar.";
     - status com papel não pode ser excluído nem inativado (422);
     - papel duplicado dá 409 (unique).
- **Pronto quando:**
  - [ ] testes das três regras;
  - [ ] papel INICIAL com tipo PENDENTE dá 400;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.6 — Tipos de problema
- **Depende de:** T-1.10 · **Paralelo com:** T-3.2–T-3.5, T-3.7–T-3.10
- **Requisitos:** B04, B05; §3.5 (abrir)
- **Arquivos:** padrão de cadastro com `<m>=problemas`
- **Passos:**
  1. Campos `{nome, descricao?: ≤500, areaIds: z.array(zId()).min(1).max(20), areaPadraoId, slaRespostaMin, slaSolucaoMin, ativo}`.
  2. `refine` exige `areaPadraoId ∈ areaIds`.
  3. Service:
     - grava `ProblemaArea` (substitui todas no update, dentro da transação);
     - todas as áreas precisam ter `atende=true` (senão 422).
  4. A resposta inclui `areas:[{id,nome}]`.
  5. Excluir em uso dá 409.
- **Pronto quando:**
  - [ ] padrão fora da lista dá 400;
  - [ ] área que não atende dá 422;
  - [ ] o update troca as áreas;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.7 — Canais
- **Depende de:** T-1.10 · **Paralelo com:** T-3.2–T-3.6, T-3.8–T-3.10
- **Requisitos:** B12
- **Arquivos:** padrão de cadastro com `<m>=canais`
- **Passos:**
  1. Campos `{nome, ativo}`; `sistema` só leitura.
  2. Canal `sistema=true` não pode ser excluído, renomeado nem inativado (422).
- **Pronto quando:**
  - [ ] teste da regra;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.8 — Tags
- **Depende de:** T-1.10 · **Paralelo com:** T-3.2–T-3.7, T-3.9, T-3.10
- **Requisitos:** B13; `ck_tags_nome`
- **Arquivos:** padrão de cadastro com `<m>=tags`
- **Passos:**
  1. Campos `{nome: zTag(), ativo}`.
  2. O service grava `nomeNormalizado = nome.trim().toLowerCase()`. "Rede" e "rede" dão 409.
  3. Exportar `garantirTags(tx, nomes): Promise<number[]>` para a T-5.8.
- **Pronto quando:**
  - [ ] teste de duplicata com maiúsculas;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.9 — Tipos de ativo
- **Depende de:** T-1.10 · **Paralelo com:** T-3.2–T-3.8, T-3.10
- **Requisitos:** I01
- **Arquivos:** padrão de cadastro com `<m>=tipos-ativo` (contrato `tiposAtivoApi`)
- **Passos:** campos `{nome, ativo}`; em uso dá 409.
- **Pronto quando:**
  - [ ] testes do padrão;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.10 — Categorias de artigo
- **Depende de:** T-1.10 · **Paralelo com:** T-3.2–T-3.9
- **Requisitos:** F01
- **Arquivos:** padrão de cadastro com `<m>=categorias-artigo` (contrato `categoriasArtigoApi`)
- **Passos:** campos `{nome, ordem, ativo}`; ordenação por `ordem`.
- **Pronto quando:**
  - [ ] testes do padrão;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.11 — Usuários: CRUD e busca
- **Depende de:** T-3.3, T-2.8 · **Paralelo com:** —
- **Requisitos:** S14, S20, S48, S51, S55, S87; A01, A02; T12, T39 (parte)
- **Arquivos:** `packages/shared/src/{modulos/usuarios.ts,index.ts}`, `apps/api/src/modules/usuarios/{schemas.ts,service.ts,routes.ts,usuarios.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. Criar com body `{login, nome, email?, telefone?, perfil, areaId?, areaSecundariaIds: ≤20, departamentoId?, ativo}`. Uma senha temporária de 16 caracteres é gerada e devolvida **uma vez** em `{usuario, senhaTemporaria}`, com `deveTrocarSenha=true`.
  2. Regras:
     - OPERADOR exige `areaId` de área que atende (422); ADMIN aceita `areaId` nulo;
     - login e e-mail normalizados.
  3. PATCH, numa transação:
     - si mesmo não pode mudar `perfil` nem `ativo` (409);
     - rebaixar ou desativar o último ADMIN ativo dá 409, com contagem dentro da transação;
     - mudança de `perfil`, `areaId`, áreas secundárias ou `ativo=false` → `revogarSessoesDoUsuario(tx, id, ativo?'perfil_alterado':'usuario_desativado')`;
     - depois do commit: `desconectarSessoes` + `tempoReal.revalidarUsuario(id)`;
     - auditoria `usuario.alterado` com `{antes, depois}`, sem campos sensíveis.
  4. `GET /usuarios/busca?q=` (`usuario.buscar`, 2–50 caracteres, ≤ 20 resultados): `{id, nome, areaNome}`, mais `login` só para ADMIN. Filtro `buscaNorm contains escaparLike(normalizado)`, só ativos.
  5. `GET /usuarios` e `/:id` exigem `usuario.gerenciar`.
- **Pronto quando:**
  - [ ] T12 (criar "Admin" com "admin" existente dá 409);
  - [ ] T39;
  - [ ] mudança de perfil derruba as sessões do alvo;
  - [ ] OPERADOR na busca não vê `login`;
  - [ ] `pnpm verificar`.
- **Nota (Fase 2):** a partir da T-17.2, toda chamada a `revogarSessoesDoUsuario` desta tarefa passa a ser acompanhada de `revogarTokensDoUsuario` na mesma transação.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-3.12 — Usuários: ações administrativas e anonimização
- **Depende de:** T-3.11 · **Paralelo com:** T-3.13
- **Requisitos:** S16, S20, S31, S40, S122; T21
- **Arquivos:** `packages/shared/src/modulos/usuarios.ts`, `apps/api/src/modules/usuarios/{acoes.ts,routes.ts,acoes.test.ts}`
- **Passos:**
  1. `POST /usuarios/:id/redefinir-senha` → `{senhaTemporaria}`: `deveTrocarSenha`, revoga todas as sessões, audita `senha.redefinida`.
  2. `POST /usuarios/:id/resetar-2fa {senhaAdmin}`: confere a senha do ator (senão 400), limpa `totp*`, `mfaAtivadoEm` e os códigos, revoga as sessões do alvo, audita `mfa.removido`.
  3. `POST /usuarios/:id/encerrar-sessoes`.
  4. `POST /usuarios/:id/desbloquear-login`: `deleteMany falhaLogin {loginNormalizado}`.
  5. `POST /usuarios/:id/anonimizar` (S122):
     - `nome='Usuário anonimizado #<id>'`, `email=null`, `telefone=null`, `login='anon<id>'`;
     - `senhaHash=null`, `ativo=false`, `anonimizadoEm`;
     - revoga as sessões e audita;
     - na mesma transação: `chamado.updateMany({ where: { solicitanteId: id }, data: { contato: 'Usuário anonimizado #<id>', contatoEmail: null, telefone: null } })` e `$executeRaw` `UPDATE assentamentos SET texto = regexp_replace(texto, '@\[[^\]]*\]\(usuario:' || ${id} || '\)', '@[Usuário anonimizado #' || ${id} || '](usuario:' || ${id} || ')', 'g') WHERE texto LIKE '%(usuario:' || ${id} || ')%'`. A auditoria não guarda o nome antigo.
- **Pronto quando:**
  - [ ] T21 (reset, desativação e perfil derrubam; reativar não revive);
  - [ ] o anonimizado não aparece na busca, e os chamados dele continuam;
  - [ ] após anonimizar, nenhuma coluna de `chamados` nem `assentamentos` contém o nome ou o e-mail antigos;
  - [ ] `pnpm verificar`.
- **Nota (Fase 2):** a partir da T-17.2, toda chamada a `revogarSessoesDoUsuario` desta tarefa passa a ser acompanhada de `revogarTokensDoUsuario` na mesma transação.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-3.13 — Configurações
- **Depende de:** T-1.10 · **Paralelo com:** T-3.12, T-3.14
- **Requisitos:** S87; §7 (`config.ts`)
- **Arquivos:** `packages/shared/src/{modulos/config.ts,index.ts}`, `apps/api/src/modules/config/{service.ts,routes.ts,config.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `GET /config` → `Config` (`config.gerenciar`).
  2. `PATCH /config` com body `AtualizarConfigSchema`:
     - `upsert` de cada chave enviada na transação;
     - `sla.jornadaPadraoId` precisa existir e estar ativa (422);
     - auditoria `config.alterada` com `{antes, depois}` só das chaves alteradas;
     - depois do commit: `invalidarConfig()`.
- **Pronto quando:**
  - [ ] chave desconhecida dá 400;
  - [ ] valor fora da faixa dá 400;
  - [ ] o GET reflete o PATCH;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.14 — Auditoria (consulta)
- **Depende de:** T-1.10 · **Paralelo com:** T-3.12, T-3.13
- **Requisitos:** S86, S89; T50 (imutabilidade)
- **Arquivos:** `packages/shared/src/{modulos/auditoria.ts,index.ts}`, `apps/api/src/modules/auditoria/{service.ts,routes.ts,auditoria.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `GET /auditoria?atorId=&acao=&entidade=&entidadeId=&de=&ate=&pagina=` (`auditoria.ver`).
  2. Período de até 366 dias (S58); padrão: últimos 30 dias. Ordem `criadoEm desc, id desc`. A resposta inclui `ator:{id,nome}|null`.
- **Pronto quando:**
  - [ ] T50: `UPDATE`/`DELETE` via `$executeRaw` lançam erro; o cadastro grava `atorId`, `ip` e `requestId`;
  - [ ] período de 400 dias dá 400;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-3.15 — Meta e Me
- **Depende de:** T-3.2–T-3.10, T-3.13 · **Paralelo com:** —
- **Requisitos:** S54, S55; T37; §3.6 (Me, Meta)
- **Arquivos:** `packages/shared/src/{modulos/meta.ts,modulos/me.ts,index.ts}`, `apps/api/src/modules/{meta,me}/{service.ts,routes.ts}`, `apps/api/src/app.ts`, `apps/api/test/meta-me.test.ts`
- **Passos:**
  1. `GET /meta` (`autenticado`), só itens ativos e projeções enxutas:
     - áreas `{id,nome,atende}`, prioridades `{id,nome,cor,ordem,padrao}`, status `{id,nome,tipo,papel,cor,ignorado}`;
     - problemas `{id,nome,descricao,areaPadraoId,areaIds}`, canais, departamentos `{id,nome,unidadeId}`, unidades, tipos de ativo, jornadas `{id,nome}`, categorias;
     - `config`: só as `CHAVES_CONFIG_PUBLICAS`;
     - `tags` só se `chamado.atender`.
  2. `PATCH /me` com body `z.strictObject({nome?, email?, telefone?, tema?, densidade?, enviarComEnter?})`. E-mail duplicado dá 409.
- **Pronto quando:**
  - [ ] T37 (`{perfil:'ADMIN'}` dá 400);
  - [ ] USUARIO recebe `meta` sem `tags`;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M
