> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 4 — SLA, jornadas e feriados

### T-4.1 — Calendário de SLA
- **Depende de:** T-1.6 · **Paralelo com:** Fase 3
- **Requisitos:** D02, D03; §4.6 (`calendario.ts`, casos 1–18 e 28)
- **Arquivos:** `apps/api/src/modules/sla/{calendario.ts,calendario.test.ts}`, `apps/api/package.json` (script)
- **Passos:**
  1. Copiar `calendario.ts` literal.
  2. Testes de tabela 1–18 e 28; o 12 usa `fast-check` com `fc.assert(fc.property(...), { numRuns: 300, seed: 42 })`.
  3. Script `"test:sla-tz": "TZ=UTC vitest run src/modules/sla && TZ=Asia/Tokyo vitest run src/modules/sla"`.
- **Pronto quando:**
  - [ ] `pnpm -F @vinimon/api test:sla-tz` verde nos dois fusos;
  - [ ] o caso 18 roda em menos de 50 ms;
  - [ ] `pnpm verificar`.
- **Modelo:** Sonnet
- **Tamanho:** M

### T-4.2 — Recálculo e situação de SLA
- **Depende de:** T-4.1 · **Paralelo com:** Fase 3
- **Requisitos:** D01, D04–D06; §4.6 (`recalculo.ts`, `shared/sla.ts`, casos 19–26)
- **Arquivos:** `apps/api/src/modules/sla/{recalculo.ts,recalculo.test.ts}`, `packages/shared/src/{sla.ts,sla.test.ts,index.ts}`
- **Passos:** copiar literal e escrever os casos 19–26.
- **Pronto quando:**
  - [ ] `test:sla-tz` verde;
  - [ ] `pnpm -F @vinimon/shared test`;
  - [ ] `pnpm verificar`.
- **Modelo:** Sonnet
- **Tamanho:** P

### T-4.3 — Porta de filas, serviço de SLA e transição de status
- **Depende de:** T-4.2, T-3.1 · **Paralelo com:** —
- **Requisitos:** §3.10 (`lib/filas.ts`), §4.6 (serviço, passos e caso 27)
- **Arquivos:** `apps/api/src/lib/filas.ts`, `apps/api/src/modules/sla/{service.ts,service.test.ts}`, `apps/api/test/fabricas.ts`
- **Passos:**
  1. `lib/filas.ts`:
     - `interface Filas { enviar(fila: string, dados: object, opcoes?: { startAfter?: number; singletonKey?: string; retryLimit?: number; retryBackoff?: boolean }): Promise<void> }` (mesmos nomes do `SendOptions` do pg-boss 12.38; o adaptador da T-7.6 repassa as opções sem mudança);
     - `filasEmMemoria` guarda as chamadas em `enviados[]`;
     - `definirFila(impl)`, `enfileirar(...)`, `limparFilaMemoria()`.
     - O padrão é a memória; o pg-boss é ligado na T-7.6.
  2. `service.ts`:
     - `carregarCalendario` com `Map<jornadaId,{cal,ate}>` (TTL 60 s) + `invalidarCalendario(jornadaId?)`;
     - `snapshotSla`, `recalcularChamado`, `aplicarTransicaoStatus`, exatamente os passos da §4.6.
     - Lê `sla.alertaPct` via `obterConfig()`. Pausas = estágios com `pausaSla` mais `{inicio: statusDesde, fim: null}` se `slaPausado`.
  3. `fabricas.criarChamado({ solicitanteId, areaId, papel?='INICIAL', operadorId?, problemaId?, abertoEm? })`: insere direto pelo Prisma, com `statusTipo` coerente, `abertoPorId=solicitante`, `canalId=web`, `jornadaId=24x7`, prioridade padrão e `versao 0`.
- **Pronto quando:**
  - [ ] caso 27 (ABERTO → PENDENTE → EM_ATENDIMENTO → CONCLUIDO → rejeitado → CONCLUIDO): estágios e prazos iguais ao `recalcularSla` direto;
  - [ ] `versao` errada dá `CONFLITO`;
  - [ ] `pnpm verificar`.
- **Modelo:** Sonnet
- **Tamanho:** M

### T-4.4 — Jornadas
- **Depende de:** T-4.3 · **Paralelo com:** T-4.5
- **Requisitos:** D02; padrão de cadastro
- **Arquivos:** padrão de cadastro com `<m>=jornadas`
- **Passos:**
  1. Body `{nome, timezone (regex IANA), ininterrupta, ativo, horarios: z.array({diaSemana 0–6, inicioMin 0–1439, fimMin 1–1440}).max(28)}`. `refine`: `fim > inicio`, sem sobreposição no mesmo dia, e não ininterrupta exige ≥ 1 horário.
  2. Update troca todos os `JornadaHorario` na transação.
  3. Depois do commit: `invalidarCalendario(id)` + `enfileirar('sla-recalcular-jornada', {jornadaId:id})`.
  4. Excluir jornada em uso (área, chamado ou `sla.jornadaPadraoId`) dá 409.
- **Pronto quando:**
  - [ ] sobreposição dá 400;
  - [ ] edição enfileira (`filasEmMemoria.enviados`);
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** P

### T-4.5 — Feriados
- **Depende de:** T-4.3 · **Paralelo com:** T-4.4
- **Requisitos:** D03; §4.6 (datas `@db.Date`)
- **Arquivos:** padrão de cadastro com `<m>=feriados`
- **Passos:**
  1. Body `{data: z.iso.date(), nome, recorrente, jornadaId: nullable}`. Recorrente é gravado com o ano 2000. Na resposta, `data: z.iso.date()`; o service devolve `data: f.data.toISOString().slice(0, 10)` e grava `new Date(`${data}T00:00:00Z`)` (o ano é trocado por 2000 quando recorrente).
  2. Lista com filtro `ano` (recorrentes sempre incluídos).
  3. Depois do commit: invalidar o calendário e enfileirar o recálculo para a jornada, ou para todas as ativas se `jornadaId=null`.
- **Pronto quando:**
  - [ ] `2026-12-25` recorrente volta como `2000-12-25` com `recorrente:true`;
  - [ ] o enfileiramento acontece;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** P
