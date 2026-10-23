> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 8 — Painel, relatórios, conhecimento e inventário

### T-8.1 — Painel
- **Depende de:** T-5.10 · **Paralelo com:** T-8.2–T-8.5
- **Requisitos:** S44, S45; G03; T34 (painel)
- **Arquivos:** `packages/shared/src/{modulos/painel.ts,index.ts}`, `apps/api/src/modules/painel/{service.ts,routes.ts,painel.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `GET /painel?periodo=7|30|90&areaId=&modoArea=destino|origem` (`painel.ver`).
  2. Base `AND: [escopoChamados(u), naoIgnorado, filtroArea]`. `origem` filtra `solicitante.areaId`.
  3. KPIs com `count` (os 8 da §6.3). Séries:
     - abertos × encerrados por mês: 8 `prisma.chamado.count` no mesmo `$transaction` (4 meses × {`abertoEm: { gte: inicioMes, lt: inicioProximo }`, `encerradoEm: { gte, lt }`}), com o mesmo `where` base. Os limites de mês são calculados no fuso `sistema.timezone` com `Intl`/luxon. Proibido `findMany` sem `take` no painel;
     - por status, prioridade e área: `groupBy` + um `findMany` de nomes;
     - avaliações do mês.
  4. Tabela "SLA mais próximo": 5 itens.
  5. USUARIO recebe a versão reduzida: só os próprios.
- **Pronto quando:**
  - [ ] as contagens do OPERADOR consideram só o escopo;
  - [ ] nenhuma query carrega todos os chamados (`take` ou `groupBy` em toda consulta);
  - [ ] com `prisma.$on('query')`, nenhuma query do painel é `SELECT` de `chamados` sem `LIMIT`, `COUNT` ou `GROUP BY`;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-8.2 — Relatórios, parte 1
- **Depende de:** T-5.10 · **Paralelo com:** T-8.1, T-8.3–T-8.5
- **Requisitos:** S58; G04
- **Arquivos:** `packages/shared/src/{modulos/relatorios.ts,index.ts}`, `apps/api/src/modules/relatorios/{service.ts,routes.ts,relatorios.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `GET /relatorios/:tipo?de=&ate=&areaId=&operadorId=` (`relatorio.ver`), com `tipo ∈ z.enum([...8])` e período de até 366 dias.
  2. Tipos `visao-geral`, `por-status`, `por-area`, `por-problema`, `por-operador` e `por-solicitante`, por `groupBy` dentro do escopo. Linhas `{chave, nome, total, encerrados, pctNoPrazo, tempoMedioSolucaoUtilMin}`, com média de `tempoSolucaoUtilMin` e cancelados excluídos dos indicadores.
- **Pronto quando:**
  - [ ] fixture com resultado conhecido;
  - [ ] período de 400 dias dá 400;
  - [ ] T34 (relatórios): OPERADOR da área A, fixture com chamados em A e B: os 8 tipos de `GET /relatorios/:tipo` somam só A; `areaId=<B>` ou `operadorId=<operador de B>` devolve totais 0;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-8.3 — Relatórios, parte 2: SLA, avaliações e CSV
- **Depende de:** T-8.2 · **Paralelo com:** T-8.1, T-8.4, T-8.5
- **Requisitos:** S82, S87; G04
- **Arquivos:** `apps/api/src/modules/relatorios/{service.ts,routes.ts,csv.ts,relatorios-sla.test.ts}`, `packages/shared/src/modulos/relatorios.ts` (formas de `sla` e `avaliacoes`) e `apps/api/src/modules/relatorios/relatorios.test.ts` (o teste da T-8.2 que exigia 404 para `sla` deixa de valer)
- **Passos:**
  1. `sla`: % dentro do prazo de resposta e de solução, por área e por problema.
  2. `avaliacoes`: distribuição por nota, % automáticas e média por operador (OTIMO=4 … RUIM=1).
  3. `GET /relatorios/:tipo/csv`: stream com `linhaCsv` e auditoria `exportacao.csv`.
- **Pronto quando:**
  - [ ] os percentuais batem com a fixture;
  - [ ] o CSV neutraliza fórmulas;
  - [ ] o mesmo T34 da T-8.2 vale para `GET /relatorios/:tipo/csv`;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-8.4 — Artigos (base de conhecimento)
- **Depende de:** T-3.10, T-6.1 · **Paralelo com:** T-8.1–T-8.3, T-8.5
- **Requisitos:** S108; F01, B20; §4.3 (sugestão)
- **Arquivos:** `packages/shared/src/{modulos/artigos.ts,index.ts}`, `apps/api/src/modules/artigos/{service.ts,routes.ts,artigos.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `GET /artigos?busca=&categoriaId=&problemaId=&pagina=`.
  2. Visibilidade (`whereVisibilidade(u)`): sem `conhecimento.verInterno`, `situacao=PUBLICADO` e `visibilidade=PUBLICO`. Sem `conhecimento.gerenciar`, nunca RASCUNHO nem ARQUIVADO de outros.
  3. `GET /artigos/:id`: incrementa `visualizacoes` com `updateMany` atômico.
  4. `GET /artigos/sugestoes?q=&problemaId=`: o `$queryRaw` da §4.3, com no máximo 5.
  5. `POST/PATCH/DELETE` (`conhecimento.gerenciar`): `problemaIds` N:N; `publicadoEm` na primeira publicação; auditoria `cadastro.*`.
  6. `POST /artigos/:id/voto {util}`: upsert em `ArtigoVoto`.
- **Pronto quando:**
  - [ ] USUARIO recebe 404 em artigo INTERNO;
  - [ ] a sugestão encontra "impressora" em "Impressora não imprime";
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-8.5 — Ativos (inventário básico)
- **Depende de:** T-3.9, T-5.6 · **Paralelo com:** T-8.1–T-8.4
- **Requisitos:** S51; I01, I02
- **Arquivos:** `packages/shared/src/{modulos/ativos.ts,index.ts}`, `apps/api/src/modules/ativos/{service.ts,routes.ts,ativos.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `GET /ativos/busca?q=` (`autenticado`, ≥ 3 caracteres, ≤ 10 resultados): `{id, etiqueta, tipo}`.
  2. `GET /ativos` e `/:id` (`inventario.ver`), com filtros `tipoId`, `situacao`, `departamentoId` e `busca`. A resposta traz `qtdChamados` via `_count`.
  3. `GET /ativos/:id/chamados`: dentro do escopo.
  4. `POST/PATCH` (`inventario.gerenciar`): etiqueta conforme `ck_ativos_etiqueta`, unique.
  5. `DELETE` (`cadastro.gerenciar`): ativo com chamados dá 409 com a mensagem "Use a situação Baixado".
- **Pronto quando:**
  - [ ] busca com 2 caracteres dá 400;
  - [ ] USUARIO em `GET /ativos` dá 403;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M
