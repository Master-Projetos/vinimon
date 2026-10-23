> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 6 — Conversa, menções, leitura, anexos, notificações e busca

### T-6.1 — Shared: menções e busca
- **Depende de:** T-1.3 · **Paralelo com:** T-6.5
- **Requisitos:** S100, S78; §3.9
- **Arquivos:** `packages/shared/src/{mencoes.ts,mencoes.test.ts,busca.ts,busca.test.ts,index.ts}`
- **Passos:**
  1. `mencoes.ts` (token `@[Nome](usuario:ID)`):
     - `criarMencaoRe = () => /@\[([^\][\n]{1,80})\]\(usuario:(\d{1,10})\)/g`, sempre uma instância nova;
     - `extrairMencoes(texto): {id, nome}[]` sem duplicar ids;
     - `serializarMencao({id, nome})` remove `[]()\n` do nome e corta em 80 caracteres;
     - `textoPlano(texto)`: tokens viram `@Nome`;
     - `segmentarTexto(texto)`: `texto | mencao | link`, só http(s);
     - `serializarComposer(visivel, selecionadas)`.
  2. `busca.ts`: `normalizarBusca` (NFD, sem marcas, minúsculas, espaços colapsados, ≤ 100), `tokensBusca` (≤ 8 tokens de 2 a 30 caracteres, `[^\p{L}\p{N}]+`), `idChamadoExato(q)` para `^#?\d{1,9}$`.
- **Pronto quando:**
  - [ ] testes: ida e volta das menções; `<script>` continua texto; `javascript:` não vira link; "Impressão" vira `impressao`; `#123` vira 123;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-6.2 — Menções: validação e mencionáveis
