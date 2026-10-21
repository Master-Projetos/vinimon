> Parte A (fundamentos), §3. Decisão fechada: não reabrir. Índice e regras de leitura em `docs/plano/README.md`.

## 3. Arquitetura

### 3.1 Árvore do monorepo

```
vinimon/
├─ .github/workflows/ci.yml
├─ .gitignore  .nvmrc  biome.json  package.json  pnpm-workspace.yaml  pnpm-lock.yaml
├─ tsconfig.base.json  renovate.json  docker-compose.yml  CLAUDE.md  README.md  SECURITY.md
├─ docker/postgres/init/01-banco-teste.sql
├─ docs/plano/                       # este plano: README.md, fundamentos/ (Parte A), tarefas/ (Parte B), relatorios/
├─ legado/v1/                        # server.js, db.js, public/, iniciar.bat (movidos com git mv; só referência)
├─ scripts/backup.sh  scripts/teste-restauracao.sh  scripts/papeis-postgres.sql
├─ packages/shared/
│  ├─ package.json  tsconfig.json  vitest.config.ts
│  └─ src/
│     ├─ index.ts  http.ts  zod.ts  permissoes.ts  enums.ts  config.ts  limites.ts  senha.ts
│     ├─ busca.ts  mencoes.ts  sla.ts  realtime.ts  notificacoes.ts  csv.ts
│     └─ modulos/  auth.ts me.ts meta.ts usuarios.ts areas.ts unidades.ts departamentos.ts prioridades.ts
│                  status.ts problemas.ts canais.ts tags.ts jornadas.ts feriados.ts tipos-ativo.ts
│                  categorias-artigo.ts config.ts auditoria.ts chamados.ts assentamentos.ts anexos.ts
│                  notificacoes.ts busca.ts painel.ts relatorios.ts artigos.ts ativos.ts presenca.ts
├─ apps/api/
│  ├─ package.json  tsconfig.json  tsdown.config.ts  vitest.config.ts  prisma.config.ts  .env.example
│  ├─ prisma/  schema.prisma  migrations/  seed.ts  seed-dev.ts
│  ├─ scripts/ cli.ts (usuario:redefinir-senha, totp:codigo [só dev])  importar-v1/ (ler.ts validar.ts transformar.ts arquivos.ts gravar.ts index.ts)
│  ├─ storage/                       # gitignored (UPLOAD_DIR de dev)
│  ├─ src/
│  │  ├─ server.ts  app.ts  env.ts
│  │  ├─ generated/prisma/           # gitignored (prisma generate)
│  │  ├─ lib/       prisma.ts erros.ts paginacao.ts like.ts contexto.ts auditoria.ts config.ts senha.ts
│  │  │             forca-senha.ts sessao.ts cripto.ts totp.ts tempo-real.ts filas.ts armazenamento.ts
│  │  │             tipo-arquivo.ts enums-check.ts
│  │  ├─ plugins/   erros.ts autenticacao.ts seguranca.ts docs.ts spa.ts
│  │  ├─ autorizacao/chamados.ts      # ÚNICA fonte de escopo e políticas de chamado
│  │  ├─ modules/   saude/ seguranca/ auth/ me/ meta/ usuarios/ areas/ unidades/ departamentos/ prioridades/
│  │  │             status/ problemas/ canais/ tags/ jornadas/ feriados/ tipos-ativo/ categorias-artigo/
│  │  │             config/ auditoria/ chamados/ sla/ assentamentos/ mencoes/ leituras/ anexos/ seguidores/
│  │  │             notificacoes/ busca/ painel/ relatorios/ artigos/ ativos/ presenca/
│  │  │             (cada um: schemas.ts service.ts routes.ts <m>.test.ts; chamados/ também acoes.ts eventos.ts)
│  │  ├─ realtime/  plugin.ts handshake.ts salas.ts handlers.ts presenca.ts limites.ts
│  │  └─ jobs/      index.ts chamados-retorno-agendados.ts chamados-auto-aprovacao.ts sla-alertas.ts
│  │                sla-recalcular-jornada.ts eventos-varrer.ts sessoes-limpeza.ts notificacoes-limpeza.ts
│  │                anexos-orfaos.ts auditoria-purga.ts
│  └─ test/  constantes.ts global-setup.ts setup.ts ajudantes.ts fabricas.ts socket.ts
└─ apps/web/        (árvore detalhada na seção 6.6)
```

### 3.2 Fluxo de requisição

1. **Navegador → Caddy** (TLS e compressão). O Caddy repassa para `127.0.0.1:3000`, inclusive o upgrade de WebSocket.
2. **Fastify `onRequest`** (escopo `/api/v1`):
   - gera o `requestId` (uuid);
   - o `autenticacaoPlugin` carrega a sessão pelo cookie, rejeita cookie e Bearer juntos (400) e põe `usuarioId` no logger;
   - o `segurancaPlugin` confere Origin/Sec-Fetch-Site e o `X-CSRF-Token` nas mutações.
3. **Parse do corpo:** JSON até 1 MiB. `text/plain` foi removido (415). Multipart só é consumido no handler.
4. **`preValidation`:** checagem de acesso *fail-closed*. Rota sem `config.acesso` dá 403. Depois vêm estado da sessão (padrão `ATIVA`) e permissão do perfil.
5. **Validação Zod** de params, querystring e body (`z.strictObject` em todos os bodies).
6. **`preHandler`:** limite de taxa (chave `u:<id>` ou `ip:<ip>`).
7. **Handler** (`routes.ts`) → **service** (`service.ts`):
   - regras e Prisma;
   - escopo de chamado sempre com `AND: [escopoChamados(u), filtros]`;
   - mutações em `$transaction`, retornando os efeitos.
8. **Depois do commit:** `aposCommitChamado()` publica o tempo real, faz o fanout de notificações e enfileira jobs. Erros nessa etapa são só logados.
9. **Serializer Zod da resposta:** descarta campos não declarados. **`onSend`:** cabeçalhos (helmet e Permissions-Policy). **Log** pino com redação.

### 3.3 Convenções HTTP, erros e paginação

- **Caminhos:** kebab-case pt-BR no plural (`/tipos-ativo`, `/chamados/:id/assumir`). JSON em camelCase pt-BR. Datas em ISO-8601 UTC (`zDataHora()`, codec).
- **Respostas:** recurso direto, sem envelope. Criar dá 201 com o recurso; excluir dá 204; ações de chamado devolvem `ChamadoDetalhe`.
- **Formato de erro** (único): `{ "erro": { "codigo": "VALIDACAO", "mensagem": "…", "detalhes": [{ "campo": "nome", "mensagem": "…" }], "requestId": "…" } }`.

| Status | Códigos |
|---|---|
| 400 | `VALIDACAO`, `REQUISICAO_INVALIDA` |
| 401 | `NAO_AUTENTICADO` |
| 403 | `SEM_PERMISSAO`, `ORIGEM_INVALIDA`, `CSRF_INVALIDO`, `MFA_PENDENTE`, `TROCA_SENHA_OBRIGATORIA` |
| 404 | `NAO_ENCONTRADO`, `ROTA_INEXISTENTE` |
| 409 | `CONFLITO` (P2002, P2034, versão; P2039/P2010 com `originalCode` 23P01), `REGISTRO_EM_USO` (P2003 em DELETE) |
| 413 | `ARQUIVO_GRANDE` |
| 415 | `TIPO_ARQUIVO_INVALIDO`, `CONTEUDO_NAO_SUPORTADO` |
| 422 | `REGRA_NEGOCIO`, `REFERENCIA_INVALIDA` (P2003 fora de DELETE), `VALIDACAO` (P2039/P2010 com `originalCode` 23514, CHECK) |
| 429 | `MUITAS_TENTATIVAS` |
| 503 | `INDISPONIVEL` |
| 500 | `INTERNO` (sem stack nem SQL) |

