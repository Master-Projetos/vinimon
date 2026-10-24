# Revisão de performance (T-11.12)

Data: 2026-10-24 · Base: `origin/v2` · Banco: `vinimon_carga_test` (PostgreSQL 16.15 local, 4 vCPU compartilhadas com
agentes de E2E) · Requisitos: §4 (índices) e orçamento de `relatorios/design.md` §4.8 (W52).

## 1. Como reproduzir

```sh
export DATABASE_URL=postgresql://vinimon:vinimon@localhost:5432/vinimon_carga_test NODE_ENV=test \
  CSRF_SECRET=… ENCRYPTION_KEY=… APP_ORIGIN=http://localhost:3110 TRUST_PROXY=false   # valores do playwright.config.ts
pnpm --filter @vinimon/api exec prisma migrate deploy
pnpm --filter @vinimon/api exec tsx scripts/carga.ts popular            # ~30 s
pnpm --filter @vinimon/api exec tsx scripts/carga.ts explicar --saida /tmp/perf.json
pnpm --filter @vinimon/api exec tsx scripts/carga.ts sessao --quantas 20 # 1 cookie por operador
pnpm dlx autocannon@8.0.0 -c 1 -d 20 -H "cookie=<cookie>" http://localhost:3110/api/v1/chamados   # × 20 em paralelo
pnpm -F @vinimon/web build
```

`apps/api/scripts/carga.ts`:

- recusa qualquer `DATABASE_URL` cujo banco não termine em `_test` (esvazia o schema `public`);
- `popular`: `seedBase` + `seedInicial` e depois `INSERT … SELECT generate_series` em lote (determinístico, tudo
  derivado do índice; sem aleatoriedade). Resultado: **200 usuários** (admin + 40 operadores em 8 áreas + 159 usuários),
  **50.000 chamados** (≈ 11 min entre aberturas, ~382 dias; 6.000 em aberto, 44.000 encerrados, 5% cancelados),
  **300.000 assentamentos** (6 por chamado, 1 interno), 16.064 menções, 98.392 seguidores, 98.201 notificações, 85.694
  leituras, 50.001 eventos e um chamado seguido pelos 200 usuários com um evento `COMENTARIO` pendente. Respeita todos os
  CHECKs (`ck_chamados_*`, `ck_usuarios_*`, `ck_assentamentos_texto`) e as FKs (inclusive a composta de status);
- `explicar`: chama os **services reais** (`listar`, `contagens`, `listarAssentamentos`, `listarNotificacoes`,
  `contarNaoLidas`, `listarMencionaveis`, `buscar`, `obterPainel`, `gerarRelatorio`, `exportarChamados`,
  `processarEvento`), mede o tempo de cada chamada (20 repetições, p95), captura o SQL emitido via
  `prisma.$on('query')` e roda `EXPLAIN (ANALYZE, BUFFERS)` de cada consulta com os mesmos parâmetros (10 vezes, p95 do
  `Execution Time`; escrita roda numa transação desfeita). A consulta vira `Prisma.sql` parametrizada (nada de
  `$queryRawUnsafe`);
- `sessao`: cria sessões ATIVAS (mesma função `criarSessao` dos testes) para o autocannon. O rate limit global é de
  300 req/min **por usuário**, por isso a carga HTTP usa 20 operadores, uma instância do autocannon de 1 conexão cada
  (total `-c 20 -d 20`).

Usuário de referência das consultas: `carga.op.01` (OPERADOR, área 1: 6.250 chamados na área, ~1.250 atribuídos).
Admin = `admin` do seed (sem escopo). Todas as medições foram repetidas (2 rodadas); a tabela traz a 2ª, e a 1ª está
entre parênteses quando divergiu.

## 2. Consultas: tempo no banco e índice usado

"Maior consulta" = p95 do `Execution Time` da consulta mais cara da chamada; "serviço" = p95 do tempo de parede da
função do service (inclui todas as consultas, a montagem do DTO e o vaivém do driver).

