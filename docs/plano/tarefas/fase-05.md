> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 5 — Chamados

### T-5.1 — Escopo e políticas de chamado
- **Depende de:** T-1.10 · **Paralelo com:** T-5.2
- **Requisitos:** S44–S47, S49; §3.5
- **Arquivos:** `apps/api/src/autorizacao/{chamados.ts,chamados.test.ts}`
- **Passos:**
  1. Copiar literal da §3.5.
  2. Acrescentar a função pura `acoesDoUsuario(u, c: ChamadoEscopo & { statusTipo; papel: PapelStatus|null; cancelado; encerradoEm: Date|null }, cfg: Config, agora): Record<'assumir'|'encaminhar'|'status'|'prioridade'|'classificar'|'tags'|'agendar'|'concluir'|'aprovar'|'rejeitar'|'reabrir'|'cancelar'|'comentar'|'comentarInterno'|'anexar', boolean>`, com exatamente as colunas "Quem pode" e "Tipo do status atual" da tabela da §3.5.
  3. Reabrir:
     - exige `cfg['chamado.permitirReabertura']`;
     - `encerradoEm + prazoReaberturaDias ≥ agora` (0 = sem limite);
     - não cancelado.
- **Pronto quando:**
  - [ ] testes unitários com 7 atores (os mesmos de T33) para `podeVerChamado`/`podeVerInterno`/`podeAtender`, e uma linha por ação × tipo de status;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-5.2 — Contratos de chamado (shared)
- **Depende de:** T-1.3 · **Paralelo com:** T-5.1
- **Requisitos:** S54, S56; §3.6 (`ChamadoFiltros`, rotas)
- **Arquivos:** `packages/shared/src/{modulos/chamados.ts,modulos/chamados.test.ts,index.ts}`
- **Passos:**
  1. `ChamadoFiltrosSchema`: os campos da §3.6, todos opcionais exceto a paginação.
  2. `CriarChamadoSchema = z.strictObject({ assunto, descricao, problemaId, areaId?, prioridadeId?, departamentoId?, ativoId?, contato?, contatoEmail?, telefone?, solicitanteId?, canalId?, tags?: z.array(zTag()).max(10) })`.
  3. Bodies das ações, todos com `versao: z.int().min(0)`:
     - `Assumir {versao, confirmarTroca?, comentario?}`;
     - `Encaminhar {versao, areaId, operadorId?, comentario?, marcarPrimeiraResposta?}`;
     - `Status {versao, statusId}`, `Prioridade {versao, prioridadeId}`;
     - `Classificacao {versao, problemaId?, departamentoId?, ativoId?, canalId?}`, `Tags {tags}`;
     - `Agendar {versao, para: z.iso.datetime(), operadorId?, marcarPrimeiraResposta?}`;
     - `Concluir {versao, solucao, descricaoTecnica?}`, `Aprovar {versao, nota, comentario?}`, `Rejeitar {versao, motivo}`;
     - `Reabrir {versao, justificativa}`, `Cancelar {versao, motivo}`.
  4. Schemas de resposta:
     - `ChamadoResumoSchema` (para a lista: `id`, `assunto`, `novo`, `status`, `prioridade`, `area`, `problema`, `solicitante`, `operador`, `abertoEm`, `ultimaAtividadeEm`, `ultimaInteracao`, `naoLido`, `qtdAnexos`, `sla:{resposta,solucao}` com `prazo`/`alerta`/`cumprido`); `qtdAnexos` conta `interno=false` para quem não passa em `podeVerInterno`;
     - `ChamadoDetalheSchema` (todos os campos visíveis, `abertoPor`, `participantes`, `tags` opcionais, `avaliacao`, `seguindo`, `acoes`).
  5. `chamadosApi` com `listar`, `contagens`, `criar`, `obter`, `historico`, `reincidencia`, `assumir`, `encaminhar`, `status`, `prioridade`, `classificacao`, `tags`, `agendar`, `concluir`, `aprovar`, `rejeitar`, `reabrir`, `cancelar`, `seguir` (PUT), `deixarDeSeguir` (DELETE).