- **Erros do Postgres via driver adapter** (`plugins/erros.ts`, §7): o P2002 não traz `meta.target`. A causa vem de `erro.meta.driverAdapterError.cause`:
  - P2002 → 409 `CONFLITO` com `detalhes = [{ campo, mensagem: 'Já existe um registro com este valor.' }]`, em que `campo = CAMPO_POR_INDICE[cause.constraint.index]`; sem campo mapeado, `detalhes = []`. `CAMPO_POR_INDICE` é um `Record<string, string>` exportado de `lib/erros.ts` (ex.: `{ areas_nome_key: 'nome', usuarios_login_key: 'login', usuarios_email_key: 'email' }`), e cada tarefa de cadastro com unique acrescenta a sua linha;
  - P2039 (queries do client) e P2010 (`$queryRaw`/`$executeRaw`) decidem por `cause.originalCode`: '23P01' (EXCLUDE) → 409, '23514' (CHECK) → 422 `VALIDACAO`.
- **Paginação offset:** `pagina` de 1 a 10.000; `porPagina` de 1 a 100, padrão 25. Resposta `{ itens, total, pagina, porPagina }`, sempre com desempate por `id`.
- **Cursor:**
  - timeline do chamado: `?antesDe=<id>&limite=50` → `{ itens, proximoCursor }`;
  - notificações: cursor opaco `base64url("<atualizadoEmISO>|<id>")`, `limite` ≤ 50.
- **Exportação CSV:** stream de até 5.000 linhas, auditada, com neutralização de fórmulas.

### 3.4 Padrão de módulo (receita obrigatória)

1. `packages/shared/src/modulos/<m>.ts`: schemas, tipos e `<m>Api` com `contrato(...)`. Acrescentar a linha no `index.ts`.
2. `apps/api/src/modules/<m>/schemas.ts`: reexporta o contrato e define `select<Entidade>` com `satisfies Prisma.XSelect`.
3. `service.ts`: único lugar com `prisma`. Listas usam `paginar` + `$transaction([findMany, count])`. Mutações de cadastro usam `$transaction` com `auditar()`. Chamados usam `escopoChamados`.
4. `routes.ts`: `app.route` a partir do contrato, com `schema` completo (`tags`, `summary`, params, querystring, body e `response`) e `config.acesso`.
5. Registro em `app.ts`, dentro do escopo `/api/v1`, em ordem alfabética.
6. `<m>.test.ts`: no mínimo 401, 403, 400 com `detalhes`, caminho feliz, 404 e 409.
7. `pnpm verificar` verde.

O código canônico completo (áreas) está na seção 7.

### 3.5 Autorização: permissões, escopo e políticas

**Camada 1: rota.** `config: { acesso: 'publico' | 'autenticado' | Permissao, estados?: EstadoSessao[] }`. Rota sem `acesso` dá 403 e o teste T41 percorre todas. As permissões por perfil estão em `packages/shared/src/permissoes.ts` (seção 7):
- **USUARIO:** `chamado.abrir`, `chamado.comentar`, `anexo.enviar`, `painel.ver`.
- **OPERADOR:** tudo do USUARIO, mais `chamado.abrirEmNome`, `chamado.verArea`, `chamado.verInterno`, `chamado.atender`, `relatorio.ver`, `inventario.ver`, `inventario.gerenciar`, `conhecimento.verInterno`, `conhecimento.gerenciar`, `usuario.buscar`.
- **ADMIN:** todas, inclusive `chamado.verTodos`, `cadastro.gerenciar`, `usuario.gerenciar`, `config.gerenciar`, `auditoria.ver`, `sessao.revogarQualquer`.

**Camada 2: escopo de dados.** Fonte única em `apps/api/src/autorizacao/chamados.ts`:

```ts
import { temPermissao } from '@vinimon/shared'
import type { Prisma } from '../generated/prisma/client'
import type { UsuarioSessao } from '../lib/sessao'

export interface ChamadoEscopo { areaId: number; operadorId: number | null; solicitanteId: number }

/** SEMPRE combinar com AND: [escopoChamados(u), filtros]. Nunca espalhar no mesmo objeto. */
export function escopoChamados(u: UsuarioSessao): Prisma.ChamadoWhereInput {
  if (temPermissao(u.perfil, 'chamado.verTodos')) return {}
  if (temPermissao(u.perfil, 'chamado.verArea')) {
    return { OR: [{ areaId: { in: u.areaIds } }, { operadorId: u.id }, { solicitanteId: u.id }] }
  }
  return { solicitanteId: u.id }
}

export function podeVerChamado(u: UsuarioSessao, c: ChamadoEscopo): boolean {
  if (temPermissao(u.perfil, 'chamado.verTodos')) return true
  if (c.solicitanteId === u.id) return true
  if (!temPermissao(u.perfil, 'chamado.verArea')) return false
  return u.areaIds.includes(c.areaId) || c.operadorId === u.id
}

/** Conteúdo interno nunca é visto pelo solicitante, qualquer que seja o perfil (corrige F10 da v1). */
export function podeVerInterno(u: UsuarioSessao, c: ChamadoEscopo): boolean {
  return temPermissao(u.perfil, 'chamado.verInterno') && c.solicitanteId !== u.id && podeVerChamado(u, c)
}

/** Atuar como atendente: operador da área do chamado, responsável atual ou admin. */
export function podeAtender(u: UsuarioSessao, c: ChamadoEscopo): boolean {
  if (!temPermissao(u.perfil, 'chamado.atender')) return false
  return temPermissao(u.perfil, 'chamado.verTodos') || u.areaIds.includes(c.areaId) || c.operadorId === u.id
}
```

- Fora do escopo, a resposta é **404**, igual à de recurso inexistente.
- O **403** fica para recurso visível com ação proibida.
- **Filtros em lote** (fanout, mencionáveis, salas de socket): carregar os usuários candidatos numa query (com `areasSecundarias`) e aplicar `podeVerChamado` em memória. Não existe versão SQL do escopo.
- **Equivalência:** `escopoChamados` (Prisma) e `podeVerChamado` (TS) devolvem o mesmo conjunto. `apps/api/test/escopo-equivalencia.test.ts` (T-5.11) compara os dois para cada ator, e toda tarefa que amplia `ChamadoEscopo` estende a fixture desse teste e o mantém verde.

**Camada 3: ações e ciclo de vida.** Os papéis de status (`Status.papel`) definem para onde cada ação leva. Cada ação é uma rota própria.

