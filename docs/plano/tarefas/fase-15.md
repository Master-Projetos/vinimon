> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 15 — (Fase 2) Ciclo avançado

### T-15.1 — Operadores auxiliares
- **Depende de:** MVP · **Paralelo com:** T-15.2, T-15.5
- **Requisitos:** C08; S44, S53
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `apps/api/src/autorizacao/{chamados.ts,chamados.test.ts}`, `packages/shared/src/modulos/chamados.ts`, `apps/api/src/modules/chamados/{acoes.ts,routes.ts,auxiliares.test.ts}`, `apps/api/test/escopo-equivalencia.test.ts`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato), `packages/shared/src/{enums.ts,modulos/chamados.test.ts}` (eventos AUXILIAR_ADICIONADO e AUXILIAR_REMOVIDO e linhas das novas rotas), `apps/api/src/modules/chamados/{consultas.ts,schemas.ts,service.ts}` e `apps/api/src/modules/{anexos,assentamentos,leituras,mencoes}/service.ts`, `apps/api/src/modules/mencoes/mencoes.test.ts`, `apps/api/src/modules/notificacoes/{fanout.ts,regras.ts,service.ts}`, `apps/api/src/realtime/{handlers.ts,revalidacao.ts}` (todo ponto de escopo carrega os auxiliares), `apps/web/src/features/historico/{textos.ts,components/historico-timeline.tsx}` (texto dos novos eventos)
- **Passos:**
  1. Model `ChamadoAuxiliar {chamadoId, usuarioId, criadoEm, @@id}`. `Usuario.podeEncaminhar` e `podeReceber`, ambos com padrão `true`.
  2. `ChamadoEscopo.auxiliarIds`. O escopo acrescenta `{ auxiliares: { some: { usuarioId: u.id } } }`.
  3. Auxiliar vê e comenta como equipe (`podeVerInterno` vale), mas **não** passa em `podeAtender`; só o principal (`operadorId`) conclui.
  4. `POST /chamados/:id/auxiliares {usuarioId}` e `DELETE …/:usuarioId` (`podeAtender`); o alvo precisa ter `podeReceber`. Encaminhar para operador exige `podeEncaminhar`.
  5. Seguidor ATRIBUIDO e notificação ATRIBUIDO. `acessoMudou:true`.
  6. estender a fixture de `escopo-equivalencia.test.ts` com o novo ator (auxiliar) e manter o teste verde.
- **Pronto quando:**
  - [ ] auxiliar de outra área vê o chamado e perde o acesso ao ser removido (socket revogado);
  - [ ] `escopo-equivalencia.test.ts` verde com o ator novo;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-15.2 — Calendário de chamados
- **Depende de:** MVP · **Paralelo com:** T-15.1, T-15.5
- **Requisitos:** C10
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/calendario.ts`, `apps/api/src/modules/calendario/{service.ts,routes.ts,calendario.test.ts}`, `apps/api/src/app.ts`, `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. `Usuario.corCalendario Char(7)?`.
  2. `GET /calendario?de=&ate=&areaIds=&operadorIds=` (`chamado.atender`, até 62 dias): eventos `{tipo: 'abertura'|'conclusao'|'agendamento', chamadoId, assunto, data, operador:{id, nome, cor}}` dentro do escopo, com `take` de até 2000.
- **Pronto quando:**
  - [ ] período de 70 dias dá 400;
  - [ ] fora do escopo não aparece;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-15.3 — Solicitar retorno e auto-encerramento por inatividade
