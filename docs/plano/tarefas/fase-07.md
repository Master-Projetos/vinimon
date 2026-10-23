> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 7 — Tempo real e jobs

### T-7.1 — Shared: eventos realtime; API: salas e limites
- **Depende de:** T-6.1 · **Paralelo com:** T-7.6
- **Requisitos:** S90, S95, S96; §3.7
- **Arquivos:** `packages/shared/src/{realtime.ts,realtime.test.ts,index.ts}`, `apps/api/src/realtime/{salas.ts,limites.ts}`
- **Passos:**
  1. `realtime.ts`:
     - schemas Zod `z.strictObject` dos eventos C→S da §3.7;
     - interfaces `EventosCliente` e `EventosServidor` com os payloads da tabela;
     - `ErroRt = 'INVALIDO'|'INDISPONIVEL'|'LIMITE_SALAS'|'RATE_LIMIT'`.
  2. `salas.ts`: `salaUsuario`, `salaSessao`, `salaArea`, `SALA_ADMINS`, `salaChamado`, `salaChamadoInterno`, `salaPresenca`.
  3. `limites.ts`: um `RateLimiterMemory` por evento da §3.7, `limitePacotes` (120/10 s) e `violacoes` (20/60 s).
- **Pronto quando:**
  - [ ] teste: payload com chave extra dá erro;
  - [ ] `pnpm verificar`.
- **Trilha:** A (apoio W)
- **Modelo:** Haiku
- **Tamanho:** P

### T-7.2 — Plugin Socket.IO e handshake
- **Depende de:** T-7.1, T-2.4 · **Paralelo com:** T-7.6
- **Requisitos:** S36, S90, S91; T52; §3.7 (trecho do handshake)
- **Arquivos:** `apps/api/src/realtime/{plugin.ts,handshake.ts}`, `apps/api/src/app.ts`, `apps/api/test/socket.ts`, `apps/api/src/realtime/handshake.test.ts`
- **Passos:**
  1. `tempoRealPlugin` (`fastify-plugin`, nome `tempo-real`): `new Server(app.server, {...§3.7})`.
  2. `allowRequest`: Origin igual a `APP_ORIGIN` e IP via `proxyAddr(req, confianca)` (de `@fastify/proxy-addr`) com 30/min. `@fastify/proxy-addr@5.1.2` entra como dependency direta da API e, em `realtime/handshake.ts`: `const t = env.TRUST_PROXY; const confianca = typeof t === 'boolean' ? () => t : typeof t === 'number' ? (_: string, i: number) => i < t : proxyAddr.compile(t)`.
  3. `io.use`: o trecho literal da §3.7. Bearer no handshake é recusado.
  4. Na conexão: `join` em `usuario:`, `sessao:`, `area:*` (OPERADOR) e `admins`.
  5. `preClose`: `io.local.disconnectSockets(true)`; `onClose`: `io.close()`.
  6. `definirTempoReal(implementacao)`, com os métodos do publicador implementados na T-7.3 e na T-7.4. Por enquanto, os métodos de emissão são no-op.
  7. Registrar o plugin em `app.ts`.
  8. `test/socket.ts`: `conectar(app, cookie, origin=ORIGEM)` com `await app.listen({port:0, host:'127.0.0.1'})`, `ioc(url, { transports:['websocket'], extraHeaders:{cookie, origin}, forceNew:true, reconnection:false })`; mais `esperarEvento(s, ev, ms=1000)` e `naoRecebe(s, ev, ms=300)`.
- **Pronto quando:**
  - [ ] T52 (sem cookie, Origin externo, PENDENTE_MFA, Bearer);
  - [ ] o 11º socket do mesmo usuário é recusado;
  - [ ] `app.close()` termina em menos de 2 s;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-7.3 — Handlers de chamado, digitação e emissões
- **Depende de:** T-7.2, T-6.4, T-6.8 · **Paralelo com:** T-7.6
- **Requisitos:** S92, S93, S95, S96, S98; T53, T54, T57
- **Arquivos:** `apps/api/src/realtime/{handlers.ts,plugin.ts,handlers.test.ts}`
- **Passos:**
  1. `comValidacao(schema, limiter, handler)`: `safeParse` (inválido conta violação e devolve `INVALIDO`) e trata `ack` ausente.
  2. `chamado:entrar`: recarrega usuário e chamado, aplica `podeVerChamado`, limite de 20 salas e entra também na interna se `podeVerInterno`. `chamado:sair`.
  3. `chamado:digitando`: exige a sala (e a interna, se `interno`) e faz `socket.to(sala).volatile.emit`. No `disconnecting`, emite `digitando:false`.
  4. Emissores reais do publicador:
     - assentamentos carregados por id: interno vai para `chamadoInterno`, público para `chamado`;
     - `emitirLeitura`: o valor real vai para a sala interna; `io.to(salaChamado).except(salaChamadoInterno)` recebe o maior id público ≤ valor (1 query);
     - fila para área, admins, solicitante e operador;
     - notificações e contagem para `usuario:`.