| Ação | Quem pode | Tipo do status atual | Efeito |
|---|---|---|---|
| abrir `POST /chamados` | `chamado.abrir`; em nome de outro exige `chamado.abrirEmNome` (alvo ativo; OPERADOR não escolhe ADMIN) | — | Status papel INICIAL. **Área:** USUARIO não escolhe e recebe a `areaPadraoId` do problema; operador escolhe entre as áreas do problema. **Canal:** USUARIO fica com "Sistema Web" fixo; operador escolhe, com padrão "Telefone" se abre em nome de outro e "Sistema Web" se não. **Prioridade:** a padrão quando vazia. Grava snapshot de SLA e jornada, `abertoPorId`, seguidores (solicitante e abertoPor), evento CRIADO, notificação NOVO_NA_FILA à área e, se aberto em nome de outro, auditoria `chamado.abertoEmNome` |
| assumir | `podeAtender` | ABERTO, EM_ATENDIMENTO, PENDENTE | `operadorId = eu`. Se o tipo era ABERTO, vai para o papel EM_ATENDIMENTO. Se havia outro responsável, exige `confirmarTroca: true` (sem ele, 409) e notifica o anterior. Marca a 1ª resposta. Comentário opcional |
| encaminhar | `podeAtender` | ABERTO, EM_ATENDIMENTO, PENDENTE | Área destino ativa com `atende`. Operador destino opcional: ativo, OPERADOR ou ADMIN, com a área destino entre as dele. Com operador vai para o papel ENCAMINHADO; sem operador, papel INICIAL com `operadorId = null`. Jornada da nova área (recálculo). 1ª resposta conforme a configuração. Chama `revalidarChamado` |
| status | `podeAtender` | ABERTO, EM_ATENDIMENTO, PENDENTE | Destino com tipo ABERTO, EM_ATENDIMENTO ou PENDENTE. ABERTO limpa o operador. AGENDADO, CONCLUIDO e ENCERRADO só pelas ações próprias |
| prioridade | `podeAtender` | não CONCLUIDO/ENCERRADO | Novo snapshot de SLA quando o problema não define a meta |
| classificar `{problemaId?, departamentoId?, ativoId?, canalId?}` | `podeAtender` | não ENCERRADO | Novo problema: se a área atual não está entre as dele, a área vira a `areaPadraoId` (e `revalidarChamado`). Recálculo de SLA |
| tags `PUT {tags: string[]}` | `podeAtender` | qualquer | Cria tags que faltam (≤ 30 caracteres), evento TAGS_ALTERADAS com `interno: true`. Não grava comentário de sistema (exceção ao padrão das demais ações). O solicitante nunca vê tags |
| agendar `{para, operadorId?}` | `podeAtender` | ABERTO, EM_ATENDIMENTO, PENDENTE, AGENDADO | `para` entre agora + 1 min e agora + 365 dias. Papel AGENDADO, `agendadoPara` |
| concluir `{solucao, descricaoTecnica?}` | `podeAtender` | ABERTO, EM_ATENDIMENTO, PENDENTE, AGENDADO | `operadorId ??= eu`. Vai **direto para o papel ENCERRADO** se `chamado.prazoValidacaoDias = 0`, se o solicitante é o ator ou se o solicitante é o operador. Senão vai para o papel CONCLUIDO, com `validacaoLimiteEm` e notificação AVALIACAO_PENDENTE (não pode ser marcada como lida à mão) |
| aprovar `{nota, comentario?}` | só o solicitante | CONCLUIDO | Papel ENCERRADO, `AvaliacaoChamado` com `automatica = false`, AVALIACAO_RECEBIDA ao operador; a pendente é marcada como lida |
| rejeitar `{motivo}` | só o solicitante | CONCLUIDO | O motivo vira comentário público. Papel EM_ATENDIMENTO, mantendo o operador; se ele estiver inativo, papel INICIAL com `operadorId = null`. `concluidoEm = null`, `rejeicoes + 1`, notificação REJEITADO |
| reabrir `{justificativa}` | solicitante, último operador ou ADMIN | ENCERRADO não cancelado | Exige `permitirReabertura` e prazo dentro de `prazoReaberturaDias` (0 = sem limite). Papel EM_ATENDIMENTO se o operador está ativo, senão INICIAL. Limpa as datas e apaga a avaliação; a avaliação anterior fica em `dados` do evento |
| cancelar `{motivo}` | solicitante (tipo ABERTO e sem operador) ou `podeAtender` (não CONCLUIDO/ENCERRADO) | — | Papel CANCELADO, `cancelado = true`, `concluidoEm = encerradoEm = agora`. Sem avaliação. Fora dos indicadores de SLA e de avaliação |
| comentar | `podeVerChamado`. Solicitante: não CONCLUIDO/ENCERRADO. Equipe: não ENCERRADO | — | Comentário interno exige `podeVerInterno`. Comentário do solicitante com o papel AGUARDANDO_SOLICITANTE leva ao papel EM_ATENDIMENTO |
| anexar | igual a comentar, mais `anexo.enviar` e `anexos.habilitados` | — | Anexo interno exige `podeVerInterno` (`interno=true` sem ela → 403 antes de ler as partes). Com `assentamentoId`: precisa existir com o mesmo `chamadoId` da rota, `autorId === u.id` e `criadoEm` ≥ agora − 10 min (senão 422 `REGRA_NEGOCIO`); o anexo herda o `interno` do assentamento e o campo enviado é ignorado |
| job retorno de agendados | sistema | AGENDADO com `agendadoPara ≤ agora` | Papel EM_ATENDIMENTO se há operador, senão INICIAL. Comentário de sistema e notificação |
| job auto-aprovação | sistema | CONCLUIDO com `validacaoLimiteEm ≤ agora` | Papel ENCERRADO, avaliação `chamado.avaliacaoAutomatica` com `automatica = true`, comentário "Atendimento validado automaticamente por decurso de prazo" |

- **Primeira resposta (C11):** gravada uma única vez, por quem tem `chamado.atender` e não é o solicitante, em: assumir, comentário **público**, troca de status ou concluir.
  - Encaminhar e agendar seguem `chamado.primeiraRespostaAoEncaminhar`: SEMPRE, NUNCA ou ESCOLHA, com padrão ESCOLHA (caixa "Marcar como primeira resposta", marcada por padrão).
  - Comentário interno não conta.
- **Concorrência:** toda ação recebe `versao` no body e faz `updateMany({ where: { id, versao } })`. Se `count === 0`, a resposta é 409 "O chamado foi alterado por outra pessoa. Recarregue."
- **Status ignorado (C02):** some de listas, painel, relatórios e busca, salvo filtro explícito por esse status ou busca pelo número.

### 3.6 Catálogo de rotas do MVP (prefixo `/api/v1`)