- **Pronto quando:**
  - [ ] testes: `CriarChamado` com `statusId` dá erro (T36); `visao` inválida dá erro; `de` inválida dá erro;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** M

### T-5.3 — Eventos de chamado e pós-commit
- **Depende de:** T-4.3 · **Paralelo com:** T-5.1, T-5.2
- **Requisitos:** C22; §3.8 (outbox, `aposCommitChamado` passos 1–3); §3.7 (eventos S→C)
- **Arquivos:** `apps/api/src/lib/tempo-real.ts`, `apps/api/src/modules/chamados/{eventos.ts,eventos.test.ts}`
- **Passos:**
  1. Estender `PublicadorTempoReal` e o `publicadorNulo`:
     - `emitirAssentamentos(chamadoId, assentamentoIds)`;
     - `emitirChamadoAtualizado(chamadoId, campos)`;
     - `emitirFila(chamadoId, motivo)`;
     - `emitirLeitura(chamadoId, usuarioId, ultimoId, lidoEm)`;
     - `emitirNotificacoes(itens: {usuarioId, notificacaoId}[])`;
     - `emitirContagem(usuarioId, naoLidas)`.
  2. `registrarEvento(tx, { chamadoId, tipo, atorId, assentamentoId?, interno?, dados? }): Promise<number>`.
  3. `registrarSistema(tx, chamadoId, evento, texto, dados?)` cria um `Assentamento` SISTEMA.
  4. `aposCommitChamado({ chamadoId, eventoIds, assentamentoIds, campos, acessoMudou, fila })` faz os passos 1–3 da §3.8 dentro de `try/catch` com `log.error`. O passo 4 (fanout) entra na T-6.8.
     - Evento com `interno=true` (COMENTARIO interno, TAGS_ALTERADAS, ANEXO_ADICIONADO/REMOVIDO interno) só emite `chamado:atualizado` para `salaChamadoInterno` e nunca chama `emitirFila`. `fila:atualizada` só é emitido com motivo ∈ {criado, atribuido, status, encaminhado, prioridade}.
  5. `interface EfeitosChamado { eventoIds; assentamentoIds; campos; acessoMudou; fila }` é o retorno padrão das transações de ação.
- **Pronto quando:**
  - [ ] teste com um publicador espião: os métodos são chamados com os argumentos certos e um erro do publicador não propaga;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** P

