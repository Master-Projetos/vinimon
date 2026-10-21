> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 16 — (Fase 2) Tempo, comunicação, conhecimento e consultas

### T-16.1 — Registro de horas
- **Depende de:** MVP · **Paralelo com:** T-16.3–T-16.5
- **Requisitos:** D07
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração (SQL extra), `packages/shared/src/modulos/periodos.ts`, `packages/shared/src/enums.ts`, `apps/api/src/lib/enums-check.ts` (`TipoNotificacao.PARTICIPANTE`), `apps/api/src/plugins/erros.ts`, `apps/api/src/modules/periodos/{service.ts,routes.ts,periodos.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. Model `PeriodoAtendimento {id, chamadoId, operadorId, inicio, fim, descricao VarChar(500)?, autorId, criadoEm}`.
  2. SQL extra: `CREATE EXTENSION IF NOT EXISTS btree_gist;` e `ALTER TABLE periodos_atendimento ADD CONSTRAINT ex_periodos_sobreposicao EXCLUDE USING gist (operador_id WITH =, tstzrange(inicio, fim) WITH &&);`, mais o CHECK `fim > inicio`.
  3. P2039 com `originalCode === "23P01"` → 409 "Período sobrepõe outro do mesmo operador".
  4. `fim ≤ agora`.
  5. CRUD `/chamados/:id/periodos` (`podeAtender`); edita só o autor.
  6. Notificação `PARTICIPANTE` (novo tipo) aos operadores citados.
- **Pronto quando:**
  - [ ] sobreposição dá 409;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M

### T-16.2 — Tempo em fila direta e participações
- **Depende de:** T-16.1 · **Paralelo com:** T-16.3–T-16.5
- **Requisitos:** D08, G05 (parte)
- **Arquivos:** `apps/api/src/modules/relatorios/{tempos.ts,tempos.test.ts,routes.ts}`, `packages/shared/src/modulos/relatorios.ts`
- **Passos:**
  1. Relatório `tempos-operador`: soma, por `ChamadoEstagio` com tipo EM_ATENDIMENTO ou PENDENTE e `operadorId`, o tempo útil (`msUteisEntre` com o calendário do chamado) e o absoluto. Inclui as horas informadas (D07).
  2. Relatório `participacoes`: direto, encaminhado, auxiliar e por períodos, sem contagem dupla.
- **Pronto quando:**
  - [ ] fixture com valores conhecidos;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M

### T-16.3 — Mural de avisos
- **Depende de:** MVP · **Paralelo com:** T-16.1, T-16.4, T-16.5
- **Requisitos:** E02
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/{modulos/avisos.ts,realtime.ts}`, `apps/api/src/modules/avisos/{service.ts,routes.ts,avisos.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. Models `Aviso {id, titulo VarChar(60), texto Text, areaIds Int[] (vazio = todos), validoAte?, recorrente, ativo, autorId, criadoEm}` e `AvisoVisto {avisoId, usuarioId, ultimaExibicao, @@id}`.
  2. `GET /avisos/pendentes`: os não vistos; os recorrentes não vistos hoje no fuso.
  3. `POST /avisos/:id/visto`.
  4. CRUD admin (`cadastro.gerenciar`).
  5. Socket `aviso:novo` para os usuários das áreas.
- **Pronto quando:**
  - [ ] o não recorrente aparece uma vez;
  - [ ] o recorrente reaparece no dia seguinte (relógio);
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M

### T-16.4 — Busca em soluções e soluções padrão
- **Depende de:** MVP · **Paralelo com:** T-16.1, T-16.3, T-16.5
- **Requisitos:** F02, F03; S60, S62
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração (trigger), `packages/shared/src/modulos/solucoes.ts`, `apps/api/src/modules/solucoes/{service.ts,routes.ts,solucoes.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `Chamado.buscaSolucao Unsupported("tsvector")?` com índice GIN, trigger em `assunto`, `descricao` e `solucao` (pesos A, B, C, `f_unaccent`) e backfill `UPDATE chamados SET solucao = solucao`.
  2. `GET /solucoes/busca?q=&incluirComentarios=&incluirNaoConcluidos=&pagina=` (`chamado.atender`):
     - os ids candidatos vêm do Prisma com `escopoChamados` (até 2000);
     - o ranking usa `$queryRaw` com `id = ANY(${ids})`;
     - tokens com `-` viram `!tok`;
     - `incluirComentarios`: o ranking dos assentamentos usa `a.interno = false OR (c.solicitante_id <> ${u.id} AND ${podeAtenderSql})`, em que a segunda condição só entra se `temPermissao(u.perfil,'chamado.atender')`. O trecho devolvido nunca vem de assentamento interno para quem não passa em `podeVerInterno`.
  3. Model `SolucaoPadrao {id, titulo, texto, ativo}` com CRUD (`conhecimento.gerenciar`).
- **Pronto quando:**
  - [ ] a busca respeita o escopo;
  - [ ] `-impressora` exclui;
  - [ ] OPERADOR solicitante não encontra o próprio chamado por termo que só existe em nota interna;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M

### T-16.5 — Filtros salvos, colunas salvas e XLSX
- **Depende de:** MVP · **Paralelo com:** T-16.1, T-16.3, T-16.4
- **Requisitos:** G02, filtros salvos
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/filtros-salvos.ts`, `apps/api/src/modules/filtros-salvos/{service.ts,routes.ts,filtros.test.ts}`, `apps/api/src/modules/chamados/exportar.ts`
- **Passos:**
  1. Model `FiltroSalvo {id, usuarioId, nome VarChar(80), filtros Json (ChamadoFiltros), compartilhadoAreaId Int?, criadoEm, @@unique([usuarioId, nome])}`. O compartilhado é visível para operadores da área.
  2. `Usuario.preferenciasUi Json?`, validado por `{colunasChamados: {id: string, visivel: boolean}[]}` e lido no `PATCH /me`.
  3. XLSX: `npm view exceljs version`, fixar a versão exata publicada há mais de 24 h; `GET /chamados/exportar?formato=xlsx` com `ExcelJS.stream.xlsx.WorkbookWriter` e as mesmas proteções contra fórmula (strings).
  4. PDF: via impressão do navegador ("Salvar como PDF"), sem biblioteca.
- **Pronto quando:**
  - [ ] o XLSX abre (o teste lê de volta com exceljs) e a célula `=1+1` vem como texto;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M

### T-16.6 — Relatórios avançados
- **Depende de:** T-14.3, T-14.1 · **Paralelo com:** T-16.2
- **Requisitos:** G05
- **Arquivos:** `apps/api/src/modules/relatorios/{avancados.ts,avancados.test.ts,routes.ts}`, `packages/shared/src/modulos/relatorios.ts`
- **Passos:** tipos `mudancas-status` (de `ChamadoEvento` STATUS_ALTERADO, matriz de→para), `por-campo/:chave`, `por-categoria/:grupo` e `quadro-area` (totais, SLA e avaliações por área).
- **Pronto quando:**
  - [ ] fixture;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M

### T-16.7 — Tela: aba Tempo
- **Depende de:** T-16.1 · **Paralelo com:** T-16.8–T-16.11
- **Requisitos:** D07
- **Arquivos:** `apps/web/src/routes/_app/chamados/$chamadoId/tempo.tsx`, `apps/web/src/features/tempo/{queries.ts,components/tempo-view.tsx,components/periodo-dialog.tsx}`, `apps/web/src/routes/_app/chamados/$chamadoId/route.tsx`
- **Passos:** aba "Tempo" (só equipe) com total, tabela e diálogo de período (data, início, fim).
- **Pronto quando:**
  - [ ] sobreposição mostra erro;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** P

### T-16.8 — Telas: mural de avisos
- **Depende de:** T-16.3 · **Paralelo com:** T-16.7, T-16.9–T-16.11
- **Requisitos:** E02
- **Arquivos:** `apps/web/src/routes/_app/admin/avisos.tsx`, `apps/web/src/features/avisos/{queries.ts,components/aviso-popup.tsx,components/aviso-sheet.tsx}`, `apps/web/src/routes/_app.tsx`
- **Passos:** pop-up ao entrar, que fecha marcando como visto, e admin com tabela e Sheet.
- **Pronto quando:**
  - [ ] o aviso não volta depois de visto;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** P

### T-16.9 — Telas: filtros salvos, colunas e XLSX
- **Depende de:** T-16.5 · **Paralelo com:** T-16.7, T-16.8, T-16.10, T-16.11
- **Requisitos:** G02
- **Arquivos:** `apps/web/src/features/filtros-salvos/{queries.ts,components/salvar-filtro-dialog.tsx}`, `apps/web/src/features/chamados/components/{visoes-pane.tsx,chamados-table.tsx}`, `apps/web/src/routes/_app/chamados/index.test.tsx`
- **Passos:**
  1. Seção "Filtros salvos" no `VisoesPane` (renomear, compartilhar, excluir).
  2. As colunas passam a persistir no servidor.
  3. Botão XLSX.
- **Pronto quando:**
  - [ ] o filtro aparece em outra sessão do mesmo usuário;
  - [ ] `chamados/index.test.tsx` (salvar filtro faz `POST /filtros-salvos` com os filtros da URL) com `renderRota` + `apiFalsa` (T-9.16): (a) renderiza com os dados; (b) o submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** M

### T-16.10 — Telas: busca em soluções e soluções padrão
- **Depende de:** T-16.4 · **Paralelo com:** T-16.7–T-16.9, T-16.11
- **Requisitos:** F02, F03
- **Arquivos:** `apps/web/src/routes/_app/solucoes.tsx`, `apps/web/src/routes/_app/admin/solucoes-padrao.tsx`, `apps/web/src/features/solucoes/queries.ts`, `apps/web/src/features/chamados/components/concluir-dialog.tsx`, `apps/web/src/routes/_app/{solucoes.test.tsx,admin/solucoes-padrao.test.tsx}`
- **Passos:**
  1. Página de busca com opções.
  2. Admin de soluções padrão.
  3. No diálogo de concluir, "Usar solução padrão", que copia o texto e o deixa editável.
- **Pronto quando:**
  - [ ] `solucoes.test.tsx` e `solucoes-padrao.test.tsx` com `renderRota` + `apiFalsa` (T-9.16): (a) renderiza com os dados; (b) o submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** P

### T-16.11 — Telas: relatórios avançados
- **Depende de:** T-16.2, T-16.6 · **Paralelo com:** T-16.7–T-16.10
- **Requisitos:** G05
- **Arquivos:** `apps/web/src/routes/_app/relatorios/$relatorio.tsx`, `apps/web/src/features/relatorios/{queries.ts,components/relatorios-pane.tsx,components/matriz-status.tsx}`
- **Passos:** novos tipos no painel, com a matriz de→para e a seleção de campo e de grupo.
- **Pronto quando:**
  - [ ] `pnpm verificar`.
- **Modelo:** Haiku
- **Tamanho:** P