| Área | Rotas (acesso) |
|---|---|
| Saúde | `GET /saude`, `GET /saude/pronto` (publico); `POST /seguranca/csp` (publico, `csrf:false`, corpo ≤ 8 KB) |
| Auth | `POST /auth/login` (publico); `GET /auth/sessao`, `POST /auth/logout` (autenticado, todos os estados); `POST /auth/2fa/verificar` (estado PENDENTE_MFA); `POST /auth/2fa/iniciar`, `POST /auth/2fa/confirmar` (CADASTRO_MFA, ATIVA); `POST /auth/trocar-senha` (TROCA_SENHA, ATIVA); `POST /auth/2fa/codigos {senha}`; `POST /auth/2fa/desativar {senha,codigo}` (só USUARIO); `GET /auth/sessoes`; `DELETE /auth/sessoes/:id`; `POST /auth/sessoes/encerrar-todas` |
| Me | `PATCH /me {nome?,email?,telefone?,tema?,densidade?,enviarComEnter?}`; `PUT /me/presenca {estado,ate}`; `GET/PUT /me/preferencias-notificacao` (autenticado) |
| Meta | `GET /meta` (autenticado): áreas, prioridades, status, problemas (com áreas), canais, departamentos, unidades, tipos de ativo, jornadas `{id,nome}`, categorias, config pública; tags só para a equipe |
| Usuários | `GET /usuarios/busca?q=` (`usuario.buscar`, q de 2 a 50 caracteres, até 20 resultados, `{id,nome,areaNome}`; `login` só para ADMIN); `GET/POST/PATCH /usuarios[/:id]`; `POST /usuarios/:id/redefinir-senha`, `/resetar-2fa {senhaAdmin}`, `/encerrar-sessoes`, `/desbloquear-login` (`usuario.gerenciar`) |
| Cadastros | CRUD `GET/POST/PATCH/DELETE` de `/areas`, `/unidades`, `/departamentos`, `/prioridades`, `/status`, `/problemas`, `/canais`, `/tags`, `/jornadas` (com horários no body), `/feriados`, `/tipos-ativo`, `/categorias-artigo` (`cadastro.gerenciar`) |
| Config e auditoria | `GET /config`, `PATCH /config` (`config.gerenciar`); `GET /auditoria` (`auditoria.ver`) |
| Chamados | `GET /chamados` (`chamado.abrir`; query `ChamadoFiltros`); `GET /chamados/contagens` (30/min por usuário: `config.rateLimit: { max: 30, timeWindow: '1 minute' }`); `GET /chamados/exportar` (`relatorio.ver`; `text/csv`); `POST /chamados`; `GET /chamados/:id`; `GET /chamados/:id/historico`; `GET /chamados/reincidencia?ativoId=&problemaId=`; `POST /chamados/:id/{assumir,encaminhar,status,prioridade,classificacao,agendar,concluir,aprovar,rejeitar,reabrir,cancelar}`; `PUT /chamados/:id/tags`; `PUT/DELETE /chamados/:id/seguir` |
| Conversa | `GET /chamados/:id/assentamentos?antesDe=&limite=`; `POST /chamados/:id/assentamentos {texto,interno,clienteId}` → `{assentamento, mencoesIgnoradas}`; `GET /chamados/:id/mencionaveis?q=&interno=`; `POST /chamados/:id/leitura {assentamentoId}`; `GET /chamados/:id/leituras` |
| Anexos | `GET /chamados/:id/anexos`; `POST /chamados/:id/anexos` (multipart: `arquivo` de 1 a 5, campos `interno`, `assentamentoId`); `GET /anexos/:id` (download); `DELETE /anexos/:id` (só ADMIN, auditado) |
| Notificações | `GET /notificacoes?filtro=todas|nao_lidas|mencoes|atribuicoes|sla&cursor=&limite=`; `GET /notificacoes/contagem`; `POST /notificacoes/:id/lida`; `POST /notificacoes/:id/nao-lida`; `POST /notificacoes/lidas {chamadoId?}` |
| Busca | `GET /busca?q=&limite=5` (60/min por usuário) |
| Painel e relatórios | `GET /painel?periodo=7|30|90&areaId=&modoArea=destino|origem` (`painel.ver`); `GET /relatorios/:tipo?de=&ate=&areaId=&operadorId=` e `GET /relatorios/:tipo/csv` (`relatorio.ver`) |
| Conhecimento | `GET /artigos`, `GET /artigos/sugestoes?q=&problemaId=`, `GET /artigos/:id` (autenticado; USUARIO só vê PUBLICADO + PUBLICO); `POST/PATCH/DELETE /artigos[/:id]` (`conhecimento.gerenciar`); `POST /artigos/:id/voto {util}` |
| Inventário | `GET /ativos/busca?q=` (autenticado, ≥ 3 caracteres, `{id,etiqueta,tipo}`); `GET /ativos`, `GET /ativos/:id`, `GET /ativos/:id/chamados` (`inventario.ver`); `POST/PATCH /ativos[/:id]` (`inventario.gerenciar`); `DELETE /ativos/:id` (`cadastro.gerenciar`, só sem chamados) |

`ChamadoFiltros` (shared) tem os campos:
- `visao` ∈ `minha-fila`, `fila-aberta`, `minha-area`, `agendados`, `abertos-por-mim`, `aguardando-validacao`, `encerrados`, `todos`;
- `busca`;
- listas de ids (`zListaIds`): `statusIds`, `prioridadeIds`, `areaIds`, `problemaIds`, `operadorIds` (0 = sem operador), `canalIds`, `tagIds` ("contém todas"; sem `chamado.atender` → 403 `SEM_PERMISSAO`), `departamentoIds`;
- `solicitanteId`;
- `sla` ∈ NO_PRAZO, EM_RISCO, ESTOURADO;
- `avaliacao[]`, `teveRejeicao`;
- `de`/`ate` (abertura, `z.iso.date()`; sem `visao`, o padrão é os últimos 90 dias), `concluidoDe`/`concluidoAte`;
- `ordem` ∈ id, abertoEm, prioridade, ultimaAtividade, prazoSolucao; `direcao`; `pagina`; `porPagina`.

Regras de `visao` no servidor (todas dentro do escopo):

| Visão | Filtro |
|---|---|
| fila-aberta | tipo ABERTO nas minhas áreas; ordem prioridade desc, depois abertura asc |
| minha-fila | operador = eu, tipo EM_ATENDIMENTO ou PENDENTE |
| agendados | tipo AGENDADO e operador = eu |
| minha-area | não encerrados das minhas áreas |
| abertos-por-mim | solicitante = eu |
| aguardando-validacao | solicitante = eu e tipo CONCLUIDO |

### 3.7 Tempo real (Socket.IO 4.8.4)

- O plugin `realtime/plugin.ts` é registrado no `buildApp` e se liga ao `app.server`.
- Servidor: `path '/socket.io'`, `serveClient:false`, `transports:['websocket']`, `maxHttpBufferSize:16_384`, `pingInterval:25000`, `pingTimeout:20000`, sem `cors` e sem `connectionStateRecovery`.
- `allowRequest`: Origin precisa ser igual a `APP_ORIGIN`, e no máximo 30 conexões por minuto por IP. O IP vem de `@fastify/proxy-addr`, com o mesmo `TRUST_PROXY`.

```ts
// realtime/plugin.ts — trecho obrigatório do handshake
io.use(async (socket, proximo) => {
  try {
    const cookies = app.parseCookie(socket.handshake.headers.cookie ?? '')
    const usuario = await carregarSessao(cookies[NOME_COOKIE], { tocar: false }) // heartbeat não estende a sessão
    if (!usuario || usuario.estado !== 'ATIVA') return proximo(erroRt('NAO_AUTENTICADO'))
    if ((io.of('/').adapter.rooms.get(salaUsuario(usuario.id))?.size ?? 0) >= 10) return proximo(erroRt('LIMITE_CONEXOES'))
    socket.data.usuario = usuario
    proximo()
  } catch (err) {
    app.log.error({ err }, 'falha no handshake do socket')
    proximo(erroRt('ERRO_INTERNO'))
  }
})
// erroRt(codigo) = Object.assign(new Error(codigo), { data: { codigo } })
```

**Salas** (só o servidor coloca sockets em salas):
- `usuario:<id>` e `sessao:<sessaoId>`;
- `area:<id>` para OPERADOR, em cada uma das suas `areaIds`;
- `admins`;
- `chamado:<id>`, só depois de `chamado:entrar` com `podeVerChamado`;
- `chamado:<id>:interno`, só com `podeVerInterno`;
- `presenca:<uid>`, só depois de `presenca:assinar`, que passa por `podeVerPresenca`.

**Eventos** (`packages/shared/src/realtime.ts`, payloads validados com Zod; evento desconhecido é ignorado):