| # | Consulta (service) | Índice(s) que o plano usa | Maior consulta p95 | Serviço p95 | Meta < 50 ms |
|---|---|---|---|---|---|
| 1 | Lista do operador, visão padrão (`listar`, 90 dias) | `ix_chamados_area_tipo` + `ix_chamados_operador_tipo` + `ix_chamados_solicitante` (BitmapOr) ∧ `ix_chamados_aberto_em`; página por `chamados_pkey` | 3,9 ms (7,6) | 21 ms (36) | passou |
| 2 | Lista do operador, `minha-fila` | `ix_chamados_operador_tipo` | 0,5 ms | 18 ms | passou |
| 3 | Fila aberta (`fila-aberta`) | `ix_chamados_area_tipo` ∧ `ix_chamados_status` | 1,0 ms | 12 ms | passou |
| 4 | SLA estourado (`sla=ESTOURADO`) | `ix_chamados_prazo_solucao` (parcial) ∧ `ix_chamados_aberto_em` | 6,4 ms (9,0) | 25 ms (39) | passou |
| 5 | Lista do usuário (`abertos-por-mim`) | `ix_chamados_solicitante` | 0,6 ms | 17 ms | passou |
| 6 | Busca na lista (`busca=impressora`) | `ix_chamados_busca_norm_trgm` ∧ escopo ∧ `ix_chamados_aberto_em` | 9,4 ms (16,5) | 29 ms (38) | passou |
| 7 | Timeline (`listarAssentamentos`, 50) | `ix_assentamentos_chamado` | 0,1 ms | 2,7 ms | passou |
| 8 | Feed de notificações (`listarNotificacoes`) | `ix_notificacoes_feed` + `chamados_pkey` | 0,2 ms | 4,7 ms | passou |
| 9 | Contagem de não lidas (`contarNaoLidas`) | `ix_notificacoes_nao_lidas` (parcial) | 0,2 ms | 4,8 ms | passou |
| 10 | Menção (`listarMencionaveis`, trigram) | `ix_usuarios_busca_norm_trgm`, `chamado_seguidores_pkey`, `ix_assentamentos_chamado` | 0,1 ms | 4,6 ms | passou |
| 11 | Busca global (`buscar q=impressora`) | `chamados_pkey` (backward + LIMIT 5; termo comum) | 0,3 ms | 7,1 ms | passou |
| 12 | Contagens das visões, operador (8 counts) | `ix_chamados_operador_tipo`, `ix_chamados_area_tipo`, `ix_chamados_status`, `ix_chamados_solicitante` | 16,7 ms (18,9) | 46 ms (52) | passou (por consulta) |
| 13 | Contagens das visões, admin | **Seq Scan** em `chamados` (`encerrados`, `todos`, `minha-area`) | 39,0 ms (37,4) | 86 ms (84) | passou no limite (D3) |
| 14 | Painel, operador (8 counts + groupBy, 90 dias) | `ix_chamados_area_tipo`, `ix_chamados_jornada_em_aberto`, `ix_chamados_prazo_solucao`, `ix_chamados_aberto_em`, `ix_chamados_encerrado_em` | 6,8 ms (9,1) | 77 ms (97) | passou |
| 15 | Painel, admin | **Seq Scan** em `chamados` no count "em aberto" (`status_tipo IN (…)`) | 49,3 ms (54,9) | 151 ms (160) | **falhou na 1ª rodada** (D2) |
| 16 | Relatório `por-area`, 366 dias | **Seq Scan** em `chamados` (o período cobre ~92% da tabela) | 41,9 ms (58,6) | 197 ms (204) | **falhou na 1ª rodada** (D1) |
| 17 | Relatório `sla`, 366 dias (17 consultas) | **Seq Scan** em `chamados` | 54,7 ms (57,8) | 266 ms (324) | **falhou** (D1) |
| 18 | Exportação de 5.000 linhas (10 lotes de 500, 81 consultas) | `chamados_pkey` (keyset `id > cursor`) + `uq_status_id_tipo` | 1,4 ms (5,4) | 532 ms (584) | passou no banco (D4: tempo no Node) |
| 19 | `processarEvento` com 200 seguidores (8 consultas) | `ix_eventos_pendentes`, `chamados_pkey`, `chamado_seguidores_pkey`, `ix_notificacoes_nao_lidas` | 10,5 ms | 50 ms (45) | passou |

Nenhuma consulta quente (1–12, 14, 18, 19) faz Seq Scan em tabela grande; os Seq Scans restantes são em `status`,
`prioridades`, `areas`, `problemas`, `usuarios` (≤ 200 linhas, < 0,1 ms), que é o plano certo.