### T-5.4 — Abrir chamado
- **Depende de:** T-5.1, T-5.2, T-5.3, T-3.6, T-3.7, T-3.8 · **Paralelo com:** —
- **Requisitos:** S47, S50, S55; B01, B02, B04, B05, B12; T36, T38; §3.5 (linha "abrir")
- **Arquivos:** `apps/api/src/modules/chamados/{schemas.ts,service.ts,routes.ts,abrir.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `POST /chamados` (`chamado.abrir`), respondendo 201 `ChamadoDetalhe`.
  2. Validações, nesta ordem:
     - problema ativo;
     - USUARIO: `areaId` e `canalId` proibidos (400), `solicitanteId` diferente de si dá 403, a área vira `areaPadraoId`;
     - equipe: `areaId ∈ problema.areaIds`;
     - em nome de outro: `chamado.abrirEmNome`, alvo ativo, OPERADOR não escolhe ADMIN (403).
  3. Defaults:
     - prioridade padrão;
     - canal "Sistema Web", ou "Telefone" quando em nome de outro;
     - contato, e-mail e telefone do solicitante.
  4. Na transação:
     - status papel INICIAL;
     - `snapshotSla` e `statusDesde = abertoEm`;
     - seguidores SOLICITANTE e ABRIU;
     - `registrarSistema` "Chamado aberto" (ou "Aberto por X em nome de Y");
     - tags via `garantirTags` (só equipe);
     - evento CRIADO;
     - `recalcularChamado`;
     - auditoria `chamado.abertoEmNome` quando for o caso.
  5. Depois do commit, `aposCommitChamado` com `fila:'criado'`.
  6. `selectChamadoDetalhe` em `schemas.ts`. `montarDetalhe(u, id)` também é usado na T-5.6.
- **Pronto quando:**
  - [ ] T36, T38;
  - [ ] o chamado tem `prazoSolucaoEm` = abertura + meta (24x7);
  - [ ] USUARIO não escolhe área;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-5.5 — Lista, visões e contagens
- **Depende de:** T-5.4 · **Paralelo com:** —
- **Requisitos:** S45, S57, S62; C02, C04, C05, G01; T34, T42; §3.6 (`visao`)
- **Arquivos:** `apps/api/src/modules/chamados/{consultas.ts,routes.ts,lista.test.ts}`
- **Passos:**
  1. `listar(u, f)`:
     - `where = { AND: [escopoChamados(u), filtroVisao(u,f.visao), ...filtros] }`, sem espalhar o escopo (S45);
     - status `ignorado` sai, salvo `statusIds` explícito ou busca numérica;
     - sem `visao` e sem `de`, aplica os últimos 90 dias;
     - `busca`: número → `id`; texto → `buscaNorm contains` por token (`tokensBusca`, chega na T-6.1; até lá, `normalizar` local com `escaparLike`);
     - `tagIds` "contém todas": `AND: tagIds.map(id => ({ tags: { some: { tagId: id } } }))`; `tagIds` sem `chamado.atender` → 403 `SEM_PERMISSAO` (a T-14.5 só acrescenta os modos alguma e nenhuma);
     - `sla` via `prazoSolucaoEm`/`alertaSolucaoEm` com `concluidoEm: null`.
  2. Ordem:
     - `fila-aberta`: prioridade desc, depois `abertoEm` asc;
     - demais: `ordem`/`direcao` + `id`.
  3. Campos derivados:
     - `novo = agora − abertoEm < 10 min`;
     - `naoLido`: compara `ultimoAssentamentoPublicoId` (ou o geral, para quem vê interno) com `ChamadoLeitura` do usuário, numa query `findMany` por `id in`.
  4. `contagens(u)`: `$transaction` com um `count` por visão. `GET /chamados/contagens` com `config.rateLimit: { max: 30, timeWindow: '1 minute' }`.
- **Pronto quando:**
  - [ ] T34 (o `solicitanteId` de outro não amplia);
  - [ ] T42;
  - [ ] USUARIO com `tagIds` → 403;
  - [ ] cada visão devolve o conjunto esperado (fixture com 6 chamados);
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-5.6 — Detalhe, histórico e reincidência
- **Depende de:** T-5.5 · **Paralelo com:** —
- **Requisitos:** S46, S49; B17, I02, C22
- **Arquivos:** `apps/api/src/modules/chamados/{consultas.ts,routes.ts,detalhe.test.ts}`
- **Passos:**
  1. `GET /chamados/:id`: carrega pelo id; `!podeVerChamado` dá 404; devolve `montarDetalhe`, com `tags` só para a equipe e `acoes` de `acoesDoUsuario`.
  2. `GET /chamados/:id/historico`: `ChamadoEvento` ordenado por id. Quem não passa em `podeVerInterno` não vê `interno=true`, e a ausência de `chamado.atender` remove TAGS_ALTERADAS. Saída `{id, tipo, ator, dados, criadoEm}`.
  3. `GET /chamados/reincidencia?ativoId=&problemaId=` (`autenticado`), dentro do escopo:
     - os 10 últimos do ativo, com flag `emAberto`;
     - mais os do mesmo solicitante e problema nos últimos 30 dias.
- **Pronto quando:**
  - [ ] fora do escopo dá 404 (igual a inexistente);
  - [ ] o solicitante OPERADOR não vê evento interno;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-5.7 — Ações: assumir, encaminhar, status e prioridade
- **Depende de:** T-5.5, T-5.6 · **Paralelo com:** —
- **Requisitos:** S47, S53; C06, C07, C11; §3.5 (linhas e "Primeira resposta")
- **Arquivos:** `apps/api/src/modules/chamados/{acoes.ts,routes.ts,acoes-atendimento.test.ts}`
- **Passos:**
  1. Padrão de cada ação, numa transação:
     1. `carregarParaAcao(tx, id)`;
     2. `podeVerChamado` (senão 404);
     3. `acoesDoUsuario[acao]` (senão 403);
     4. regra específica (senão 422);
     5. `aplicarTransicaoStatus` com `versao` e/ou `updateMany` com `versao`;
     6. `registrarEvento` e `registrarSistema`;
     7. devolver os efeitos.
     Depois do commit, `aposCommitChamado` e a resposta com `montarDetalhe`.
  2. `marcarPrimeiraResposta(tx, c, ator)`: só quando `primeiraRespostaEm=null`, o ator tem `chamado.atender` e não é o solicitante.
  3. Encaminhar:
     - destino ativo e que atende; operador ativo, com a área entre as `areaIds` dele;
     - nova `jornadaId` e `snapshotSla`;
     - seguidor ATRIBUIDO;
     - `acessoMudou:true`;
     - depois do commit: `notificacao.updateMany({ where: { chamadoId, usuarioId: { in: perderamAcesso }, lidaEm: null }, data: { lidaEm: agora } })` + `emitirContagem`.
  4. Assumir com outro responsável sem `confirmarTroca` dá 409.
- **Pronto quando:**
  - [ ] uma tabela de testes por ação (permitido, proibido, tipo errado, versão velha → 409);
  - [ ] o encaminhamento chama `revalidarChamado` (espião);
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-5.8 — Ações: classificar, tags e agendar
- **Depende de:** T-5.7 · **Paralelo com:** —
- **Requisitos:** B13, C09; §3.5
- **Arquivos:** `apps/api/src/modules/chamados/{acoes.ts,routes.ts,acoes-classificacao.test.ts}`
- **Passos:**
  1. Classificar: se a área atual não está entre as do novo problema, a área vira a `areaPadraoId` e `acessoMudou:true`. Faz novo snapshot e recálculo; evento CLASSIFICACAO_ALTERADA com `{de, para}`.
  2. Tags: `garantirTags`, substitui `ChamadoTag`. Tags não chama `registrarSistema` (exceção ao padrão da T-5.7); só o evento TAGS_ALTERADAS com `interno:true`.
  3. Agendar:
     - `para` entre agora + 1 min e agora + 365 dias;
     - papel AGENDADO, `agendadoPara`, operador opcional;
     - primeira resposta conforme `chamado.primeiraRespostaAoEncaminhar` e `marcarPrimeiraResposta`;
     - evento AGENDADO.
- **Pronto quando:**
  - [ ] agendar no passado dá 400 ou 422;
  - [ ] a troca de problema muda a área;
  - [ ] USUARIO não vê tags no detalhe;
  - [ ] após alterar tags, `GET /chamados/:id/assentamentos` do solicitante não muda;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-5.9 — Ações: concluir, aprovar e rejeitar
- **Depende de:** T-5.8 · **Paralelo com:** —
- **Requisitos:** C13, C14; §3.5; §4.6 (`adicionarDiasUteis`)
- **Arquivos:** `apps/api/src/modules/chamados/{acoes.ts,routes.ts,acoes-conclusao.test.ts}`
- **Passos:**
  1. Concluir:
     - `operadorId ??= eu`;
     - vai direto para ENCERRADO conforme a §3.5;
     - senão, papel CONCLUIDO com `validacaoLimiteEm` = `adicionarDiasUteis` (se `prazoValidacaoDiasUteis`) ou `+N dias`;
     - evento CONCLUIDO.
  2. Aprovar: só o solicitante; cria `AvaliacaoChamado`; papel ENCERRADO; evento APROVADO.
  3. Rejeitar:
     - o motivo vira comentário público;
     - papel EM_ATENDIMENTO, ou INICIAL se o operador estiver inativo;
     - `concluidoEm=null`, `rejeicoes+1`;
     - evento REJEITADO.
- **Pronto quando:**
  - [ ] prazo 0 encerra direto;
  - [ ] o solicitante como operador encerra direto;
  - [ ] não solicitante aprovando dá 403;
  - [ ] após rejeitar, o SLA volta a correr (`prazoSolucaoEm` recalculado);
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-5.10 — Ações: reabrir, cancelar e seguir
- **Depende de:** T-5.9 · **Paralelo com:** —
- **Requisitos:** C16, C17; §3.8 (seguidores)
- **Arquivos:** `apps/api/src/modules/chamados/{acoes.ts,routes.ts,acoes-reabertura.test.ts}`
- **Passos:**
  1. Reabrir: guarda a avaliação anterior em `dados` do evento REABERTO; apaga a `AvaliacaoChamado`; limpa as datas.
  2. Cancelar: papel CANCELADO, `cancelado=true`, `concluidoEm=encerradoEm=agora`, evento CANCELADO.
  3. `PUT /chamados/:id/seguir` faz upsert com motivo MANUAL e `silenciadoEm=null`. `DELETE` grava `silenciadoEm`. Ambos respondem 204.
- **Pronto quando:**
  - [ ] reabrir fora do prazo dá 422;
  - [ ] reabrir cancelado dá 422;
  - [ ] USUARIO cancelando com operador atribuído dá 403;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** P

### T-5.11 — Matriz de autorização de chamados
- **Depende de:** T-5.10 · **Paralelo com:** T-5.12
- **Requisitos:** S44–S47; T33, T34
- **Arquivos:** `apps/api/test/chamados-matriz.test.ts`, `apps/api/test/escopo-equivalencia.test.ts`
- **Passos:**
  1. `it.each` sobre {rotas GET e POST de chamado} × {solicitante USUARIO, outro USUARIO, OPERADOR da área, OPERADOR de área secundária, OPERADOR de outra área, OPERADOR responsável de outra área, ADMIN}, com o status esperado em tabela. Fora do escopo é sempre 404.
  2. `escopo-equivalencia.test.ts`: fixture com os 7 atores de T33 e 12 chamados (área primária, secundária, outra área, operador responsável de outra área, solicitante OPERADOR, encerrado, cancelado). Para cada ator: `ids(await prisma.chamado.findMany({ where: escopoChamados(u), select: { id: true } }))` deve ser igual a `chamados.filter(c => podeVerChamado(u, c)).map(c => c.id)`.
- **Pronto quando:**
  - [ ] ≥ 100 casos verdes;
  - [ ] `escopo-equivalencia.test.ts` verde para os 7 atores;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-5.12 — Exportar CSV
- **Depende de:** T-5.5 · **Paralelo com:** T-5.11
- **Requisitos:** S82, S87; G01
- **Arquivos:** `apps/api/src/modules/chamados/{exportar.ts,routes.ts,exportar.test.ts}`
- **Passos:**
  1. `GET /chamados/exportar?<ChamadoFiltros>` (`relatorio.ver`). Mesmos filtros e escopo de `listar`, com `take` de até 5000, lido em lotes de 500 por cursor de id.
  2. `import contentDisposition from 'content-disposition'` (`content-disposition@3.0.0` nas dependencies da API se não estiver na §2.2). `reply.type('text/csv; charset=utf-8').header('content-disposition', contentDisposition('chamados-AAAA-MM-DD.csv'))` e `return reply.send(Readable.from(gerador()))`, com BOM e `linhaCsv`.
     - Cabeçalho e colunas, nesta ordem: `Nº;Assunto;Status;Prioridade;Área;Tipo de problema;Solicitante;Operador;Canal;Abertura;Primeira resposta;Encerramento;Prazo de solução;SLA de solução cumprido`. Datas em `dd/MM/yyyy HH:mm` no fuso `sistema.timezone`; booleanos como `Sim`/`Não`/vazio. Sem descrição, solução, tags, comentários e contatos.
  3. Schema `response: {200: z.string()}`, só para documentação.
  4. Auditoria `exportacao.csv` com `{filtros, linhas}`, gravada no `finally` do gerador, com o número de linhas emitidas.
- **Pronto quando:**
  - [ ] assunto `=HYPERLINK(...)` sai com o prefixo `'`;
  - [ ] USUARIO dá 403;
  - [ ] OPERADOR da área A com `areaIds=<B>` recebe só BOM + cabeçalho;
  - [ ] a contagem do CSV é igual ao `total` da lista;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P