| Direção | Evento | Payload | Regras |
|---|---|---|---|
| C→S | `chamado:entrar` | `{chamadoId}` + ack `{ok:true}`/`{ok:false, erro:'INDISPONIVEL'\|'LIMITE_SALAS'\|'RATE_LIMIT'\|'INVALIDO'}` | Recarrega o usuário e o chamado. Inexistente e sem acesso dão o mesmo erro. Máximo de 20 salas de chamado. 30/min |
| C→S | `chamado:sair` | `{chamadoId}` | 60/min |
| C→S | `chamado:digitando` | `{chamadoId, interno:boolean, digitando:boolean}` | Exige a sala; com `interno`, exige a sala interna. `true`: 1 a cada 2 s por chamado (excedente descartado em silêncio). `false`: 30/min |
| C→S | `presenca:atividade` | `{ativo:boolean}` | Só quando o valor muda. 20/min |
| C→S | `presenca:assinar` | `{usuarioIds:number[≤200]}` + ack `{ok, presencas:[{usuarioId,estado,ultimoVistoEm?}]}` | Substitui as assinaturas anteriores. `ultimoVistoEm` só para a equipe. 20/min |
| S→C | `assentamento:novo` | `{chamadoId, assentamento: AssentamentoDTO}` | Interno só para `chamado:<id>:interno`; público para `chamado:<id>` |
| S→C | `chamado:atualizado` | `{chamadoId, campos: ('status'\|'prioridade'\|'area'\|'operador'\|'agendamento'\|'anexos'\|'tags'\|'classificacao'\|'avaliacao')[]}` | Só invalida cache. Nunca é emitido por comentário. Evento com `interno=true` (TAGS_ALTERADAS, anexo interno) só vai para `chamado:<id>:interno` |
| S→C | `chamado:digitando` | `{chamadoId, usuario:{id,nome}, interno, digitando}` | `.volatile`; interno só para a sala interna |
| S→C | `chamado:leitura` | `{chamadoId, usuarioId, ultimoAssentamentoId, lidoEm}` | A sala interna recebe o valor real. Os demais recebem o maior id **público** ≤ valor (`io.to(sala).except(salaInterna)`) |
| S→C | `chamado:acessoRevogado` | `{chamadoId}` | Depois de `revalidarChamado` |
| S→C | `fila:atualizada` | `{chamadoId, motivo:'criado'\|'atribuido'\|'status'\|'encaminhado'\|'prioridade'}` | Para `area:<id>`, `admins`, o solicitante e o operador. Só com esses motivos; nunca por evento com `interno=true`. O cliente invalida `chamadoChaves.listas()` com debounce de 1 s e `chamadoChaves.contagens()` com throttle de 10 s, sempre com `refetchType: 'active'` |
| S→C | `presenca:mudou` | `{usuarioId, estado:'DISPONIVEL'\|'OCUPADO'\|'AUSENTE'\|'OFFLINE'}` | `.volatile`, sem horário e sem IP |
| S→C | `presenca:propria` | `{estado, manual:'OCUPADO'\|'AUSENTE'\|null, ate:string\|null}` | Para `usuario:<id>` |
| S→C | `notificacao:nova` | `{notificacao: NotificacaoDTO, naoLidas}` | Só para `usuario:<id>`, sem texto do usuário |
| S→C | `notificacao:contagem` | `{naoLidas}` | — |
| S→C | `sessao:encerrada` | `{motivo:'logout'\|'revogada'\|'expirada'\|'usuario_desativado'}` | Emitido antes de `disconnectSockets(true)` |

**Limites:**
- 120 pacotes a cada 10 s por socket; acima disso, `disconnect(true)`;
- 20 violações em 60 s resultam em `disconnect`;
- máximo de 10 sockets por usuário.

**Revalidação e revogação:**
- A cada `SOCKET_REVALIDAR_MS` (60 s), os `sessaoId` dos sockets locais são conferidos numa query só, e os inválidos recebem `disconnect(true)`.
- A porta `lib/tempo-real.ts` expõe `encerrarSessao`, `encerrarSessoesDoUsuario`, `revalidarUsuario` e `revalidarChamado`.
  - São chamados depois do commit em: logout, troca e reset de senha, desativação, mudança de perfil ou área, alteração de 2FA, encaminhar e classificar.
  - `revalidarChamado` faz `fetchSockets()` nas duas salas do chamado e tira quem perdeu acesso.
- Ao desconectar (`disconnecting`), o servidor emite `digitando:false` nas salas do socket.

**Presença:**
- O estado é calculado por `calcularEstado(conexoes, manual, agora)`:
  - sem conexão → OFFLINE;
  - manual vigente → o manual;
  - alguma conexão ativa → DISPONIVEL;
  - senão → AUSENTE.
- O cliente considera "ativo" quando a aba está visível e houve input há menos de 5 min.
- O manual (`OCUPADO` ou `AUSENTE`, com `ate` de até 7 dias ou `null`) fica em `presencas_usuarios`. `ultimoVistoEm` é gravado no último disconnect e, durante atividade, no máximo a cada 5 min.
- Privacidade: `podeVerPresenca(obs, alvo) = obs.perfil !== 'USUARIO' || alvo.perfil !== 'USUARIO'`. A equipe vê todos; o usuário vê só a equipe.
- OCUPADO suprime notificações na área de trabalho, exceto MENCAO e SLA.

### 3.8 Notificações, seguidores e feed de Atividade

- **Outbox e histórico:**
  - Toda ação grava `ChamadoEvento` na mesma transação. O evento serve de histórico (C22), de fonte do feed e de outbox (`processadoEm`).
  - `aposCommitChamado({chamadoId, eventoIds, assentamentoIds, campos, acessoMudou, fila})`:
    1. emite os assentamentos;
    2. emite `chamado:atualizado` e `fila:atualizada` (evento com `interno=true` só emite `chamado:atualizado` para a sala interna e nunca chama `emitirFila`);
    3. chama `revalidarChamado` se `acessoMudou`;
    4. executa `await fanout.processar(id)` para cada evento.
  - O job `eventos-varrer` reprocessa, a cada minuto, eventos com `processadoEm IS NULL` criados há mais de 1 min.
- **Seguidores automáticos:**
  - solicitante (`SOLICITANTE`), quem abriu em nome de outro (`ABRIU`), operador atribuído (`ATRIBUIDO`);
  - quem comenta (`COMENTOU`; isso limpa `silenciadoEm`) e quem é mencionado (`MENCIONADO`).
  - Deixar de seguir grava `silenciadoEm`. MENCAO, ATRIBUIDO e AVALIACAO_PENDENTE ignoram o silenciamento.
- **Regras evento → notificação** (o ator fica sempre de fora, assim como inativos e quem não vê o chamado; evento interno só vai para quem passa em `podeVerInterno`):

| Evento | Destinatário → tipo | `grupoChave` |
|---|---|---|
| CRIADO | operadores da área → NOVO_NA_FILA; solicitante, quando aberto em nome dele → ATUALIZACAO | `novo:<eventoId>` / `atualizacao:<chamadoId>` |
| COMENTARIO | seguidores não silenciados (menos os mencionados) → COMENTARIO; mencionados → MENCAO | `comentario:<chamadoId>` / `mencao:<eventoId>` |
| ASSUMIDO / ENCAMINHADO com operador | novo operador → ATRIBUIDO; demais seguidores → ATUALIZACAO | `atribuido:<eventoId>` / `atualizacao:<chamadoId>` |
| ENCAMINHADO sem operador | operadores da nova área → NOVO_NA_FILA; seguidores → ATUALIZACAO | `novo:<eventoId>` |
| STATUS_ALTERADO, AGENDADO, RETORNO_AGENDAMENTO, REABERTO, CANCELADO | seguidores → STATUS | `status:<chamadoId>` |
| CONCLUIDO | solicitante → AVALIACAO_PENDENTE (ou STATUS se encerrou direto); demais → STATUS | `avaliacao:<chamadoId>` |
| APROVADO / AUTO_APROVADO | operador → AVALIACAO_RECEBIDA; demais → STATUS | `avaliacao-recebida:<eventoId>` |
| REJEITADO | operador e operadores da área → REJEITADO | `rejeitado:<eventoId>` |
| PRIORIDADE_ALTERADA, CLASSIFICACAO_ALTERADA, TAGS_ALTERADAS, ANEXO_ADICIONADO | seguidores → ATUALIZACAO (tags só para a equipe) | `atualizacao:<chamadoId>` |
| SLA_RISCO, SLA_ESTOURADO, SLA_RESPOSTA_ESTOURADO | operador; se não houver, os operadores da área → SLA | `sla:<eventoId>` |