- **Depende de:** T-12.3 · **Paralelo com:** T-15.4
- **Requisitos:** C18, C19
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração (enums), `packages/shared/src/{config.ts,modulos/chamados.ts,enums.ts}`, `apps/api/src/lib/enums-check.ts`, `apps/api/src/modules/chamados/{acoes.ts,routes.ts}`, `apps/api/src/jobs/{chamados-auto-encerramento-inatividade.ts,index.ts}`, `apps/api/test/inatividade.test.ts`, `apps/api/src/modules/assentamentos/service.ts` (comentário do solicitante leva ao status de retorno), `apps/api/src/modules/config/service.ts` (validação cruzada das chaves de inatividade), `packages/shared/src/modulos/chamados.test.ts` (linha da nova rota), `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Config:
     - `inatividade.statusIds` (`int[]`, vazio desliga);
     - `inatividade.dias` (padrão 7);
     - `inatividade.diasUteis` (padrão `false`);
     - `inatividade.statusRetornoId` (status de tipo ABERTO ou EM_ATENDIMENTO);
     - `inatividade.avaliacao` (padrão OTIMO).
  2. `POST /chamados/:id/solicitar-retorno {versao, mensagem}`: a mensagem vira comentário público; papel AGUARDANDO_SOLICITANTE; evento SOLICITADO_RETORNO; e-mail ao solicitante.
  3. Job `*/15`: status monitorado, solicitante ≠ operador, último comentário público que não é do solicitante, `statusDesde + dias` < agora → ENCERRADO com avaliação automática, evento AUTO_ENCERRADO e e-mail.
  4. Comentário do solicitante em status monitorado leva a `statusRetornoId`.
- **Pronto quando:**
  - [ ] relógio injetado: encerra no dia 8 e não no dia 6;
  - [ ] rodar 2 vezes não duplica;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-15.4 — Subchamados
- **Depende de:** MVP · **Paralelo com:** T-15.3
- **Requisitos:** C20
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração (enum), `packages/shared/src/modulos/chamados.ts`, `packages/shared/src/enums.ts`, `apps/api/src/lib/enums-check.ts` (eventos SUBCHAMADO_*), `apps/api/src/modules/chamados/{acoes.ts,service.ts,consultas.ts,subchamados.test.ts}`
- **Passos:**
  1. `Chamado.chamadoPaiId Int?` com autorrelação, índice parcial `IS NOT NULL` e CHECK `<> id`.
  2. `POST /chamados` aceita `paiId` (precisa ver e atender o pai).
  3. `POST /chamados/:id/pai {versao, paiId|null}`: proíbe ciclo (sobe os ancestrais até 50 níveis); eventos SUBCHAMADO_VINCULADO e DESVINCULADO nos dois chamados.
  4. Concluir o pai com filho não ENCERRADO dá 422 "Conclua os subchamados antes."
  5. O detalhe traz `pai` e `filhos` (só os visíveis).
- **Pronto quando:**
  - [ ] o ciclo A→B→A dá 422;
  - [ ] o bloqueio de conclusão funciona;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-15.5 — Lembretes
- **Depende de:** MVP · **Paralelo com:** T-15.1, T-15.2
- **Requisitos:** C24
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/modulos/lembretes.ts`, `packages/shared/src/enums.ts`, `apps/api/src/lib/enums-check.ts` (`TipoNotificacao.LEMBRETE`), `apps/api/src/modules/lembretes/{service.ts,routes.ts,lembretes.test.ts}`, `apps/api/src/jobs/{lembretes-disparar.ts,index.ts}`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Model `Lembrete {id, chamadoId, usuarioId, dataHora, texto VarChar(500), processadoEm?, criadoEm}` com índice parcial `processado_em IS NULL`.
  2. CRUD só do dono, exigindo ver o chamado.
  3. Job a cada minuto: `processadoEm=null` e `dataHora ≤ agora` → `TipoNotificacao.LEMBRETE` (novo, fixo no in-app) + e-mail se habilitado → `processadoEm`.
- **Pronto quando:**
  - [ ] outro usuário recebe 404 no lembrete alheio;
  - [ ] o disparo é idempotente;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-15.6 — Co-autoria
- **Depende de:** T-15.1 · **Paralelo com:** T-15.7
- **Requisitos:** C25; S44
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `apps/api/src/autorizacao/{chamados.ts,chamados.test.ts}`, `apps/api/src/modules/chamados/{acoes.ts,routes.ts,coautores.test.ts}`, `packages/shared/src/modulos/chamados.ts`, `apps/api/test/escopo-equivalencia.test.ts`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. Model `ChamadoCoautor {chamadoId, usuarioId, concedidoPorId, criadoEm, @@id}`. Só o solicitante concede, e só a USUARIO ativo do mesmo departamento e da mesma área primária.
  2. `ChamadoEscopo.coautorIds`. O escopo acrescenta `coautores some`.
  3. O co-autor vê, comenta e anexa; não aprova, não rejeita e não cancela.
  4. Visão `compartilhados-comigo`. Seguidor MANUAL. A revogação chama `revalidarChamado`.
  5. estender a fixture de `escopo-equivalencia.test.ts` com o novo ator (co-autor) e manter o teste verde.
- **Pronto quando:**
  - [ ] co-autor aprovando dá 403;
  - [ ] após a revogação, 404;
  - [ ] `escopo-equivalencia.test.ts` verde com o ator novo;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-15.7 — Edição e remoção de comentários (15 min)