### Trechos dos planos

Lista do operador (count da visão padrão):

```
Aggregate (actual time=3.677..3.681 rows=1)
  ->  Bitmap Heap Scan on chamados (actual time=2.047..2.960 rows=1473)
        Recheck Cond: (((area_id = 1) OR (operador_id = 2) OR (solicitante_id = 2)) AND (aberto_em >= '2026-07-26 …'))
        ->  BitmapAnd
              ->  BitmapOr
                    ->  Bitmap Index Scan on ix_chamados_area_tipo   Index Cond: (area_id = 1)
                    ->  Bitmap Index Scan on ix_chamados_operador_tipo   Index Cond: (operador_id = 2)
                    ->  Bitmap Index Scan on ix_chamados_solicitante   Index Cond: (solicitante_id = 2)
              ->  Bitmap Index Scan on ix_chamados_aberto_em
Execution Time: 3.7 ms
```

Fila aberta:

```
->  Bitmap Heap Scan on chamados (rows=237)
      Recheck Cond: ((area_id = 1) AND (status_tipo = 'ABERTO') AND (j0.id = status_id))
      ->  BitmapAnd
            ->  Bitmap Index Scan on ix_chamados_area_tipo   Index Cond: ((area_id = 1) AND (status_tipo = 'ABERTO'))
            ->  Bitmap Index Scan on ix_chamados_status      Index Cond: (status_id = j0.id)
Execution Time: 0.5 ms
```

SLA estourado:

```
->  Bitmap Heap Scan on chamados (rows=506)
      Recheck Cond: ((prazo_solucao_em < now) AND (concluido_em IS NULL) AND (aberto_em >= …))
      ->  BitmapAnd
            ->  Bitmap Index Scan on ix_chamados_prazo_solucao (rows=4133)
            ->  Bitmap Index Scan on ix_chamados_aberto_em (rows=11781)
Execution Time: 4.4 ms
```

Busca na lista (trigram):

```
->  Bitmap Index Scan on ix_chamados_busca_norm_trgm (rows=9500)   Index Cond: (busca_norm ~~ '%impressora%')
Execution Time: 5.9 ms
```

Feed e não lidas:

```
Limit (rows=21)
  ->  Index Scan using ix_notificacoes_feed on notificacoes   Index Cond: (usuario_id = 2)
  ->  Index Scan using chamados_pkey on chamados j0   Filter: ((area_id = 1) OR (operador_id = 2) OR (solicitante_id = 2))
Execution Time: 0.12 ms
---
->  Index Scan using ix_notificacoes_nao_lidas on notificacoes (rows=42)   Index Cond: (usuario_id = 2)
Execution Time: 0.20 ms
```

Menção (trigram em usuários):

```
->  Bitmap Index Scan on ix_usuarios_busca_norm_trgm   Index Cond: (busca_norm ~~ '%silva%')
Execution Time: 0.1 ms
```

Exportação (um lote, keyset):

```
Limit (rows=500)
  ->  Index Scan using chamados_pkey on chamados   Index Cond: (id > 500)
  ->  Memoize -> Index Scan using uq_status_id_tipo on status j0
Execution Time: 0.68 ms
```

`processarEvento` (pior consulta: `groupBy` de não lidas pós-fanout para os destinatários):

```
GroupAggregate (actual time=6.541..6.588 rows=7)
  ->  Index Scan using ix_notificacoes_nao_lidas … / chamados_pkey (Nested Loop por destinatário)
Execution Time: ~6.6 ms (p95 10.5 ms)
```

Painel admin, count "em aberto" (D2):

```
Aggregate (actual time=27.787..27.790 rows=1)
  ->  Hash Join
        ->  Seq Scan on chamados (rows=5398)
              Filter: (status_tipo = ANY ('{ABERTO,EM_ATENDIMENTO,PENDENTE,AGENDADO}'))
              Rows Removed by Filter: 44602
Execution Time: 27.8 ms   (42–55 ms nas outras repetições)
```

Teste com índice provisório `(status_tipo, id DESC)` criado e removido no banco de carga (sem migração): o mesmo count
caiu para **9,5 ms** (BitmapAnd de `status_tipo` com `ix_chamados_status`).

Relatório `sla`, 366 dias (D1):