- **Fanout com número fixo de queries:**
  1. `UPDATE eventos SET processado_em = now() WHERE id = $1 AND processado_em IS NULL RETURNING *` (claim);
  2. chamado;
  3. candidatos;
  4. usuários candidatos com áreas;
  5. preferências;
  6. upsert agrupado `INSERT … ON CONFLICT (usuario_id, grupo_chave) DO UPDATE SET contagem = contagem + 1, ator_ids = (novo || antigos)[1:10], dados = EXCLUDED.dados, atualizado_em = now()`.
  - Depois do commit: contagem de não lidas por usuário (1 query `groupBy`, com o mesmo `where` do feed: `whereNotificacoesVisiveis(u)` de cada destinatário) e emissão de `notificacao:nova`. Teste de N+1 (T-6.8): com `prisma.$on('query')`, 5 e 50 seguidores executam o mesmo número de queries, no máximo 10.
- **Marcar como lida:** `UPDATE … SET lida_em = now(), grupo_chave = grupo_chave || '#' || id`, o que fecha o grupo. Abrir o chamado (`POST leitura`) marca as notificações dele, exceto AVALIACAO_PENDENTE.
  - Ao encaminhar, depois do commit: `notificacao.updateMany({ where: { chamadoId, usuarioId: { in: perderamAcesso }, lidaEm: null }, data: { lidaEm: agora } })` + `emitirContagem`.
- **Feed (`GET /notificacoes`):** reaplica na leitura `chamado: escopoChamados(u)` e a regra de interno. Esse `where` sai de uma função única, `whereNotificacoesVisiveis(u)`, usada também em `GET /notificacoes/contagem` e na contagem pós-fanout.
  - Sem `chamado.verInterno`: `interno = false`.
  - Com ela: `OR [{interno:false}, {interno:true, chamado:{solicitanteId:{not:u.id}}}]`.
  - O trecho (até 140 caracteres de `textoPlano`) é montado do assentamento, só se ele for visível.
  - Fase 2 (T-17.6): o aviso de garantia não tem chamado (`chamadoId` nulo, `ativoId` preenchido). O `where` vira `OR: [{ chamado: escopoChamados(u), ...regraInterno }, { chamadoId: null, ativoId: { not: null }, ...(temPermissao(u.perfil,'inventario.ver') ? {} : { id: -1 }) }]`.
- **Preferências** (`preferenciaPadrao(tipo, perfil)` em shared; só as diferenças vão para o banco):

| Tipo | In-app | Desktop |
|---|---|---|
| MENCAO, ATRIBUIDO, AVALIACAO_PENDENTE | fixo ligado | ligado |
| NOVO_NA_FILA, COMENTARIO, SLA, REJEITADO | ligado | ligado |
| STATUS, ATUALIZACAO, AVALIACAO_RECEBIDA | ligado | desligado |

  Desligar o in-app desliga o desktop.
- **Desktop:**
  - A permissão só é pedida depois de clique em "Ativar notificações na área de trabalho".
  - A notificação é `new Notification('Chamado #123 · <assunto ≤ 60>', { body: '<Autor> mencionou você' | '<Autor> comentou' | textoNotificacao(n), tag: 'chamado-123', icon: '/icon-192.png' })` e **nunca** leva o texto da mensagem.
  - Dispara só com a aba oculta ou sem foco; com foco vira toast.
  - Deduplicação entre abas: `navigator.locks` e a chave `vinimon:notifs-apresentadas` no storage.

### 3.9 Busca global (Ctrl+K)

- `GET /busca?q=` com q de 2 a 100 caracteres ou `#?\d+`. Até 5 resultados por grupo.
- **Tokens** (`normalizarBusca`/`tokensBusca` em shared): NFD, sem marcas, minúsculas, separação por `[^\p{L}\p{N}]+`, no máximo 8 tokens de 2 a 30 caracteres. Só sobram letras e dígitos, sem curingas.
- **Grupos:**
  - **Chamados:** `findMany({ where: { AND: [escopoChamados(u), status não ignorado, { OR: [{ id: num }, { AND: tokens.map(t => ({ buscaNorm: { contains: t } })) }] }] }, orderBy: { id: 'desc' }, take: 5 })`. O número exato vem primeiro.
  - **Artigos:** `$queryRaw` tagged com `ts_rank_cd(busca, to_tsquery('portuguese', f_unaccent(${tsq})))`, filtrando por situação e visibilidade conforme a permissão.
  - **Ativos e pessoas:** só para a equipe; `buscaNorm contains`.
  - **Ações:** lista estática no cliente.

### 3.10 Jobs (pg-boss 12.38.0, schema `pgboss`, fuso `America/Sao_Paulo`)

```ts
// jobs/index.ts — padrão
export async function iniciarJobs(log: FastifyBaseLogger): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' })
  boss.on('error', (err) => log.error({ err }, 'pg-boss'))
  await boss.start()
  for (const job of JOBS) {
    if (!(await boss.getQueue(job.fila))) await boss.createQueue(job.fila)
    await boss.work<Record<string, unknown>>(job.fila, async (lote) => {
      for (const item of lote) await job.executar(item.data, new Date())
    })
    if (job.cron) await boss.schedule(job.fila, job.cron, null, { tz: 'America/Sao_Paulo' })
  }
  definirFila(boss) // lib/filas.ts: enfileirar(); nos testes, implementação em memória
  return boss
}
```

| Fila | Cron | Função (idempotente: update condicionado ao estado atual) |
|---|---|---|
| `chamados-retorno-agendados` | `* * * * *` | AGENDADO com `agendado_para ≤ now()` → retorno (3.5) |
| `chamados-auto-aprovacao` | `*/5 * * * *` | CONCLUIDO com `validacao_limite_em ≤ now()` → encerra com avaliação automática |
| `sla-alertas` | `*/5 * * * *` | `alerta_solucao_em ≤ now()` com `sla_aviso_risco_em IS NULL` → SLA_RISCO; `prazo_solucao_em < now()` com `sla_aviso_estouro_em IS NULL` → SLA_ESTOURADO; o mesmo para resposta → SLA_RESPOSTA_ESTOURADO (lotes de 500) |
| `sla-recalcular-jornada` | sob demanda `{jornadaId}` | Recalcula chamados com `concluido_em IS NULL` daquela jornada, em lotes de 200 |
| `eventos-varrer` | `* * * * *` | Fanout dos eventos pendentes há mais de 1 min (até 200) |
| `sessoes-limpeza` | `17 * * * *` | Apaga sessões expiradas ou revogadas há mais de 7 dias e `falhas_login` com mais de 24 h |
| `notificacoes-limpeza` | `23 3 * * *` | Apaga notificações lidas há mais de `notificacoes.retencaoDias` dias |
| `anexos-orfaos` | `41 3 * * *` | Remove arquivos em `UPLOAD_DIR` (inclusive `tmp/`) sem linha em `anexos` e com mais de 24 h. Na Fase 2 (T-17.6), também consulta `documentos_ativo`: arquivo com linha em qualquer das duas tabelas fica |
| `auditoria-purga` | `11 4 1 * *` | `SET LOCAL vinimon.purga_auditoria='on'` + delete de registros com mais de 365 dias |

Na Fase 2 entram `email-enviar`, `email-varrer`, `chamados-auto-encerramento-inatividade`, `lembretes-disparar` e `garantias-aviso`. Toda função de job recebe `agora` injetado e é testada chamando a função direto.

### 3.11 Armazenamento de anexos

```ts
// lib/armazenamento.ts
export interface ArmazenamentoAnexos {
  /** Grava o stream em UPLOAD_DIR/tmp/<uuid>, calculando sha256 e tamanho; lança 413 acima do limite. */
  receber(origem: Readable, limiteBytes: number): Promise<{ temporario: string; caminhoLocal: string; tamanho: number; sha256: string }>
  efetivar(temporario: string, chave: string): Promise<void>   // rename atômico para AAAA/MM/<uuid>
  descartar(temporario: string): Promise<void>                 // sempre no finally
  abrirLeitura(chave: string): Readable
  remover(chave: string): Promise<void>
}
export class DiscoLocal implements ArmazenamentoAnexos { /* raiz = env.UPLOAD_DIR; resolve + startsWith(raiz + sep) */ }
```