- **Pronto quando:**
  - [ ] T53, T54 (inclusive com solicitante OPERADOR);
  - [ ] T57 (payload de 20 KB derruba; a 2ª `digitando` em 2 s é descartada);
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-7.4 — Revogação e revalidação de sockets
- **Depende de:** T-7.3, T-3.12 · **Paralelo com:** T-7.6
- **Requisitos:** S20, S53, S94; T55, T56
- **Arquivos:** `apps/api/src/realtime/{plugin.ts,revalidacao.ts,revalidacao.test.ts}`
- **Passos:**
  1. `encerrarSessao`: `sessao:encerrada` e depois `disconnectSockets(true)`. `encerrarSessoesDoUsuario`: o mesmo na sala `usuario:`.
  2. `revalidarUsuario`: recarrega o usuário e atualiza `socket.data`, as salas `area:*`/`admins`, as salas de chamado (1 query) e a sala interna.
  3. `revalidarChamado`: `fetchSockets()` nas duas salas; quem perdeu acesso recebe `leave` e `chamado:acessoRevogado`.
  4. `setInterval(SOCKET_REVALIDAR_MS)`: `sessaoId` distintos, uma query `findMany`, `disconnect` dos inválidos (revogada, expirada ou inativa por `sessao.minutosInatividade`). `clearInterval` no `onClose`.
- **Pronto quando:**
  - [ ] T55 (logout, troca de senha, desativação, revogação; expiração com `SOCKET_REVALIDAR_MS=200`);
  - [ ] T56;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-7.5 — Presença
- **Depende de:** T-7.3 · **Paralelo com:** T-7.6–T-7.9
- **Requisitos:** S97; TM2; T58; §3.7 (Presença)
- **Arquivos:** `apps/api/src/realtime/{presenca.ts,presenca.test.ts}`, `packages/shared/src/{modulos/presenca.ts,index.ts}`, `apps/api/src/modules/presenca/{service.ts,routes.ts}`, `apps/api/src/app.ts`, `apps/api/src/realtime/plugin.ts` (registrar a presença no `connection` e expor o serviço à rota `PUT /me/presenca`)
- **Passos:**
  1. `calcularEstado` (pura, §3.7). `PresencaService` com `Map` em memória:
     - conexões, manual vindo de `PresencaUsuario` na primeira conexão, timer de expiração do manual;
     - `ultimoVistoEm` gravado no último disconnect e no máximo a cada 5 min durante atividade;
     - mudança de estado emite `presenca:mudou` (`.volatile`) para `presenca:<uid>` e `presenca:propria`.
  2. Handlers `presenca:atividade` e `presenca:assinar`, com `podeVerPresenca`; `ultimoVistoEm` só para a equipe.
  3. `PUT /me/presenca {estado: 'OCUPADO'|'AUSENTE'|null, ate: datetime|null}` (até 7 dias).
- **Pronto quando:**
  - [ ] tabela de casos de `calcularEstado`;
  - [ ] T58;
  - [ ] o manual vencido volta ao automático (relógio injetado);
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-7.6 — Jobs: infraestrutura, limpeza de sessões e purga de auditoria
- **Depende de:** T-4.3 · **Paralelo com:** T-7.1–T-7.5
- **Requisitos:** S25, S88, S123; §3.10
- **Arquivos:** `apps/api/src/jobs/{index.ts,sessoes-limpeza.ts,auditoria-purga.ts,jobs-limpeza.test.ts}`, `apps/api/src/server.ts`, `apps/api/src/modules/saude/service.ts`
- **Passos:**
  1. `jobs/index.ts`: o padrão da §3.10, com `JOBS: { fila; cron?; executar(dados, agora) }[]`. `definirFila` adapta o `boss.send`.
  2. `server.ts` liga `iniciarJobs`.
  3. `saude/pronto` também confere `jobsIniciados()` quando `JOBS_HABILITADOS`.
  4. Antes de escrever, confira as assinaturas em `node_modules/pg-boss/dist/*.d.ts` (`getQueue`, `createQueue`, `schedule(..., {tz})`).
  5. `sessoes-limpeza`: `deleteMany` de sessões expiradas ou revogadas há mais de 7 dias e de `falhas_login` com mais de 24 h.
  6. `auditoria-purga`: `$transaction(async tx => { await tx.$executeRaw\`SET LOCAL vinimon.purga_auditoria = 'on'\`; await tx.$executeRaw\`DELETE FROM auditoria WHERE criado_em < now() - interval '365 days'\` (relógio do banco, nunca do Node) })`.