- **Depende de:** T-6.1, T-5.4 · **Paralelo com:** T-6.5
- **Requisitos:** S52, S100; T59 (parte)
- **Arquivos:** `apps/api/src/modules/mencoes/{service.ts,routes.ts,mencoes.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `validarMencoes(tx, chamado, texto, interno): Promise<{ texto: string; validos: number[]; ignoradas: {id; nome}[] }>`:
     - mais de 20 menções distintas dão 400;
     - os candidatos vêm numa única query, com `areasSecundarias`;
     - vale quem é ativo e passa em `podeVerChamado`; em mensagem interna, também `podeVerInterno`;
     - os tokens válidos são reescritos com o nome canônico; os inválidos viram `@Nome`, texto simples com o nome do token.
  2. `GET /chamados/:id/mencionaveis?q=&interno=` (120/min): exige ver o chamado; até 8 resultados `{id, nome, perfil}` sem o próprio usuário, com participantes primeiro. USUARIO só vê participantes; `interno=true` só equipe.
- **Pronto quando:**
  - [ ] T59 (sem acesso → `ignoradas`; USUARIO em interno → ignorado; 21 menções → 400);
  - [ ] operador de outra área nunca aparece em mencionáveis;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-6.3 — Assentamentos: timeline e comentar
- **Depende de:** T-6.2 · **Paralelo com:** T-6.5
- **Requisitos:** S49, S99, S101; C11, C12; T35; §3.5 (comentar)
- **Arquivos:** `packages/shared/src/{modulos/assentamentos.ts,index.ts}`, `apps/api/src/modules/assentamentos/{schemas.ts,service.ts,routes.ts,assentamentos.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `AssentamentoDTO = {id, chamadoId, tipo, interno, texto, evento, dados, autor:{id, nome}|null, criadoEm, clienteId}`.
  2. `GET /chamados/:id/assentamentos?antesDe=&limite=50`: o interno só aparece para `podeVerInterno`; ordem por id desc; resposta `{itens (asc), proximoCursor}`.
  3. `POST` com `{texto: zComentario(), interno: boolean, clienteId: z.uuid()}` (30/min):
     - regras de "comentar" da §3.5;
     - `interno` sem `podeVerInterno` dá 403;
     - já existe `(autorId, clienteId)` → devolve 200 com o existente; P2002 na corrida também devolve 200;
     - na transação: menções, assentamento, `Mencao`, seguidores COMENTOU (limpa `silenciadoEm`) e MENCIONADO (`skipDuplicates`), primeira resposta (só público), AGUARDANDO_SOLICITANTE → EM_ATENDIMENTO quando quem comenta é o solicitante, `ultimoAssentamentoId`/`PublicoId`, `ultimaInteracao*` (público), `ultimaAtividadeEm` (só muda em evento público), evento COMENTARIO com `interno` e `dados:{mencionados}`.
  4. Resposta 201 `{assentamento, mencoesIgnoradas}`.
- **Pronto quando:**
  - [ ] T35 (detalhe e timeline);
  - [ ] o mesmo `clienteId` 2 vezes gera 1 registro (201 e depois 200);
  - [ ] o comentário do solicitante tira de PENDENTE;
  - [ ] socket do solicitante OPERADOR não recebe `chamado:atualizado` nem `fila:atualizada` após comentário interno, e `ultimaAtividadeEm` não muda;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-6.4 — Leituras ("Visto por")
- **Depende de:** T-6.3 · **Paralelo com:** T-6.5
- **Requisitos:** S98; TM4; §4.3 (SQL de leitura)
- **Arquivos:** `packages/shared/src/{modulos/leituras.ts,index.ts}` (contrato, como na receita de módulo), `apps/api/src/modules/leituras/{service.ts,routes.ts,leituras.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `POST /chamados/:id/leitura {assentamentoId}` (120/min). O assentamento precisa ser do chamado e visível (senão 422). Usa o `$queryRaw` monotônico da §4.3.
  2. Se a query devolver linha: marca como lidas as notificações do chamado, exceto AVALIACAO_PENDENTE; depois do commit, `emitirLeitura` + `emitirContagem`.
  3. `GET /chamados/:id/leituras`: só participantes (solicitante, operador e seguidores). Quem não vê interno recebe o maior id **público** menor ou igual ao ponteiro.
- **Pronto quando:**
  - [ ] o ponteiro não regride;
  - [ ] o solicitante apontando para um interno dá 422;
  - [ ] o valor limitado é calculado certo;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-6.5 — Tipo de arquivo e armazenamento
- **Depende de:** T-1.6 · **Paralelo com:** T-6.1–T-6.4
- **Requisitos:** S65–S68; T43, T45 (unidade); §3.11
- **Arquivos:** `apps/api/src/lib/{tipo-arquivo.ts,armazenamento.ts,tipo-arquivo.test.ts,armazenamento.test.ts}`
- **Passos:**
  1. `tipo-arquivo.ts`:
     - `detectarTipo(caminho, nomeOriginal): Promise<{ mime: string; inline: boolean } | null>` aplica a tabela S66 sobre `fileTypeFromFile`;
     - texto: lê até 1 MiB, `new TextDecoder('utf-8',{fatal:true})` e nenhum byte 0;
     - `limparNomeArquivo(nome)` aplica S68.
  2. `armazenamento.ts`:
     - `DiscoLocal` conforme a §3.11;
     - `chaveNova(agora, uuid)` = `AAAA/MM/<uuid>`;
     - `resolver(chave)` valida a regex e `startsWith(raiz + sep)`;
     - `receber` usa `pipeline` com `createHash('sha256')` e um `Transform` que conta bytes e aborta acima do limite com `ErroApp(413,'ARQUIVO_GRANDE')`.
- **Pronto quando:**
  - [ ] T43 nas variantes por buffer (PNG renomeado, HTML como `.png`, SVG, `MZ`, `.txt` com NUL, `.csv` UTF-8);
  - [ ] T45;
  - [ ] o temporário é apagado depois de 413;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-6.6 — Anexos
- **Depende de:** T-6.3, T-6.5 · **Paralelo com:** T-6.7
- **Requisitos:** S63–S71, S87; T44, T46, T47
- **Arquivos:** `packages/shared/src/{modulos/anexos.ts,index.ts}`, `apps/api/src/modules/anexos/{service.ts,routes.ts,anexos.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `POST /chamados/:id/anexos` (multipart, 30/h por usuário).
  2. No handler, **antes** de ler as partes, `autorizarUpload(u, chamadoId)`:
     - checagens S63;
     - `anexos.habilitados`;
     - cota de 50 arquivos e 100 MiB (`aggregate`);
     - sem acesso → 404 sem tocar no disco;
     - `interno=true` sem `podeVerInterno` → 403 antes de ler as partes.
     - Se `assentamentoId` vier: precisa existir com `chamadoId` igual ao da rota, `autorId === u.id` e `criadoEm` ≥ agora − 10 min (senão 422 `REGRA_NEGOCIO`), e o `interno` do anexo passa a ser `assentamento.interno`, ignorando o campo enviado.
  3. Leitura das partes: `for await (const parte of req.parts({ limits: { fileSize: min(MAX_ANEXO_MB, cfg) MiB, files: cfg['anexos.maxPorEnvio'] } }))`.
     - Campos `interno` (`'true'|'false'`) e `assentamentoId`, validados com Zod.
     - Para cada arquivo: `receber` → `detectarTipo` (415) → `efetivar` → `prisma.anexo.create` com `id = uuid` (a chave).
     - `finally descartar`.
  4. Evento ANEXO_ADICIONADO (com `interno`). `ultimaAtividadeEm` só muda em evento público.
  5. `GET /chamados/:id/anexos`: lista com interno filtrado.
  6. `GET /anexos/:id`: cabeçalhos S70 e `createReadStream`. Interno sem acesso dá 404.
  7. `DELETE /anexos/:id`: só ADMIN; remove arquivo e linha; auditoria `anexo.excluido`; evento ANEXO_REMOVIDO.
- **Pronto quando:**
  - [ ] T44, T46, T47;
  - [ ] USUARIO com `interno=true` → 403 e nada no disco; `assentamentoId` de outro chamado → 422;
  - [ ] `ls apps/api/storage/teste/tmp` vazio no fim dos testes;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-6.7 — Notificações: shared e regras puras
- **Depende de:** T-5.3 · **Paralelo com:** T-6.6, T-6.10
- **Requisitos:** S101, S102; §3.8 (tabela de regras e preferências)
- **Arquivos:** `packages/shared/src/{notificacoes.ts,notificacoes.test.ts,index.ts}`, `apps/api/src/modules/notificacoes/{regras.ts,regras.test.ts}`
- **Passos:**
  1. Shared:
     - `TIPOS_INAPP_FIXOS = ['MENCAO','ATRIBUIDO','AVALIACAO_PENDENTE']`;
     - `preferenciaPadrao(tipo, perfil)` conforme a tabela da §3.8;
     - `NotificacaoDTOSchema = {id, tipo, chamado:{id, assunto}, atores:{id, nome}[], contagem, interno, trecho: string|null, assentamentoId, dados, criadoEm, atualizadoEm, lida}`;
     - `textoNotificacao(n)` com os textos de `docs/plano/relatorios/tempo-real.md` §5.10 (ex.: "Ana e mais 2 pessoas comentaram em #123").
  2. `regras.ts`: `destinatarios(evento, ctx: { chamado, seguidores, operadoresDaArea, mencionados, ator }): { usuarioId; tipo; grupoChave }[]`, pura, com exatamente as linhas da §3.8. O ator fica de fora.
- **Pronto quando:**
  - [ ] um teste por linha da tabela da §3.8;
  - [ ] `textoNotificacao` para cada tipo e contagem;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** M

### T-6.8 — Fanout e passo 4 do pós-commit
- **Depende de:** T-6.7, T-6.3 · **Paralelo com:** T-6.10
- **Requisitos:** S101, S105; §3.8 (fanout)
- **Arquivos:** `apps/api/src/modules/notificacoes/{fanout.ts,fanout.test.ts}`, `apps/api/src/modules/chamados/eventos.ts`, `apps/api/src/modules/chamados/{abrir.test.ts,acoes-atendimento.test.ts}` (ajustar as asserções que o passo 4 do pós-commit muda: `processadoEm` do evento CRIADO e a contagem reemitida em S53)
- **Passos:**
  1. `processarEvento(id)`, com número fixo de queries:
     1. claim;
     2. chamado;
     3. seguidores, operadores da área e mencionados;
     4. usuários candidatos com áreas (filtro em memória por `podeVerChamado`/`podeVerInterno`, ativos);
     5. preferências (`inApp`; os tipos fixos ignoram);
     6. upsert agrupado.
  2. Upsert (template marcado; arrays via `unnest`):
     ```ts
     await tx.$queryRaw`INSERT INTO notificacoes (usuario_id, chamado_id, tipo, grupo_chave, evento_id, assentamento_id, ator_ids, interno, dados)
       SELECT d.u, ${c.id}, d.t::tipo_notificacao, d.k, ${ev.id}, ${ev.assentamentoId}, ${atores}::int[], ${ev.interno}, ${dados}::jsonb
       FROM unnest(${us}::int[], ${tipos}::text[], ${chaves}::text[]) AS d(u, t, k)
       ON CONFLICT (usuario_id, grupo_chave) DO UPDATE SET contagem = notificacoes.contagem + 1, evento_id = EXCLUDED.evento_id, dados = EXCLUDED.dados,
         interno = notificacoes.interno OR EXCLUDED.interno, atualizado_em = now(), lida_em = NULL,
         ator_ids = CASE WHEN EXCLUDED.ator_ids[1] = ANY(notificacoes.ator_ids) THEN notificacoes.ator_ids ELSE (EXCLUDED.ator_ids || notificacoes.ator_ids)[1:10] END
       RETURNING id, usuario_id`
     ```
     O nome do tipo SQL do enum segue o `@@map` do schema; confira com `docker compose exec -T postgres psql -U vinimon -d vinimon -c '\dT'` e ajuste no template.
  3. Depois do commit: contagem de não lidas por usuário (1 query `groupBy`, com o mesmo `where` da lista: `whereNotificacoesVisiveis(u)` da T-6.9) + `emitirNotificacoes` + `emitirContagem`.
  4. `eventos.ts`: o passo 4 do `aposCommitChamado` chama `processarEvento` para cada id.
- **Pronto quando:**
  - [ ] comentário interno não notifica o seguidor USUARIO;
  - [ ] o ator não recebe;
  - [ ] dois comentários → 1 linha com `contagem=2`;
  - [ ] após marcar como lida, nasce linha nova;
  - [ ] Teste de N+1: com prisma.$on("query"), 5 e 50 seguidores executam o mesmo número de queries (≤ 10). O teste usa `let n = 0; const fn = () => { n++ }; prisma.$on('query', fn)` em volta de cada chamada a `processarEvento` (exige o `log: [{ emit: 'event', level: 'query' }, ...]` de `lib/prisma.ts`, §7);
  - [ ] dois STATUS_ALTERADO seguidos: a notificação mostra o último status;
  - [ ] uma chamada concorrente de `processarEvento` gera uma notificação só;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-6.9 — Rotas de notificações e preferências
- **Depende de:** T-6.8 · **Paralelo com:** T-6.10
- **Requisitos:** S102, S103; T60, T61; §3.6 (Notificações, `/me/preferencias-notificacao`)
- **Arquivos:** `packages/shared/src/{modulos/notificacoes.ts,index.ts}`, `apps/api/src/modules/notificacoes/{service.ts,routes.ts,notificacoes.test.ts}`, `apps/api/src/app.ts`, `apps/api/src/modules/notificacoes/fanout.ts` e `apps/api/src/modules/leituras/service.ts` (passam a usar `whereNotificacoesVisiveis`: S103 pede uma função única também na contagem pós-fanout e na do "Visto por"; hoje cada um tem um `where` local)
- **Passos:**
  1. `GET /notificacoes?filtro=&cursor=&limite=`:
     - `where: { usuarioId, chamado: escopoChamados(u), ...regra de interno da §3.8, ...filtro }`;
     - cursor `base64url("<atualizadoEmISO>|<id>")`;
     - trecho: carrega os assentamentos por `id in` e usa `textoPlano(...).slice(0,140)` só se for visível;
     - `atores`: uma única `usuario.findMany({ where: { id: { in: uniao(itens.flatMap(n => n.atorIds)) } }, select: { id: true, nome: true } })`, mapeada em memória; `chamado` via `select` na mesma query da lista.
  2. `GET /notificacoes/contagem` e a contagem pós-fanout (T-6.8 passo 3) usam o mesmo `where` da lista (função única `whereNotificacoesVisiveis(u)`).
  3. `POST /notificacoes/:id/lida`: AVALIACAO_PENDENTE dá 422; aplica `grupo_chave || '#' || id`.
  4. `POST /:id/nao-lida`; `POST /notificacoes/lidas {chamadoId?}`.
  5. `GET/PUT /me/preferencias-notificacao {itens:[{tipo, inApp, desktop}]}`: tipo fixo com `inApp=false` dá 400; só as diferenças do padrão vão para o banco.
- **Pronto quando:**
  - [ ] T60 (encaminhar remove o item do feed de quem perdeu acesso);
  - [ ] T61 (`notificacoes` sem coluna de texto: `information_schema.columns`);
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-6.10 — Busca global (API)
- **Depende de:** T-6.1, T-5.5 · **Paralelo com:** T-6.7–T-6.9
- **Requisitos:** S106–S108; T62; §3.9
- **Arquivos:** `packages/shared/src/{modulos/busca.ts,index.ts}`, `apps/api/src/modules/busca/{service.ts,routes.ts,busca.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `GET /busca?q=&limite=5` (60/min).
  2. Chamados: `findMany` da §3.9 com `escaparLike(token)`; o número exato vem primeiro.
  3. Artigos: `$queryRaw` tagged (`ts_rank_cd`), com `tsq = tokens.map(t=>t+':*').join(' & ')`, situação PUBLICADO e visibilidade conforme `conhecimento.verInterno`.
  4. Ativos e usuários: só com `chamado.atender`, via `buscaNorm contains`.
  5. Resposta `{chamados, artigos, ativos, usuarios}`; os grupos sem permissão voltam `[]`.
- **Pronto quando:**
  - [ ] T62 completo (incluindo `%` e "50%");
  - [ ] busca com e sem acento dá o mesmo resultado;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M