Pipeline de upload:
1. autorizar antes do stream (S63);
2. `receber`;
3. `fileTypeFromFile(caminhoLocal)` e lista fixa (S66);
4. `efetivar`;
5. inserir `Anexo` (o id uuid é a chave);
6. `finally descartar`.

O download usa `createReadStream` com os cabeçalhos de S70. Na Fase 3, a implementação S3 entra atrás da mesma interface.

### 3.12 Arquivos de ferramenta (conteúdo exato)

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
savePrefix: ''
minimumReleaseAge: 1440
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
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "es2024", "module": "preserve", "moduleResolution": "bundler", "moduleDetection": "force",
    "strict": true, "noUncheckedIndexedAccess": true, "noImplicitOverride": true, "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true, "isolatedModules": true, "resolveJsonModule": true, "skipLibCheck": true, "noEmit": true
  }
}
```

Os tsconfigs de cada pacote:
- `apps/api/tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["es2024"], "types": ["node"] }, "include": ["src", "test", "prisma", "scripts", "*.config.ts"] }`.
- `packages/shared/tsconfig.json`: igual, com `"types": []` e `"include": ["src"]`.
- `apps/web`: modelo do Vite.
  - `tsconfig.json` com `files: []`, `references` para `tsconfig.app.json` e `tsconfig.node.json`, e `compilerOptions.paths {"@/*":["./src/*"]}`.
  - `tsconfig.app.json` com `lib ["ES2024","DOM","DOM.Iterable"]`, `jsx "react-jsx"`, `types ["vite/client"]`, os mesmos `paths` e nenhum `baseUrl`.
  - Typecheck com `tsr generate && tsc -b`: o `tsr generate` (`@tanstack/router-cli`) regenera `src/routeTree.gen.ts` (versionado e ignorado pelo Biome) antes do `tsc`.

```json
// biome.json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!**/generated", "!**/routeTree.gen.ts", "!**/dist", "!**/coverage", "!apps/web/src/components/ui", "!legado", "!scripts/plano"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 120 },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded", "trailingCommas": "all" } },
  "css": { "parser": { "tailwindDirectives": true } },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "useImportType": "error", "noEnum": "error", "noParameterProperties": "error", "noNonNullAssertion": "error",
        "noRestrictedImports": { "level": "error", "options": { "paths": {
          "@prisma/client": "Importe de src/generated/prisma/client.",
          "next-themes": "Use @/components/theme/theme-provider."
        } } }
      },
      "suspicious": { "noExplicitAny": "error", "noConsole": { "level": "error", "options": { "allow": ["error", "warn"] } } },
      "correctness": { "noUnusedImports": "error", "noUnusedVariables": "error", "useExhaustiveDependencies": "error" },
      "security": { "noDangerouslySetInnerHtml": "error" },
      "nursery": { "noFloatingPromises": "warn" }
    }
  },
  "overrides": [
    { "includes": ["apps/api/src/modules/**/routes.ts"], "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error", "options": { "paths": {
      "../../lib/prisma": "routes.ts não acessa o banco: use o service.",
      "@prisma/client": "Importe de src/generated/prisma/client."
    } } } } } } },
    { "includes": ["apps/web/src/**"], "linter": { "rules": { "style": { "noRestrictedGlobals": { "level": "error", "options": { "deniedGlobals": {
      "fetch": "Use chamar() de @/lib/api.", "localStorage": "Use @/lib/storage.", "sessionStorage": "Proibido (S80)."
    } } } } } } },
    { "includes": ["apps/web/src/lib/api.ts", "apps/web/src/lib/storage.ts"], "linter": { "rules": { "style": { "noRestrictedGlobals": "off" } } } },
    { "includes": ["apps/api/prisma/**", "apps/api/scripts/**", "**/*.config.ts", "apps/web/e2e/**"], "linter": { "rules": { "suspicious": { "noConsole": "off" } } } }
  ],
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

```yaml
# docker-compose.yml (só desenvolvimento)
name: vinimon
services:
  postgres:
    image: postgres:18.6-alpine
    environment: { POSTGRES_USER: vinimon, POSTGRES_PASSWORD: vinimon, POSTGRES_DB: vinimon }
    ports: ['127.0.0.1:5432:5432']
    volumes:
      - pgdata:/var/lib/postgresql
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck: { test: ['CMD-SHELL', 'pg_isready -U vinimon -d vinimon'], interval: 5s, timeout: 5s, retries: 10 }
  mailpit:
    image: axllent/mailpit:v1.31
    ports: ['127.0.0.1:1025:1025', '127.0.0.1:8025:8025']
volumes:
  pgdata:
```

O arquivo `docker/postgres/init/01-banco-teste.sql` contém só `CREATE DATABASE vinimon_test OWNER vinimon;`.

```dotenv
# apps/api/.env.example  (copiar para apps/api/.env)
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgresql://vinimon:vinimon@localhost:5432/vinimon
DATABASE_URL_TESTE=postgresql://vinimon:vinimon@localhost:5432/vinimon_test
APP_ORIGIN=http://localhost:5173
TRUST_PROXY=false
# Valores SÓ de desenvolvimento: decodificados contêm "troque" e são recusados com NODE_ENV=production.
CSRF_SECRET=ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDAwMQ==
ENCRYPTION_KEY=ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDE=
UPLOAD_DIR=./storage/anexos
MAX_ANEXO_MB=10
API_DOCS=true
JOBS_HABILITADOS=true
SOCKET_REVALIDAR_MS=60000
# SEED_ADMIN_PASSWORD=   (opcional; 12+ caracteres e força zxcvbn >= 3)
# Produção: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

```ts
// apps/api/prisma.config.ts
import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

