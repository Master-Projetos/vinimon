> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 17 — (Fase 2) API pública, inventário completo, avatar e LGPD

### T-17.1 — Tokens de API: modelo e gestão
- **Depende de:** MVP · **Paralelo com:** T-17.4
- **Requisitos:** H01; S132–S138
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/{permissoes.ts,modulos/tokens.ts}`, `apps/api/src/modules/tokens/{service.ts,routes.ts,tokens.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. Model `TokenApi {id, usuarioId, nome VarChar(80), prefixo VarChar(12) @unique, tokenHash Char(64) @unique, escopos String[], expiraEm, ultimoUsoEm?, ultimoIp?, criadoEm, revogadoEm?}`.
  2. Permissão nova `tokenApi.gerenciarProprios` para OPERADOR (e ADMIN). Escopos `chamados:ler`, `chamados:escrever`, `comentarios:escrever`.
  3. `POST /tokens {nome, escopos, diasValidade 1–365, padrão 90}`: devolve `vnm_` + 32 bytes em base62 **uma vez**.
  4. `GET /tokens` (próprios); `DELETE /tokens/:id` (próprio, ou qualquer um com `sessao.revogarQualquer`). Auditoria `token.criado` e `token.revogado`.
- **Pronto quando:**
  - [ ] o banco só guarda o hash;
  - [ ] USUARIO recebe 403;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-17.2 — Autenticação Bearer
- **Depende de:** T-17.1 · **Paralelo com:** T-17.4
- **Requisitos:** S23, S132–S138; T63
- **Arquivos:** `apps/api/src/plugins/{autenticacao.ts,seguranca.ts}`, `apps/api/src/lib/{token-api.ts,sessao.ts}`, `apps/api/src/app.ts`, `apps/api/src/modules/chamados/routes.ts`, `apps/api/test/token-api.test.ts`
- **Passos:**
  1. `Authorization: Bearer vnm_…`: carrega pelo hash; ativo, não revogado, não expirado e dono ativo; `req.usuario` é o dono com `req.tokenApi = {id, escopos}`.
  2. `FastifyContextConfig.tokenApi?: 'chamados:ler'|'chamados:escrever'|'comentarios:escrever'`. Rota sem esse campo, chamada com token, dá 403. Em uso: `POST /chamados`, `GET /chamados`, `GET /chamados/:id`, `POST /chamados/:id/assentamentos` e `POST /chamados/:id/anexos`.
  3. CSRF e Origin são pulados só quando há `req.tokenApi`.
  4. Rate limit com chave `t:<id>` e 60/min. Canal "API" quando quem cria é token. `ultimoUsoEm`/`ultimoIp` gravados no máximo a cada 60 s.
  5. Escopo por rota: `GET /chamados` e `GET /chamados/:id` → `chamados:ler`; `POST /chamados` → `chamados:escrever`; `POST /chamados/:id/assentamentos` e `POST /chamados/:id/anexos` → `comentarios:escrever` (`interno=true` só se o dono passar em `podeVerInterno`).
  6. `req.usuario = { ...dono, estado: 'ATIVA', sessaoId: null }` (`sessaoId: string | null` em `UsuarioSessao`); se `dono.deveTrocarSenha` ou (`exigeMfa(dono.perfil)` e `mfaAtivadoEm === null`), responde 401 `NAO_AUTENTICADO`.
  7. `revogarTokensDoUsuario(tx, usuarioId, motivo)` em `lib/token-api.ts` (`updateMany { revogadoEm: now }` + auditoria `token.revogado`), chamada na mesma transação de toda chamada a `revogarSessoesDoUsuario`. Nesta tarefa, acrescentar essa chamada nos pontos das T-2.8 (troca de senha / encerrar sessões), T-3.11 (redefinir senha, resetar 2FA, desativar) e T-3.12 (anonimizar), e também na T-12.4 (redefinição por link); os arquivos desses pontos (`apps/api/src/modules/{auth,usuarios}/service.ts`) entram como exceção ao limite de arquivos.
- **Pronto quando:**
  - [ ] T63 completo (expirado, revogado, escopo errado, `/auth/*`, `/tokens`, dono desativado);
  - [ ] após `POST /usuarios/:id/redefinir-senha`, `/resetar-2fa` ou `/anonimizar`, o token do alvo dá 401;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-17.3 — Tela: tokens de API
- **Depende de:** T-17.2 · **Paralelo com:** T-17.7
- **Requisitos:** H01
- **Arquivos:** `apps/web/src/routes/_app/perfil/tokens.tsx`, `apps/web/src/features/tokens/{queries.ts,components/token-criado-dialog.tsx}`, `apps/web/src/routes/_app/perfil/{route.tsx,tokens.test.tsx}`
- **Passos:**
  1. Lista, criação (escopos, validade) e diálogo de exibição única com copiar.
  2. Link para a documentação OpenAPI, só em dev.
- **Pronto quando:**
  - [ ] `tokens.test.tsx` (inclui: o token criado aparece uma única vez no diálogo) com `renderRota` + `apiFalsa` (T-9.16): (a) renderiza com os dados; (b) o submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-17.4 — Inventário: fabricantes, modelos e campos de aquisição
- **Depende de:** MVP · **Paralelo com:** T-17.1, T-17.2
- **Requisitos:** I03, I04
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/{fabricantes.ts,modelos-ativo.ts,ativos.ts}`, `apps/api/src/modules/{fabricantes,modelos-ativo}/{service.ts,routes.ts}`, `apps/api/src/modules/ativos/service.ts`
- **Passos:**
  1. Models `Fabricante {id, nome @unique, ativo}` e `ModeloAtivo {id, tipoId, fabricanteId?, nome, ativo, @@unique([tipoId, nome])}`.
  2. `Ativo` ganha `modeloId?`, `partNumber?`, `valor Decimal(12,2)?`, `notaFiscal?`, `fornecedor?`, `dataCompra Date?`, `garantiaMeses Int?`, `tipoGarantia?` e `destaque Boolean`.
  3. `TipoAtivo` ganha `podeSerComponente` e `podeTerComponentes`.
  4. Testes no padrão de cadastro.
- **Pronto quando:**
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-17.5 — Inventário: movimentações e composição
- **Depende de:** T-17.4 · **Paralelo com:** T-17.6
- **Requisitos:** I05, I06
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `apps/api/src/modules/ativos/{service.ts,routes.ts,movimentos.test.ts}`, `packages/shared/src/modulos/ativos.ts`
- **Passos:**
  1. Model `AtivoMovimento {id, ativoId, deDepartamentoId?, paraDepartamentoId?, deResponsavelId?, paraResponsavelId?, autorId, criadoEm}`, gravado a cada troca.
  2. `Ativo.paiId?`: pai precisa `podeTerComponentes` e filho `podeSerComponente`; sem ciclo; mover o pai move os filhos (na mesma transação, com movimento para cada um).
  3. Filtro `departamentoAnteriorId`.
  4. `GET /ativos/:id/movimentos` e `/componentes`.
- **Pronto quando:**
  - [ ] mover o pai move dois filhos e gera três movimentos;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-17.6 — Inventário: garantias, documentos e relatórios
- **Depende de:** T-17.4, T-12.1 · **Paralelo com:** T-17.5
- **Requisitos:** I07, I08, I09
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `apps/api/src/modules/ativos/{documentos.ts,routes.ts}`, `apps/api/src/jobs/{garantias-aviso.ts,anexos-orfaos.ts,index.ts}`, `apps/api/src/modules/relatorios/inventario.ts`, `packages/shared/src/modulos/notificacoes.ts`, `apps/api/src/modules/notificacoes/service.ts`, `packages/shared/src/enums.ts`, `apps/api/src/lib/enums-check.ts` (`TipoNotificacao.GARANTIA`), `apps/api/test/inventario-f2.test.ts`
- **Passos:**
  1. `Anexo` não muda. Criar `model DocumentoAtivo { id String @id @db.Uuid; ativoId Int; nomeOriginal String; mime String; tamanho Int; sha256 String @db.Char(64); autorId Int; criadoEm DateTime @default(now()) @@map("documentos_ativo") }`, reutilizando `armazenamento.ts` e `tipo-arquivo.ts`. Upload `POST /ativos/:id/documentos` pelo mesmo pipeline (`inventario.gerenciar`). O job `anexos-orfaos` (T-7.9) passa a consultar `anexos` e `documentos_ativo`.
  2. Config `inventario.garantiaAvisoDias` (padrão 30). Job às `0 7 * * *`: notificação GARANTIA (novo tipo) a quem tem `inventario.ver`, deduplicada por `grupoChave garantia:<ativoId>:<vencimento>`. Migração: `notificacoes.chamado_id` anulável e `ativo_id Int?` com FK, com CHECK `num_nonnulls(chamado_id, ativo_id) = 1`. `NotificacaoDTOSchema`: `chamado: {id, assunto} | null`, `ativo: {id, etiqueta} | null`. Em `GET /notificacoes`, o `where` vira `OR: [{ chamado: escopoChamados(u), ...regraInterno }, { chamadoId: null, ativoId: { not: null }, ...(temPermissao(u.perfil,'inventario.ver') ? {} : { id: -1 }) }]`.
  3. Relatórios de inventário: por tipo, departamento e situação, garantias a vencer e top modelos.
- **Pronto quando:**
  - [ ] o anexo de ativo segue S63–S70 (o escopo é `inventario.ver`);
  - [ ] o aviso é emitido uma vez;
  - [ ] o aviso de garantia aparece no feed de quem tem `inventario.ver` e não aparece para USUARIO;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-17.7 — Telas: inventário completo
- **Depende de:** T-17.5, T-17.6 · **Paralelo com:** T-17.3, T-17.8
- **Requisitos:** I03–I09
- **Arquivos:** `apps/web/src/routes/_app/admin/{fabricantes.tsx,modelos-ativo.tsx}`, `apps/web/src/features/{fabricantes,modelos-ativo}/queries.ts`, `apps/web/src/features/inventario/components/{ativo-sheet.tsx,movimentos-timeline.tsx,componentes-tab.tsx,documentos-tab.tsx}`, `apps/web/src/routes/_app/admin/{fabricantes.test.tsx,modelos-ativo.test.tsx}`
- **Passos:** admin de fabricantes e modelos; Sheet com os campos novos; abas Movimentações, Componentes, Aquisição e garantia e Documentos.
- **Pronto quando:**
  - [ ] `fabricantes.test.tsx` e `modelos-ativo.test.tsx` com `renderRota` + `apiFalsa` (T-9.16): (a) renderiza com os dados; (b) o submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-17.8 — Avatar e exportação dos dados pessoais
- **Depende de:** MVP · **Paralelo com:** T-17.7
- **Requisitos:** S124; foto de avatar
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `apps/api/src/modules/me/{avatar.ts,exportar.ts,routes.ts,me-f2.test.ts}`, `apps/web/src/features/perfil/components/avatar-upload.tsx`, `apps/web/src/components/display/user-avatar.tsx`
- **Passos:**
  1. `Usuario.avatarChave?`. `PUT /me/avatar` (multipart, 1 arquivo de até 1 MiB, só png, jpeg ou webp detectado) e `DELETE`. `GET /usuarios/:id/avatar` (`autenticado`) com `Cache-Control: private, max-age=300`; só responde 200 se `alvo.id === u.id`, ou `temPermissao(u.perfil,'chamado.atender')`, ou o alvo é OPERADOR/ADMIN (mesma regra de `podeVerPresenca`). Nos demais casos, 404, igual a 'sem avatar'.
  2. `GET /me/exportar` (1 por hora): JSON com perfil, chamados próprios (dados públicos), comentários próprios e preferências.
- **Pronto quando:**
  - [ ] SVG dá 415;
  - [ ] USUARIO pedindo o avatar de outro USUARIO recebe 404;
  - [ ] o segundo pedido de exportação na mesma hora dá 429;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M
