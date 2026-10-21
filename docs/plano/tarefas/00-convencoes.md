> Parte B (tarefas): convenções e resumo das fases. Vale para todas as tarefas.

## 8. Fases e tarefas

**Convenções** (valem para todas as tarefas):
- **Pré-condição:** `docs/plano/fundamentos/` (Parte A, §1–§7), `docs/plano/tarefas/` (Parte B: este arquivo, `fase-NN.md` e `corte-verificacao-riscos.md` com §9–§11), `CLAUDE.md` e os relatórios dos especialistas, copiados literalmente, em `docs/plano/relatorios/{ocomon,seguranca,stack,dados,design,tempo-real}.md`, já estão gravados. Em conflito, vale a Parte A, depois a Parte B, depois o relatório. "§x" remete à Parte A (mapa §→arquivo em `docs/plano/README.md`); "S#" aos requisitos da §5.1; "T##" (sem hífen) é sempre um teste da §5.2.
- **Recursos Teams** se chamam TM1–TM8 (TM1 chat, TM2 presença, TM3 digitando, TM4 leitura, TM5 menções, TM6 feed, TM7 desktop, TM8 Ctrl+K); `T##` é sempre um teste da §5.2.
- **Fechamento de toda tarefa:**
  - `pnpm verificar` verde;
  - um commit `T-x.y: <resumo>`;
  - se algo do plano for impossível, termine com `BLOQUEADO: <motivo>` e não improvise.
- **Comandos:**
  - teste pontual: `pnpm -F @vinimon/api exec vitest run <caminho>` (ou `-F @vinimon/web`, `-F @vinimon/shared`);
  - typecheck: `pnpm typecheck`; lint: `pnpm lint`.
  - argumentos para scripts do pnpm vão direto, sem `--` (o pnpm repassa o `--` ao script): `pnpm -F @vinimon/api importar:v1 --sqlite ../../data/VINIMON.db --dry-run`. Scripts que usam `util.parseArgs` descartam um `--` inicial (`const args = process.argv.slice(2); if (args[0] === '--') args.shift();`).
- **Rotas do web:** toda tarefa que cria, renomeia ou remove arquivo em `apps/web/src/routes` roda `pnpm -F @vinimon/web exec tsr generate` e commita `src/routeTree.gen.ts`.
- **Enums:** toda tarefa que cria ou altera um `enum` no schema.prisma edita, na mesma tarefa, `packages/shared/src/enums.ts` (constante + tipo) e `apps/api/src/lib/enums-check.ts` (um `Igual` por enum novo). Esses dois arquivos ficam fora do limite de tamanho.
- **Limite de tamanho:** até ~400 linhas e 8 arquivos por tarefa. Ficam fora da contagem: cópias literais da Parte A (`schema.prisma`, `migration.sql`, `globals.css`, código canônico da §7) e arquivos gerados (`components/ui/**`, `routeTree.gen.ts`, `pnpm-lock.yaml`). A T-10.0 (rotas placeholder, cada arquivo com ≤ 6 linhas) é exceção registrada ao limite de 8 arquivos.
- **Paralelismo:** tarefas marcadas como paralelas não editam os mesmos arquivos. Há três exceções, `apps/api/src/app.ts`, `packages/shared/src/index.ts` e `apps/api/src/jobs/index.ts` (uma entrada por job), em que cada tarefa só acrescenta uma linha em ordem alfabética. Num conflito de merge, mantenha as duas linhas.
- **Padrão de cadastro API:** cada módulo segue a receita da §3.4 e copia `modules/areas` (§7):
  - `shared/src/modulos/<m>.ts` + `index.ts`;
  - `api/src/modules/<m>/{schemas,service,routes}.ts` + `<m>.test.ts`;
  - linha em `app.ts`.
  - Testes mínimos: 401, 403, 400 com `detalhes`, 201/200, 404 e 409 (duplicata e em uso).