- **Depende de:** MVP · **Paralelo com:** T-15.6
- **Requisitos:** decisão de Fase 2 da §1.2; S99
- **Arquivos:** `apps/api/prisma/schema.prisma` + migração, `packages/shared/src/{modulos/assentamentos.ts,realtime.ts}`, `apps/api/src/modules/assentamentos/{service.ts,routes.ts,edicao.test.ts}`, `apps/api/src/realtime/handlers.ts`, `apps/api/src/app.ts` (registro do módulo), `packages/shared/src/index.ts` (export do contrato)
- **Passos:**
  1. `Assentamento.editadoEm?`, `removidoEm?` e `removidoPorId?`. Model `AssentamentoEdicao {id, assentamentoId, textoAnterior Text, editadoPorId, editadoEm}`.
  2. Ajustar o CHECK `ck_assentamentos_texto` para aceitar `removido_em IS NOT NULL` (DROP + ADD na migração).
  3. `PATCH`: só o autor, até 15 min (relógio do servidor) e chamado não ENCERRADO. `interno` não pode mudar. Menções novas geram MENCAO.
  4. `DELETE`: o autor dentro da janela ou o ADMIN; o DTO passa a ter `texto:null`.
  5. Eventos `assentamento:editado` e `assentamento:removido` para a mesma sala da criação.
  6. `GET …/:aid/edicoes`: só a equipe.
- **Pronto quando:**
  - [ ] edição depois de 15 min dá 409;
  - [ ] não autor dá 403;
  - [ ] o solicitante não recebe o evento de um interno removido;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-15.8 — Telas: auxiliares, co-autores e subchamados
- **Depende de:** T-15.1, T-15.4, T-15.6 · **Paralelo com:** T-15.9
- **Requisitos:** C08, C20, C25
- **Arquivos:** `apps/web/src/features/chamados/components/{auxiliares-section.tsx,coautores-section.tsx,subchamados-section.tsx,quick-actions-rail.tsx,chamado-detalhes.tsx,chamado-detalhes.test.tsx}`, `apps/web/src/features/chamados/queries.ts`
- **Passos:**
  1. Seções no trilho: adicionar e remover auxiliares e co-autores.
  2. Detalhes: pai e filhos com status, "Abrir subchamado" (`/chamados/novo?pai=`) e vincular ao pai.
- **Pronto quando:**
  - [ ] `chamado-detalhes.test.tsx` (rota `/chamados/$chamadoId`) com `renderRota` + `apiFalsa` (T-9.16): (a) renderiza com os dados; (b) o submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-15.9 — Telas: calendário e lembretes
- **Depende de:** T-15.2, T-15.5 · **Paralelo com:** T-15.8, T-15.10
- **Requisitos:** C10, C24
- **Arquivos:** `apps/web/src/routes/_app/calendario.tsx`, `apps/web/src/features/calendario/{queries.ts,components/grade-mes.tsx}`, `apps/web/src/features/lembretes/{queries.ts,components/lembrete-popover.tsx}`, `apps/web/src/components/layout/app-bar.tsx`
- **Passos:**
  1. Grade mensal própria com date-fns (sem biblioteca nova), cor por operador e filtros.
  2. Item "Calendário" (`CalendarDays`) na app bar para a equipe.
  3. Lembrete no cabeçalho do chamado (`AlarmClock`).
- **Pronto quando:**
  - [ ] o agendamento aparece no dia correto no fuso;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-15.10 — Telas: solicitar retorno e edição de comentários
- **Depende de:** T-15.3, T-15.7 · **Paralelo com:** T-15.9
- **Requisitos:** C18; edição em 15 min
- **Arquivos:** `apps/web/src/features/chamados/components/solicitar-retorno-dialog.tsx`, `apps/web/src/features/conversa/{components/message-bubble.tsx,components/editar-mensagem.tsx,hooks.ts,cache.ts}`, `apps/web/src/routes/_app/admin/configuracoes.tsx`
- **Passos:**
  1. Diálogo de solicitar retorno.
  2. Na bolha: menu "Editar" e "Remover" com contagem regressiva, "Mensagem removida" e "(editada)" com o histórico para a equipe.
  3. Seção "Inatividade" nas configurações.
- **Pronto quando:**
  - [ ] o botão some depois de 15 min (timers falsos);
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M