```
HashAggregate  Group Key: problema_id, sla_solucao_cumprido
  ->  Seq Scan on chamados (rows=40363)
        Filter: ((NOT cancelado) AND (sla_solucao_cumprido IS NOT NULL) AND (aberto_em >= '2025-10-24 …') AND (aberto_em <= '2026-10-25 …'))
        Rows Removed by Filter: 9637
Execution Time: 36.0 ms   (p95 54.7 ms)
```

Com 92% das linhas no período, o Seq Scan é o plano correto: um índice não ajuda; o custo vem de o relatório `sla`
varrer a tabela 17 vezes (5 totais + 12 por dimensão).

## 3. `GET /api/v1/chamados` (HTTP)

API em `tsx src/server.ts` (NODE_ENV=test, porta 3110, `JOBS_HABILITADOS=false`, `LOG_LEVEL=warn`), 20 operadores, 20
instâncias de `autocannon@8.0.0 -c 1 -d 20` em paralelo na mesma máquina de 4 vCPU (o gerador de carga disputa CPU com a
API e o Postgres).

| Rodada | Requisições | req/s | 2xx | não-2xx | média | p50 (mediana) | p90 (pior instância) | p97,5 (mediana / pior) | p99 (pior) | máx |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2.542 | 127 | 2.542 | 0 | 157 ms | 152 ms | 214 ms | 250 / 307 ms | 326 ms | 446 ms |
| 2 | 2.426 | 121 | 2.426 | 0 | 164 ms | 160 ms | 221 ms | 275 / 315 ms | 339 ms | 391 ms |

O autocannon não publica p95; ele fica entre o p90 (≤ 221 ms em todas as instâncias) e o p97,5 (mediana 250–275 ms),
portanto **p95 < 300 ms: passou**, mas com pouca folga. A latência é quase toda fila: a mesma chamada sem concorrência
custa ~21–36 ms no service (tabela, linha 1) e o processo único do Node satura em ~125 req/s neste host.

## 4. Bundle do web

`pnpm -F @vinimon/web build` (Vite 8 / rolldown, `autoCodeSplitting`). Medido com um script que segue o fecho de
`import` estáticos a partir do `index.html` (entrada + `modulepreload`) e de cada chunk de rota; gzip nível 9, kB = 1.000
bytes.

| Conjunto | gzip | Orçamento | Resultado |
|---|---|---|---|
| Shell (entrada + preloads do `index.html`) | 204,7 kB | — | — |
| `/login` (shell + `login-*.js` e fecho: `auth-layout`, `form`, `input-otp`, `password-input`…) | **230,1 kB** | ≤ 200 kB | **falhou** (D5) |
| Shell + `_app` + `/chamados` (`route.tsx` + `index.tsx`) | 327 kB | ≤ 350 kB | passou |
| Shell + `_app` + `/painel` (com Recharts) | 398 kB | — | (só referência) |

Chunks pesados e onde estão:

- Recharts: `stat-card-*.js` (104,7 kB gzip) e `painel-*.js`, carregados só por `painel` e `_relatorio`: **passou**;
- react-markdown: `markdown-*.js` (45,1 kB), carregado só por `_chamadoId`, `_artigoId` e `markdown-editor`: **passou**;
- qrcode: `esm-*.js` (5,8 kB), só em `configurar-2fa` e `inventario`: **passou**;
- zxcvbn: `dist-3H1nCAPe.js` (216,5 kB) e `dist-CcMXchhT.js`, só em `trocar-senha-form`: fora do inicial.

No chunk inicial (`index-*.js`, 106,7 kB) entram React DOM, TanStack Router/Query, ícones lucide e também
**`socket.io-client` + `engine.io-client`**, puxados por `features/auth/queries.ts → lib/socket.ts` (o `useSair` chama
`tempoRealAtual()?.encerrar()`), embora o socket só seja usado dentro de `_app`. Experimento (revertido): trocar esse
import por `import('@/lib/socket')` dinâmico reduz o shell para 192,1 kB e o `/login` para 217,5 kB: ganha 12,6 kB, mas
não basta para o orçamento. Os outros grandes do `/login` são `api-*.js` (28 kB: contratos e schemas Zod de
`@vinimon/shared` de todos os módulos), `matchContext` (19,7 kB, router), `form` (14,2 kB) e `input-otp` (4,4 kB).