- **Pronto quando:**
  - [ ] testes chamando `executar` direto com `agora` injetado;
  - [ ] a purga apaga só registros com mais de 365 dias (T50);
  - [ ] com a GUC ligada, `DELETE FROM auditoria WHERE criado_em > now() - interval '1 day'` lança 42501, e a purga de registros com mais de 365 dias funciona (trigger `tg_auditoria_delete` da §4.3);
  - [ ] `pnpm -F @vinimon/api dev` cria o schema `pgboss` (`docker compose exec -T postgres psql -U vinimon -d vinimon -c '\dn'`);
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-7.7 — Jobs: retorno de agendados e auto-aprovação
- **Depende de:** T-7.6, T-5.9 · **Paralelo com:** T-7.8, T-7.9
- **Requisitos:** C09, C15; §3.10
- **Arquivos:** `apps/api/src/jobs/{chamados-retorno-agendados.ts,chamados-auto-aprovacao.ts,jobs-chamados.test.ts,jobs-limpeza.test.ts,index.ts}`
- **Passos:**
  1. Cada chamado candidato (lote de 200) passa por uma transação com `aplicarTransicaoStatus` usando a `versao` lida. Conflito: ignora e segue.
  2. Ator SISTEMA (`CONTEXTO_SISTEMA`). Eventos RETORNO_AGENDAMENTO e AUTO_APROVADO. Avaliação `automatica:true` com `chamado.avaliacaoAutomatica`. Comentário de sistema da §3.5.
  3. Depois de cada commit, `aposCommitChamado`.
- **Pronto quando:**
  - [ ] idempotente: rodar 2 vezes não duplica eventos;
  - [ ] o agendado volta para EM_ATENDIMENTO com operador e para INICIAL sem;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-7.8 — Jobs: alertas de SLA, recálculo por jornada e varredura de eventos
- **Depende de:** T-7.6, T-6.8 · **Paralelo com:** T-7.7, T-7.9
- **Requisitos:** D05 adaptado; §3.10
- **Arquivos:** `apps/api/src/jobs/{sla-alertas.ts,sla-recalcular-jornada.ts,eventos-varrer.ts,jobs-sla.test.ts,index.ts}`, `apps/api/src/jobs/jobs-limpeza.test.ts` (a asserção "todo job tem cron" não vale para o `sla-recalcular-jornada`, que é sob demanda`
- **Passos:**
  1. `sla-alertas`: três consultas (risco, estouro, resposta), em lotes de 500 e com `concluidoEm: null`. Para cada chamado: `updateMany({ where: { id, slaAvisoRiscoEm: null } })`; se `count = 1`, registra o evento (SLA_RISCO, SLA_ESTOURADO ou SLA_RESPOSTA_ESTOURADO) e faz o fanout.
  2. `sla-recalcular-jornada {jornadaId}`: em lotes de 200, `recalcularChamado` em transação, zerando os avisos quando os prazos mudam.
  3. `eventos-varrer`: `processadoEm IS NULL` e criado há mais de 1 min (até 200), cada um com `processarEvento`.
- **Pronto quando:**
  - [ ] rodar o alerta 2 vezes gera 1 evento;
  - [ ] um fanout que falhou é reprocessado pela varredura;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-7.9 — Jobs: limpeza de notificações e arquivos órfãos
- **Depende de:** T-7.6, T-6.6 · **Paralelo com:** T-7.7, T-7.8
- **Requisitos:** S123; §3.10
- **Arquivos:** `apps/api/src/jobs/{notificacoes-limpeza.ts,anexos-orfaos.ts,jobs-arquivos.test.ts,index.ts}`
- **Passos:**
  1. `notificacoes-limpeza`: lidas há mais de `notificacoes.retencaoDias` dias.
  2. `anexos-orfaos`: percorre `UPLOAD_DIR`, inclusive `tmp/`, com `opendir` recursivo. Arquivo com mais de 24 h e sem linha em `anexos` (checado em lotes de 500 chaves com `id in`) é removido.
- **Pronto quando:**
  - [ ] o órfão recente fica e o antigo sai;
  - [ ] o arquivo de um anexo existente fica;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P