- **Padrão de tela de cadastro:** copia `routes/_app/admin/areas.tsx` + `features/areas/queries.ts` (§7). A tabela e o Sheet usam os campos da entidade.
- **Critério de tela:** em tarefa de tela, todo critério 'manual' é substituído por `<rota>.test.tsx` com `renderRota` + `apiFalsa` (T-9.16), cobrindo (a) renderização com os dados; (b) submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`. Fluxos que passam por várias telas entram no spec Playwright da área. Toda tarefa da Fase 10 posterior à T-11.4 acrescenta 1 caso ao spec da sua área.

### Resumo

| Fase | Objetivo | Tarefas | Pode paralelizar com |
|---|---|---|---|
| 0 | Repositório, monorepo, Postgres de dev | T-0.1–T-0.3 | T-0.3 ∥ T-0.2 |
| 1 | Shared, Prisma, núcleo da API, testes, CI | T-1.1–T-1.11 | T-1.2 ∥ T-1.3; T-1.11 ∥ T-1.10 |
| 2 | Senhas, sessões, 2FA, CSRF/CSP, seed | T-2.1–T-2.11 | T-2.1 ∥ T-2.3; T-2.9 ∥ T-2.10 ∥ T-2.11 |
| 3 | Usuários, cadastros, config, auditoria, meta | T-3.1–T-3.15 | T-3.2–T-3.10 entre si; Fase 4 (T-4.1/4.2) |
| 4 | Motor de SLA, jornadas, feriados | T-4.1–T-4.5 | T-4.1/T-4.2 ∥ Fase 3; T-4.4 ∥ T-4.5 |
| 5 | Chamados (abertura, filas, ações, CSV) | T-5.1–T-5.12 | T-5.1 ∥ T-5.2; T-5.12 ∥ T-5.11 |
| 6 | Conversa, menções, leitura, anexos, notificações, busca | T-6.1–T-6.10 | T-6.5 ∥ T-6.1–6.4; T-6.10 ∥ T-6.7 |
| 7 | Tempo real (socket, presença) e jobs | T-7.1–T-7.9 | T-7.6–T-7.9 ∥ T-7.2–T-7.5 |
| 8 | Painel, relatórios, conhecimento, inventário | T-8.1–T-8.5 | todas entre si; ∥ Fase 7 |
| 9 | Web: fundação e design system | T-9.1–T-9.16 | pode começar após T-1.10; T-9.6–T-9.15 entre si (após T-9.5) |
| 10 | Web: telas | T-10.0–T-10.37 | admin (10.6–10.12) entre si; 10.30–10.37 entre si |
| 11 | Importação v1, E2E, deploy, docs, revisões | T-11.1–T-11.12 | T-11.1–11.3 ∥ Fase 10; T-11.8–11.10 entre si |
| 12 | (F2) E-mail e recuperação de senha | T-12.1–T-12.5 | ∥ Fases 13–14 |
| 13 | (F2) LDAP, isolamento configurável, gerente, áreas destino, módulos | T-13.1–T-13.7 | T-13.1 ∥ T-13.2 |
| 14 | (F2) Categorias, campos personalizados, formulários, tags E/OU/NÃO | T-14.1–T-14.8 | T-14.1 ∥ T-14.2 ∥ T-14.5 |
| 15 | (F2) Auxiliares, calendário, retorno/inatividade, subchamados, lembretes, co-autoria, edição | T-15.1–T-15.10 | T-15.2 ∥ T-15.5 ∥ T-15.7 |
| 16 | (F2) Horas, mural, busca em soluções, filtros salvos, relatórios avançados | T-16.1–T-16.11 | T-16.3 ∥ T-16.4 ∥ T-16.5 |
| 17 | (F2) API pública, inventário completo, avatar, exportação LGPD | T-17.1–T-17.8 | T-17.4 ∥ T-17.1 |
| 18 | (F3) Clientes, centros de custo, custos, recursos | T-18.1–T-18.4 | ∥ Fase 19 |
| 19 | (F3) E-mail de entrada, formulário anônimo, avaliação por link, OIDC, auto-cadastro, listas | T-19.1–T-19.6 | T-19.1 ∥ T-19.4 ∥ T-19.5 |
| 20 | (F3) Projetos, nichos, inventário restante, escala horizontal | T-20.1–T-20.7 | T-20.3–T-20.5 entre si |