if (existsSync('.env')) process.loadEnvFile('.env') // Prisma 7 não lê .env sozinho; o ambiente tem prioridade

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL },
})
```

```ts
// apps/api/tsdown.config.ts
import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: ['src/server.ts'], format: 'esm', platform: 'node', target: 'node24', outDir: 'dist',
  clean: true, sourcemap: true, dts: false, deps: { alwaysBundle: [/^@vinimon\//] },
})
```

```json
// apps/api/package.json (scripts e dependências)
{
  "name": "@vinimon/api", "private": true, "type": "module",
  "scripts": {
    "dev": "prisma generate && tsx watch --clear-screen=false src/server.ts",
    "build": "prisma generate && tsdown",
    "start": "node --enable-source-maps dist/server.mjs",
    "typecheck": "prisma generate && tsc --noEmit",
    "test": "prisma generate && vitest run --passWithNoTests",
    "db:generate": "prisma generate",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "seed:dev": "tsx prisma/seed-dev.ts",
    "cli": "tsx scripts/cli.ts",
    "importar:v1": "tsx scripts/importar-v1/index.ts",
    "db:dev:recriar": "docker compose exec -T postgres psql -U vinimon -d postgres -c 'DROP DATABASE IF EXISTS vinimon WITH (FORCE)' -c 'CREATE DATABASE vinimon OWNER vinimon' && DATABASE_URL=postgresql://vinimon:vinimon@localhost:5432/vinimon prisma migrate deploy",
    "db:teste:recriar": "docker compose exec -T postgres psql -U vinimon -d postgres -c 'DROP DATABASE IF EXISTS vinimon_test WITH (FORCE)' -c 'CREATE DATABASE vinimon_test OWNER vinimon' && DATABASE_URL=postgresql://vinimon:vinimon@localhost:5432/vinimon_test prisma migrate deploy"
  },
  "dependencies": {
    "@fastify/cookie": "11.1.3", "@fastify/helmet": "13.2.0", "@fastify/multipart": "10.1.4", "@fastify/proxy-addr": "5.1.2",
    "@fastify/rate-limit": "11.2.1", "@fastify/static": "10.1.6", "@fastify/swagger": "9.9.2", "@fastify/under-pressure": "9.2.1",
    "@node-rs/argon2": "2.2.2", "@prisma/adapter-pg": "7.10.1", "@prisma/client": "7.10.1", "@scalar/fastify-api-reference": "1.75.0",
    "@zxcvbn-ts/core": "4.2.0", "@zxcvbn-ts/language-common": "4.1.3", "@zxcvbn-ts/language-pt-br": "4.1.1",
    "close-with-grace": "2.5.0", "content-disposition": "3.0.0", "fastify": "5.12.7", "fastify-plugin": "6.0.1",
    "fastify-type-provider-zod": "7.0.0", "file-type": "22.2.0", "luxon": "3.7.2", "otplib": "13.5.0", "pg-boss": "12.38.0",
    "rate-limiter-flexible": "11.2.3", "socket.io": "4.8.4", "zod": "catalog:"
  },
  "devDependencies": {
    "@faker-js/faker": "10.6.0", "@types/luxon": "3.7.6", "@types/node": "catalog:", "@vinimon/shared": "workspace:*",
    "fast-check": "4.10.2", "pino-pretty": "13.2.0", "prisma": "7.10.1", "socket.io-client": "4.8.4", "tsdown": "0.23.1",
    "tsx": "4.23.15", "typescript": "catalog:", "vitest": "catalog:"
  }
}
```

Os demais manifestos:
- `packages/shared/package.json`: `"name":"@vinimon/shared"`, `"type":"module"`, `"sideEffects":false`, `"exports":{".":"./src/index.ts"}`, scripts `typecheck: tsc --noEmit` e `test: vitest run --passWithNoTests`, dependência `zod: catalog:`.
- `apps/web/package.json`: versões da seção 2.2, mais `@vinimon/shared: workspace:*`; scripts `dev: vite`, `build: vite build`, `typecheck: tsr generate && tsc -b`, `test: vitest run --passWithNoTests`, `test:e2e: playwright test`. `@tanstack/router-cli` 1.167.45 entra nas devDependencies (§2.2).

`apps/web/vite.config.ts`:
- `plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()]`, nesta ordem;
- `resolve.alias['@'] = fileURLToPath(new URL('./src', import.meta.url))`;
- `server.proxy`: `{ '/api': 'http://localhost:3000', '/socket.io': { target: 'http://localhost:3000', ws: true } }`, sem `changeOrigin`;
- `build.sourcemap: 'hidden'`.

```yaml
# .github/workflows/ci.yml
name: CI
on: { pull_request: {}, push: { branches: [main, v2] } }
concurrency: { group: 'ci-${{ github.ref }}', cancel-in-progress: true }
permissions: { contents: read }
jobs:
  verificar:
    runs-on: ubuntu-24.04
    timeout-minutes: 25
    services:
      postgres:
        image: postgres:18.6-alpine
        env: { POSTGRES_USER: vinimon, POSTGRES_PASSWORD: vinimon, POSTGRES_DB: vinimon_test }
        ports: ['5432:5432']
        options: --health-cmd "pg_isready -U vinimon -d vinimon_test" --health-interval 5s --health-timeout 5s --health-retries 20
    env: { DATABASE_URL_TESTE: 'postgresql://vinimon:vinimon@localhost:5432/vinimon_test' }
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
      - name: Higiene do repositório (T03)
        # `if …; then exit 1; fi` em vez de `! cmd`: com `bash -e`, um `!` fora da última linha não derruba o passo.
        run: |
          if git ls-files | grep -E '\.(db|db-wal|db-shm|sqlite)$|(^|/)\.env$'; then exit 1; fi
          if git grep -nE '\$queryRawUnsafe|\$executeRawUnsafe|\.innerHTML\s*=|dangerouslySetInnerHTML|data:\s*(req|request)\.body|trustProxy:\s*true|eval\(|new Function\(' -- apps packages ':!apps/web/src/components/ui/**' ':!**/generated/**'; then exit 1; fi
          if git grep -nE 'console\.log' -- apps/api/src ':!**/generated/**'; then exit 1; fi
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --prod --audit-level=high
      - run: pnpm db:generate
      - run: pnpm exec biome ci .
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- `.gitignore`: `node_modules/`, `dist/`, `coverage/`, `playwright-report/`, `test-results/`, `apps/web/e2e/.auth/`, `.vitest/`, `apps/api/src/generated/`, `storage/`, `data/`, `*.db`, `*.db-wal`, `*.db-shm`, `*.sqlite*`, `.env`, `.env.*`, `!.env.example`.
- `renovate.json`: `{"extends":["config:recommended"],"minimumReleaseAge":"3 days","lockFileMaintenance":{"enabled":true,"schedule":["before 6am on the first day of the month"]},"vulnerabilityAlerts":{"enabled":true},"packageRules":[{"matchUpdateTypes":["minor","patch"],"groupName":"{{parentDir}} minor/patch"},{"matchPackageNames":["prisma","@prisma/client","@prisma/adapter-pg"],"allowedVersions":"<8"},{"matchPackageNames":["typescript"],"allowedVersions":"<6.1"},{"matchPackageNames":["@tanstack/react-table"],"allowedVersions":"<9"}]}`.

### 3.13 Deploy

- **Modelo:** um único processo Node (`dist/server.mjs`) com API, SPA (`WEB_DIST_DIR=../web/dist`), Socket.IO e workers do pg-boss. O Caddy faz só TLS e compressão. Windows Server: NSSM para o Node e o serviço do Caddy.
- **Release:** `git pull && pnpm install --frozen-lockfile && pnpm build && DATABASE_URL=<url do migrator> pnpm db:deploy && systemctl restart vinimon`.

```
# /etc/caddy/Caddyfile
chamados.suaempresa.com.br {
	encode zstd gzip
	request_body { max_size 60MB }
	reverse_proxy 127.0.0.1:3000
}
# Intranet sem DNS público: "tls internal" ou "tls /cert.pem /key.pem".
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

`/etc/vinimon/api.env`: `NODE_ENV=production`, `HOST=127.0.0.1`, `APP_ORIGIN=https://chamados.suaempresa.com.br`, `TRUST_PROXY=127.0.0.1`, `UPLOAD_DIR=/var/lib/vinimon/anexos`, `WEB_DIST_DIR=../web/dist`, `DATABASE_URL` (papel `vinimon_app`, `sslmode=require` se o banco for remoto) e segredos gerados.

```sql
-- scripts/papeis-postgres.sql (rodar como superusuário, uma vez)
CREATE ROLE vinimon_migrator LOGIN PASSWORD :'senha_migrator';
CREATE ROLE vinimon_app LOGIN PASSWORD :'senha_app';
CREATE DATABASE vinimon OWNER vinimon_migrator;
\c vinimon
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO vinimon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vinimon_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vinimon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vinimon_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO vinimon_app;
CREATE SCHEMA pgboss AUTHORIZATION vinimon_app; -- pg-boss cria e migra as próprias tabelas
```

- **Backup:** timer systemd diário às 02:17 roda `scripts/backup.sh`:
  - `pg_dump -Fc` + `UPLOAD_DIR` → `restic backup` (com `RESTIC_PASSWORD`);
  - `restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune`.
- **Teste de restauração:** `scripts/teste-restauracao.sh` roda todo mês. Restaura num banco temporário e confere `count(chamados) > 0` e uma amostra de anexos. RPO 24 h, RTO 4 h.
- **Saúde:** `GET /api/v1/saude` → `{ok:true}`; `GET /api/v1/saude/pronto` faz `SELECT 1` e confere que o pg-boss iniciou.