## 5. Desvios e propostas de tarefa

Nenhuma migração foi criada: o único Seq Scan evitável (D2) está numa consulta de painel de admin, não numa consulta
quente, e fica no limite da meta; vai como proposta, para não mexer no schema fora da lista de arquivos desta tarefa.

| Id | Desvio | Proposta de tarefa |
|---|---|---|
| D1 | Relatórios `sla` e `por-area` em 366 dias: Seq Scan inevitável (92% da tabela), 40–58 ms por consulta, 9–17 varreduras por relatório (serviço 200–320 ms). | **T-11.12a — Relatórios em uma varredura**: em `relatorios/service.ts`, calcular totais e dimensões numa única consulta agregada por relatório (`GROUP BY GROUPING SETS` via `$queryRaw` tipado, ou `groupBy` com os contadores condicionais) em vez de 5 `count` + N `groupBy`; meta < 50 ms por consulta e < 150 ms no serviço com 50 mil chamados. Opcional na Fase 2: tabela de resumo diário. |
| D2 | Painel do admin: count "em aberto" (`status_tipo IN (ABERTO, EM_ATENDIMENTO, PENDENTE, AGENDADO)` sem escopo) faz Seq Scan, 42–55 ms. | **T-11.12b — Índice `ix_chamados_status_tipo`**: nova migração com `@@index([statusTipo, id(sort: Desc)], map: "ix_chamados_status_tipo")` em `Chamado` (ou trocar o filtro do painel por `concluidoEm: null`, que já tem índices parciais); medido aqui: 9,5 ms. Repetir `carga.ts explicar`. |
| D3 | Contagens das visões do admin (`encerrados`, `todos`, `minha-area` sem escopo) varrem a tabela: 24–39 ms cada, 86 ms no total, executadas a cada invalidação de lista. | **T-11.12c — Contagens baratas para quem vê tudo**: para perfil com `chamado.verTodos`, limitar `encerrados`/`todos` à mesma janela padrão da lista (90 dias, com `ix_chamados_aberto_em`) ou não contar essas duas visões (o badge só é útil nas filas em aberto); ajustar o contrato `ChamadoContagens` e a tela. |
| D4 | Exportação de 5.000 linhas: 532–584 ms, quase tudo no Node (81 consultas somam 14–20 ms no banco: 8 por lote de 500, por causa dos `select` de relações). | **T-11.12d — Exportação com menos idas ao banco**: carregar os nomes de relação (status, prioridade, área, problema, pessoas) uma vez por exportação em mapas e selecionar só ids no lote; meta < 250 ms para 5.000 linhas. Não bloqueia (limite é de 50 mil linhas e roda em stream). |
| D5 | JS inicial de `/login` = 230,1 kB gzip (> 200 kB); o shell sozinho já tem 204,7 kB. | **T-11.12e — Emagrecer o shell**: (1) `features/auth/queries.ts` sem import estático de `lib/socket` (−12,6 kB, medido); (2) tirar de `api-*.js` os contratos de módulos que o shell não usa (importar `authApi`/`metaApi` por caminho em vez do barril `@vinimon/shared`, ou separar `@vinimon/shared/http`); (3) carregar `input-otp` só no passo de 2FA. Conferir de novo com `pnpm -F @vinimon/web build`. |
| D6 | `GET /chamados` com 20 conexões: p95 entre 221 e 275 ms, folga pequena para a meta de 300 ms neste host (4 vCPU compartilhadas, um processo Node). | Sem tarefa de código. Repetir a medição em homologação (host dedicado, `node dist/server.mjs`) durante T-11.11/T-11.6. |

## 6. O que não foi medido

- Carga HTTP com um único usuário em `-c 20`: o rate limit global (300/min por usuário) devolve 429 depois de 300
  requisições, então a medição usa 20 operadores; isso também significa que a mesma página do mesmo operador não foi
  martelada.
- Login real por HTTP (senha + TOTP): as sessões vêm de `criarSessao`, como nos testes da API; o caminho de autenticação
  medido é só o de carregar a sessão do cookie.
- Endpoints fora do cartão (detalhe do chamado, histórico, leituras) e tempo real (socket) não entraram.
- Medições em PostgreSQL 16.15 (o local); produção usa o 18.6 (§2). Os planos dependem de `ANALYZE`, que a carga roda
  no fim.
