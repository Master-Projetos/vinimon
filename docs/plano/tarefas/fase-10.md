> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 10 — Web: telas

> Em toda tarefa desta fase, os critérios de tela são verificados por `<rota>.test.tsx` com `renderRota` + `apiFalsa` (T-9.16), cobrindo (a) renderização com os dados; (b) submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`. Fluxos que passam por várias telas entram no spec Playwright da área. Toda tarefa que cria, renomeia ou remove arquivo em `apps/web/src/routes` roda `pnpm -F @vinimon/web exec tsr generate` e commita `src/routeTree.gen.ts`.

### T-10.0 — Rotas placeholder
- **Depende de:** T-9.8 · **Paralelo com:** —
- **Requisitos:** §6.2 (rotas), §6.6; rotas tipadas do TanStack Router (`to`, `redirect`, `navigate` e `search` só aceitam rotas que já existem no routeTree)
- **Arquivos:** `apps/web/src/routes/_app/{atividade,painel,sem-permissao}.tsx`, `apps/web/src/routes/_app/chamados/index.tsx`, `apps/web/src/routes/_app/chamados/novo.tsx`, `apps/web/src/routes/_app/chamados/$chamadoId/route.tsx`, `apps/web/src/routes/_app/{conhecimento,inventario,relatorios,perfil}/index.tsx`, `apps/web/src/routes/_app/admin/{index,unidades,departamentos,prioridades,status,problemas,canais,tags,tipos-ativo,categorias-artigo,jornadas,feriados,usuarios,configuracoes,auditoria}.tsx`, `apps/web/src/routeTree.gen.ts`. Exceção registrada ao limite de 8 arquivos: cada arquivo tem ≤ 6 linhas.
- **Passos:**
  1. Cada arquivo contém `export const Route = createFileRoute('<id>')({ component: () => <EmptyState titulo="Em construção" /> })`.
  2. O `novo.tsx` já nasce com o validateSearch definitivo `z.object({ equipamento: z.string().max(40).optional(), problema: z.int().positive().optional(), pai: z.int().positive().optional() })`.
  3. O `$chamadoId/route.tsx` já nasce com o `params.parse` da T-10.22 (`z.coerce.number()`, e `notFound()` se o parse falhar) e `component: Outlet`.
  4. `pnpm -F @vinimon/web exec tsr generate` e commitar `src/routeTree.gen.ts`.
  5. A tarefa dona de cada rota substitui o conteúdo do placeholder.
- **Pronto quando:**
  - [ ] `grep -c "/_app/admin/usuarios" apps/web/src/routeTree.gen.ts` ≥ 1 (idem para `/_app/chamados/$chamadoId`);
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-10.1 — Login e verificação em duas etapas
- **Depende de:** T-9.11, T-9.16, T-10.0, T-2.6 · **Paralelo com:** T-10.3
- **Requisitos:** S79, S80; §6.3 (1)
- **Arquivos:** `apps/web/src/routes/login.tsx`, `apps/web/src/features/auth/{queries.ts,components/auth-layout.tsx,components/login-form.tsx,components/dois-fatores-form.tsx,components/login.test.tsx}`, `apps/web/src/lib/{api.ts,api.test.ts}` (expor `retryAfter` em `ErroApi`)
- **Passos:**
  1. Login (`useEntrar`):
     - em `PENDENTE_MFA`, troca para a etapa de 2FA (`InputOTP`, ou código de recuperação);
     - depois, navega conforme o estado (TROCA_SENHA → `/trocar-senha`, CADASTRO_MFA → `/configurar-2fa`, ATIVA → `redirect` ou `/`).
  2. Aviso de Caps Lock.
  3. 429: contagem regressiva com o botão desabilitado.
  4. `definirCsrf` com o `csrf` da resposta.
- **Pronto quando:**
  - [ ] teste de componente com `chamar` simulado nos estados;
  - [ ] `login.test.tsx` com `renderRota` + `apiFalsa`: (a) renderiza o formulário; (b) submit faz `POST /auth/login` com `{ login, senha }` e, em ATIVA, navega para o `redirect`; `PENDENTE_MFA` mostra a etapa de 2FA; (c) 400 com `detalhes` aparece no campo; (d) 429 desabilita o botão com contagem;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.2 — Troca obrigatória de senha e cadastro do 2FA
- **Depende de:** T-10.1, T-2.7, T-2.8 · **Paralelo com:** T-10.3, T-10.4
- **Requisitos:** S26, S29, S30; T68
- **Arquivos:** `apps/web/src/routes/{trocar-senha.tsx,configurar-2fa.tsx}`, `apps/web/src/features/auth/components/{trocar-senha-form.tsx,configurar-2fa-form.tsx,codigos-recuperacao-list.tsx}`, `apps/web/src/features/auth/queries.ts`, `apps/web/src/features/auth/components/{trocar-senha.test.tsx,configurar-2fa.test.tsx}`, `apps/web/package.json`, `pnpm-lock.yaml`, `apps/api/test/socket.ts` (`esperarEvento` com 5 s: flaky sob carga)
- **Decisão do coordenador:** os dois testes citados em "Pronto quando" ficam em `features/auth/components/`. A dependência `qrcode.react@4.2.0` (§2.2) ainda não está em `apps/web`: entra aqui com `pnpm --filter @vinimon/web add -E qrcode.react@4.2.0`.
- **Passos:**
  1. Trocar senha: confirmação e `PasswordStrength`.
  2. Configurar 2FA:
     - `iniciar` → `QRCodeSVG(otpauthUri)` + chave com copiar → OTP → `confirmar`;
     - 10 códigos com "Copiar" e "Baixar .txt" (Blob);
     - a caixa "Guardei meus códigos" habilita "Concluir".
- **Pronto quando:**
  - [ ] `trocar-senha.test.tsx` e `configurar-2fa.test.tsx` com `renderRota` + `apiFalsa`: (a) renderização; (b) submit chama o contrato esperado com o body esperado (troca → `/configurar-2fa`; confirmar 2FA → códigos → "Concluir" → `/`); (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.3 — Shell, parte 1: AppShell, app bar, top bar e navegação móvel
- **Depende de:** T-9.10, T-9.15, T-9.16, T-10.0 · **Paralelo com:** T-10.1, T-10.2
- **Requisitos:** §6.2
- **Arquivos:** `apps/web/src/components/layout/{app-shell.tsx,app-bar.tsx,app-bar-item.tsx,top-bar.tsx,mobile-nav.tsx,skip-link.tsx,app-shell.test.tsx}`, `apps/web/src/routes/_app.tsx`
- **Passos:**
  1. Grid, itens e permissões da §6.2. O contador fica como prop (ligado na T-10.15).
  2. `MobileNav` abaixo de 768 px, com "Mais" em `Sheet side="bottom"`.
  3. `_app.tsx` renderiza `<AppShell><Outlet/></AppShell>`.
- **Pronto quando:**
  - [ ] o primeiro Tab foca o SkipLink;
  - [ ] em 375 px aparece a barra inferior;
  - [ ] USUARIO não vê Inventário, Relatórios nem Admin;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.4 — Shell, parte 2: painéis, abas, guardas e redirecionamentos
- **Depende de:** T-10.3 · **Paralelo com:** T-10.5
- **Requisitos:** §6.2, §6.6 (`exigir`)
- **Arquivos:** `apps/web/src/components/layout/{two-pane.tsx,pane-header.tsx,list-pane-section.tsx,list-pane-nav-item.tsx,route-tabs.tsx}`, `apps/web/src/features/auth/guards.ts`, `apps/web/src/routes/_app/{index.tsx,sem-permissao.tsx}`, `apps/web/src/features/auth/guards.test.tsx` (testa o redirecionamento de `/`, no lugar de `routes/_app/index.test.tsx`, que o roteador trataria como rota), `apps/web/src/features/auth/components/login.test.tsx` (USUARIO passa a cair em `/chamados`)
- **Passos:**
  1. `TwoPane` com as props do design. O recolhimento fica em `vinimon:painel-lista:<id>`.
  2. `exigir(p)` no `beforeLoad`.
  3. `index.tsx`: a equipe vai para `/atividade`; USUARIO vai para `/chamados`.
- **Pronto quando:**
  - [ ] `index.test.tsx` com `renderRota`: ADMIN/OPERADOR em `/` vai para `/atividade`; USUARIO vai para `/chamados`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.5 — Meta, layout de administração e áreas (canônico)
- **Depende de:** T-10.4, T-3.15 · **Paralelo com:** —
- **Requisitos:** §7 (`areas.tsx`, `features/areas/queries.ts`)
- **Arquivos:** `apps/web/src/features/meta/queries.ts`, `apps/web/src/features/areas/queries.ts`, `apps/web/src/routes/_app/admin/{route.tsx,index.tsx,areas.tsx,areas.test.tsx}`, `apps/web/src/features/admin/components/admin-nav-pane.tsx`, `apps/web/src/test/render-rota.test.tsx`
- **Passos:**
  1. `metaConsultas.tudo()` com `staleTime` de 5 min.
  2. Layout admin com `exigir('cadastro.gerenciar')` e as seções do painel (Pessoas, Chamados, SLA, Estrutura, Sistema).
  3. `index` redireciona para `/admin/usuarios`.
  4. `areas.tsx` e `queries.ts` literais.
- **Pronto quando:**
  - [ ] `areas.test.tsx` com `renderRota` + `apiFalsa`: (a) lista as áreas; (b) criar e editar fazem `POST /areas` e `PATCH /areas/:id` com o body esperado; (c) 400 com `detalhes` e 409 em nome duplicado aparecem no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `/admin` com USUARIO vai para `/sem-permissao` (teste);
  - [ ] `render-rota.test.tsx` (T-9.16) passa a usar `/admin/areas`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.6 — Admin: unidades e departamentos
- **Depende de:** T-10.5, T-3.3 · **Paralelo com:** T-10.7–T-10.12
- **Requisitos:** padrão de tela de cadastro
- **Arquivos:** `apps/web/src/routes/_app/admin/{unidades.tsx,departamentos.tsx}`, `apps/web/src/features/{unidades,departamentos}/queries.ts`
- **Passos:** copiar o padrão. Em departamentos, `Select` de unidade e filtro por unidade.
- **Pronto quando:**
  - [ ] `unidades.test.tsx` e `departamentos.test.tsx` com `renderRota` + `apiFalsa`: (a) renderização com os dados; (b) criar/editar chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-10.7 — Admin: prioridades e status
- **Depende de:** T-10.5, T-3.5 · **Paralelo com:** T-10.6, T-10.8–T-10.12
- **Requisitos:** padrão; `ColorField`
- **Arquivos:** `apps/web/src/routes/_app/admin/{prioridades.tsx,status.tsx}`, `apps/web/src/features/{prioridades,status}/queries.ts`
- **Passos:**
  1. Campos de cor com `ColorField`; a coluna "Prévia" mostra `PrioridadeBadge`/`StatusBadge`.
  2. Status: `Select` de tipo e papel; o papel filtra os tipos válidos.
- **Pronto quando:**
  - [ ] criar prioridade `#ffff00` mostra contraste ≥ 4,5;
  - [ ] `prioridades.test.tsx` e `status.test.tsx` com `renderRota` + `apiFalsa`: (a) renderização com os dados; (b) submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-10.8 — Admin: tipos de problema e canais
- **Depende de:** T-10.5, T-3.6, T-3.7 · **Paralelo com:** T-10.6, T-10.7, T-10.9–T-10.12
- **Requisitos:** padrão
- **Arquivos:** `apps/web/src/routes/_app/admin/{problemas.tsx,canais.tsx}`, `apps/web/src/features/{problemas,canais}/queries.ts`
- **Passos:**
  1. Problemas: `MultiComboboxField` de áreas; `Select` da área padrão filtrado pelas escolhidas; SLA em minutos com dica "(h × 60)".
  2. Canais: os de sistema aparecem com o botão "Excluir" desabilitado.
- **Pronto quando:**
  - [ ] `problemas.test.tsx` e `canais.test.tsx` com `renderRota` + `apiFalsa`: (a) renderização com os dados; (b) criar/editar chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-10.9 — Admin: tags, tipos de ativo e categorias de artigo
- **Depende de:** T-10.5, T-3.8–T-3.10 · **Paralelo com:** T-10.6–T-10.8, T-10.10–T-10.12
- **Requisitos:** padrão
- **Arquivos:** `apps/web/src/routes/_app/admin/{tags.tsx,tipos-ativo.tsx,categorias-artigo.tsx}`, `apps/web/src/features/{tags,tipos-ativo,categorias-artigo}/queries.ts`
- **Passos:** copiar o padrão.
- **Pronto quando:**
  - [ ] `tags.test.tsx`, `tipos-ativo.test.tsx` e `categorias-artigo.test.tsx` com `renderRota` + `apiFalsa`: (a) renderização com os dados; (b) criar/editar chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.10 — Admin: jornadas e feriados
- **Depende de:** T-10.5, T-4.4, T-4.5 · **Paralelo com:** T-10.6–T-10.9, T-10.11, T-10.12
- **Requisitos:** D02, D03
- **Arquivos:** `apps/web/src/routes/_app/admin/{jornadas.tsx,feriados.tsx}`, `apps/web/src/features/{jornadas,feriados}/queries.ts`
- **Passos:**
  1. Jornadas: editor de horários com uma linha por janela (dia, início HH:MM, fim HH:MM, adicionar e remover), conversão HH:MM ↔ minutos, Switch "24x7" que esconde os horários.
  2. Feriados: `DatePicker`, "Repete todo ano" e filtro por ano.
- **Pronto quando:**
  - [ ] `jornadas.test.tsx` com `renderRota` + `apiFalsa`: (a) renderização com os dados; (b) criar a jornada Comercial faz `POST /jornadas` com as janelas em minutos; (c) 400 com `detalhes` de sobreposição aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `feriados.test.tsx` com os mesmos casos (a)–(d);
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.11 — Admin: usuários
- **Depende de:** T-10.5, T-3.12 · **Paralelo com:** T-10.6–T-10.10, T-10.12
- **Requisitos:** S16, S31, S48, S122
- **Arquivos:** `apps/web/src/routes/_app/admin/usuarios.tsx`, `apps/web/src/features/usuarios/{queries.ts,components/usuario-sheet.tsx,components/senha-temporaria-dialog.tsx,components/acoes-usuario-menu.tsx}`
- **Passos:**
  1. Tabela com nome e avatar, login, e-mail, perfil, área, 2FA, último acesso e situação.
  2. Sheet com perfil, área e áreas secundárias (multi).
  3. Menu: redefinir senha (`SenhaTemporariaDialog`, mostra uma vez), resetar 2FA (pede a senha do admin), encerrar sessões, desbloquear login e anonimizar. Todos com `ConfirmDialog`.
- **Pronto quando:**
  - [ ] `usuarios.test.tsx` com `renderRota` + `apiFalsa`: (a) renderização com os dados; (b) criar/editar e "Redefinir senha" chamam o contrato esperado com o body esperado, e a senha temporária devolvida aparece uma vez (fechar o diálogo a remove do DOM); (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.12 — Admin: configurações e auditoria
- **Depende de:** T-10.5, T-3.13, T-3.14 · **Paralelo com:** T-10.6–T-10.11
- **Requisitos:** S89; §6.3 (12)
- **Arquivos:** `apps/web/src/routes/_app/admin/{configuracoes.tsx,auditoria.tsx}`, `apps/web/src/features/{config,auditoria}/queries.ts`, `apps/web/src/features/admin/components/configuracoes-secao.tsx`
- **Passos:**
  1. Configurações: seções Geral, Sessão, Chamados, Anexos e SLA, cada uma com um formulário e um PATCH próprios (só as chaves da seção). Salvar invalida `['meta']`.
  2. Auditoria: filtros (período, ator, ação, entidade), paginação e linha expansível com `<pre>{JSON.stringify(dados, null, 2)}</pre>`.
- **Pronto quando:**
  - [ ] `configuracoes.test.tsx` com `renderRota` + `apiFalsa`: (a) renderização com os dados; (b) salvar "Anexos habilitados = não" faz o PATCH só com as chaves da seção e invalida `['meta']`; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `auditoria.test.tsx`: lista o `config.alterada` devolvido pela `apiFalsa` e os filtros entram na query;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.13 — Cliente Socket.IO e sincronização
- **Depende de:** T-10.4, T-7.4 · **Paralelo com:** T-10.6–T-10.12
- **Requisitos:** S80; §3.7 (cliente se corrige via REST)
- **Arquivos:** `apps/web/src/lib/socket.ts`, `apps/web/src/hooks/{use-socket-evento.ts,use-ocioso.ts}`, `apps/web/src/features/presenca/{queries.ts,hooks.ts}`, `apps/web/src/components/layout/offline-indicator.tsx`, `apps/web/src/routes/_app.tsx`
- **Passos:**
  1. `io({ path:'/socket.io', transports:['websocket'], autoConnect:false, withCredentials:true })`, tipado com `EventosServidor`/`EventosCliente`. Conecta no `_app` e desconecta no logout. No logout, chamar `limparDadosDoUsuario()` junto com `queryClient.clear()`.
  2. `connect_error`:
     - `NAO_AUTENTICADO` → `/login`;
     - `LIMITE_CONEXOES` → toast "Muitas abas abertas", sem nova tentativa;
     - demais → backoff de 2 a 30 s.
  3. Ao reconectar: invalida `['notificacoes']`, `['chamados']` e `['painel']`, e as salas voltam a ser assinadas.
  4. `sessao:encerrada` → `queryClient.clear()` + `limparDadosDoUsuario()` + `/login`.
  5. `useOcioso(5 min)` + `presenca:atividade`, só quando o valor muda.
  6. `fila:atualizada` invalida `chamadoChaves.listas()` com debounce de 1 s e `chamadoChaves.contagens()` com throttle de 10 s, sempre com `refetchType: 'active'`.
- **Pronto quando:**
  - [ ] teste com socket falso e timers falsos: `disconnect` mostra "Reconectando…" no `OfflineIndicator`, que some no `connect`, e o `connect` invalida `['notificacoes']`, `['chamados']` e `['painel']`;
  - [ ] teste: 5 `fila:atualizada` em 1 s geram 1 invalidação de listas e no máximo 1 de contagens em 10 s;
  - [ ] teste: `sessao:encerrada` limpa o cache e as chaves `vinimon:u*`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Sonnet
- **Tamanho:** M

### T-10.14 — Menu do usuário, presença e cartão de perfil
- **Depende de:** T-10.13, T-7.5 · **Paralelo com:** T-10.15
- **Requisitos:** TM2, S97
- **Arquivos:** `apps/web/src/features/presenca/components/user-menu.tsx`, `apps/web/src/components/display/user-hover-card.tsx`, `apps/web/src/features/presenca/{hooks.ts,queries.ts}`, `apps/web/src/components/layout/top-bar.tsx`
- **Passos:**
  1. `UserMenu`:
     - status Disponível, Ocupado (1 h / hoje / até eu mudar), Ausente e Redefinir, via `PUT /me/presenca`;
     - Meu perfil, Tema, Densidade (`PATCH /me` + local), Atalhos e Sair.
  2. `usePresenca(ids)`: assina com `presenca:assinar` e reassina no `connect`; o cache é `Record<id, estado>`.
- **Pronto quando:**
  - [ ] teste com `apiFalsa` e socket falso: escolher "Ocupado · 1 h" faz `PUT /me/presenca` com o body esperado; um `presenca:mudou` recebido atualiza o `sr-only` do `PresenceIndicator`; `connect` reassina com `presenca:assinar`;
  - [ ] teste: trocar o tema chama `PATCH /me` e grava `vinimon:tema`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.15 — Notificações: sino, contador e área de trabalho
- **Depende de:** T-10.13, T-6.9 · **Paralelo com:** T-10.14
- **Requisitos:** S104, S105; TM7; T69 (unidade)
- **Arquivos:** `apps/web/src/features/notificacoes/{queries.ts,desktop.ts,desktop.test.ts,components/notification-bell.tsx,components/notification-item.tsx,components/desktop-notifications-prompt.tsx}`, `apps/web/src/components/layout/app-bar.tsx`
- **Passos:**
  1. `notificacao:nova` e `notificacao:contagem` gravam direto no cache.
  2. Contador na app bar e título "(n) … · Vinimon".
  3. `desktop.ts` segue a §3.8 (Desktop): `navigator.locks`, deduplicação `vinimon:notifs-apresentadas`, OCUPADO suprime exceto MENCAO e SLA, foco vira toast, `try/catch` no construtor, e **nunca** o texto da mensagem.
  4. O prompt pede permissão só depois de clique.
- **Pronto quando:**
  - [ ] teste com `Notification` simulado: o `body` não contém o texto do comentário; com foco vira toast; OCUPADO suprime COMENTARIO;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.16 — Feed de Atividade
- **Depende de:** T-10.15 · **Paralelo com:** T-10.17
- **Requisitos:** TM6; S103; §6.3 (3)
- **Arquivos:** `apps/web/src/routes/_app/atividade.tsx`, `apps/web/src/features/atividade/components/{activity-feed.tsx,activity-item.tsx,activity-filters.tsx,activity-preview.tsx}`
- **Passos:**
  1. `useInfiniteQuery` por cursor, com `IntersectionObserver`.
  2. Filtros via `ToggleGroup` e `?filtro=&item=`. Clicar marca como lida.
  3. `j`/`k` navegam.
  4. Prévia com `ConversaView modo="previa"`, que entra na T-10.24; até lá, um link "Abrir chamado".
- **Pronto quando:**
  - [ ] `atividade.test.tsx` com `renderRota` + `apiFalsa`: (a) renderiza os itens; (b) clicar faz o POST de leitura, zera o ponto de não lida e o contador do sino diminui; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.17 — Busca Ctrl+K e atalhos
- **Depende de:** T-10.4, T-6.10 · **Paralelo com:** T-10.16
- **Requisitos:** TM8; S106–S108; §6.2 (atalhos)
- **Arquivos:** `apps/web/src/components/command/{command-palette.tsx,atalhos-dialog.tsx}`, `apps/web/src/features/busca/{queries.ts,acoes.ts}`, `apps/web/src/lib/atalhos.ts`, `apps/web/src/hooks/use-atalhos.ts`, `apps/web/src/components/layout/busca-global-trigger.tsx`
- **Passos:**
  1. `CommandDialog` com `shouldFilter={false}` e debounce de 200 ms.
  2. Grupos: "Abrir #N", Chamados, Base, Ativos, Pessoas, Ir para, Ações e Recentes (`vinimon:u<id>:recentes`, 8).
  3. Ctrl/⌘ K funciona mesmo dentro de campos.
  4. Atalhos de letra (`g`+…, `c`, `/`, `?`) ficam ignorados com foco em input, textarea ou contenteditable.
- **Pronto quando:**
  - [ ] teste: Ctrl+K abre; "125" mostra "Abrir #125"; `g c` navega; atalho em input é ignorado;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.18 — Chamados: layout, filtros na URL e visões
- **Depende de:** T-10.4, T-5.5 · **Paralelo com:** T-10.16, T-10.17
- **Requisitos:** §3.6 (`ChamadoFiltros`), §6.3 (4)
- **Arquivos:** `apps/web/src/routes/_app/chamados/route.tsx`, `apps/web/src/features/chamados/{queries.ts,filtros.ts,components/visoes-pane.tsx}`
- **Passos:**
  1. `validateSearch` com `ChamadoFiltrosSchema` em que todos os campos são `.optional()`.
  2. `chamadoChaves` e `chamadosConsultas` (`lista` com `placeholderData: keepPreviousData`, `contagens` com `staleTime: 30_000`, `detalhe`).
  3. `VisoesPane` com contagens. Só a equipe vê fila aberta, minha área e agendados.
- **Pronto quando:**
  - [ ] `route.test.tsx` com `renderRota` + `apiFalsa`: trocar a visão atualiza a URL e a contagem; USUARIO não vê fila aberta;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-10.19 — Tabela de chamados
- **Depende de:** T-10.18, T-9.14 · **Paralelo com:** T-10.20
- **Requisitos:** C05, G01; §6.3 (4)
- **Arquivos:** `apps/web/src/routes/_app/chamados/index.tsx`, `apps/web/src/features/chamados/{columns.tsx,components/chamados-table.tsx,components/chamado-list-item.tsx}`
- **Passos:**
  1. Colunas da §6.3, com visibilidade em `vinimon:chamados:colunas:v1`.
  2. Filtros facetados vindos do `meta`, período, SLA, busca com debounce de 300 ms e ordenação no servidor.
  3. Link CSV `/api/v1/chamados/exportar?…` só com `relatorio.ver`.
  4. Cartões no mobile.
  5. Vazios com e sem filtros.
- **Pronto quando:**
  - [ ] `index.test.tsx` com `renderRota` + `apiFalsa`: (a) renderiza as linhas; filtrar por status, ordenar por # e mudar de página entram na URL e na query do `GET /chamados`; renderizar de novo com a mesma URL mantém tudo; (d) 403 mostra `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.20 — Novo chamado, parte 1: formulário
- **Depende de:** T-10.18, T-9.12 · **Paralelo com:** T-10.19
- **Requisitos:** B01, B02, B04, B05, B12, S50; §6.3 (5)
- **Arquivos:** `apps/web/src/routes/_app/chamados/novo.tsx`, `apps/web/src/features/chamados/components/{novo-chamado-form.tsx,prioridade-radio.tsx}`, `apps/web/src/features/chamados/queries.ts`
- **Passos:**
  0. `novo.tsx` substitui o placeholder da T-10.0 mantendo o `validateSearch` (`equipamento`, `problema`, `pai`); `?problema=` pré-seleciona o tipo.
  1. Tipo de problema primeiro, com descrição. Área só para a equipe, entre as do tipo.
  2. Assunto com contador, descrição em `MarkdownEditor` e prioridade em pílulas.
  3. Departamento e ativo (`ComboboxField` com `/ativos/busca`, ou `?equipamento=` por etiqueta).
  4. Contato, e-mail e telefone pré-preenchidos.
  5. "Abrir em nome de" (`/usuarios/busca`), canal e tags, só para a equipe.
- **Pronto quando:**
  - [ ] `novo.test.tsx` com `renderRota` + `apiFalsa`: (a) renderiza o formulário com o `meta`; (b) submit faz `POST /chamados` com o body esperado e leva ao detalhe com o toast "Chamado #N aberto"; (c) 400 com `detalhes` aparece no campo; (d) 403 mostra `ErrorState`;
  - [ ] USUARIO não vê área nem canal (teste);
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.21 — Novo chamado, parte 2: sugestões, reincidência, rascunho e anexos
- **Depende de:** T-10.20, T-8.4, T-6.6 · **Paralelo com:** T-10.22
- **Requisitos:** B16, B17, B20
- **Arquivos:** `apps/web/src/features/chamados/components/{artigos-sugeridos.tsx,reincidencia-panel.tsx,novo-chamado-form.tsx}`, `apps/web/src/features/anexos/queries.ts`
- **Passos:**
  1. "Isto pode resolver": debounce de 400 ms e ≥ 4 caracteres. "Isso resolveu" limpa o rascunho e abre o artigo.
  2. Painel de reincidência quando há ativo ou problema.
  3. Rascunho em `vinimon:u<id>:rascunho:novo-chamado` (debounce de 1 s) com o banner "Rascunho restaurado [Descartar]".
  4. Anexos sobem depois da criação, em sequência e com progresso (`enviarArquivo`). Falha mostra o toast "1 anexo não foi enviado — reenvie na aba Anexos".
  5. O dropzone some quando `anexos.habilitados` está desligado.
- **Pronto quando:**
  - [ ] `novo.test.tsx` com `renderRota` + `apiFalsa`: digitar "impressora" mostra a sugestão; renderizar de novo restaura o rascunho de `vinimon:u<id>:rascunho:novo-chamado`; após criar, os anexos são enviados em sequência com o `chamadoId` devolvido; falha de upload mostra o toast;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.22 — Detalhe: layout, cabeçalho, trilho e aba Detalhes
- **Depende de:** T-10.18, T-5.6 · **Paralelo com:** T-10.21
- **Requisitos:** §6.3 (6)
- **Arquivos:** `apps/web/src/routes/_app/chamados/$chamadoId/{route.tsx,detalhes.tsx}`, `apps/web/src/features/chamados/components/{chamado-header.tsx,quick-actions-rail.tsx,operador-select.tsx,chamado-detalhes.tsx}`
- **Passos:**
  1. `route.tsx` substitui o placeholder da T-10.0, mantendo o `params.parse` com `z.coerce.number()`; parse com erro dá `notFound()`.
  2. Loader com `ensureQueryData`; abas via `RouteTabs`.
  3. O trilho mostra propriedades editáveis só quando `acoes.*` permite; mudanças disparam mutações com `versao`.
  4. O trilho vira Sheet abaixo de xl.
  5. A aba Detalhes mostra "Aberto por X em nome de Y" e `Progress` de SLA.
  6. Cabeçalho com `AvatarGroup` (solicitante, operador, participantes) com presença. Botão `Bell`/`BellOff` "Seguir"/"Deixar de seguir" no cabeçalho, conforme `detalhe.seguindo`, chamando `chamadosApi.seguir`/`deixarDeSeguir` e atualizando o cache do detalhe.
- **Pronto quando:**
  - [ ] `detalhes.test.tsx` com `renderRota` + `apiFalsa`: (a) renderiza cabeçalho e trilho com o detalhe; (b) trocar a prioridade pelo trilho faz o PATCH com `versao` e atualiza o cabeçalho; "Seguir" chama o contrato e alterna para "Deixar de seguir"; (c) 409 por versão mostra o toast "Recarregue"; (d) 403/404 mostram `ErrorState` e `/chamados/abc` mostra `NotFoundState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.23 — Diálogos de ação
- **Depende de:** T-10.22, T-5.10 · **Paralelo com:** T-10.24
- **Requisitos:** §3.5 (ações)
- **Arquivos:** `apps/web/src/features/chamados/components/{encaminhar-dialog.tsx,concluir-dialog.tsx,reabrir-dialog.tsx,cancelar-dialog.tsx,agendar-popover.tsx,assumir-button.tsx,operador-select.tsx}`, `apps/web/src/features/chamados/queries.ts`
- **Passos:**
  1. Uma mutação por ação. `onSuccess` faz `setQueryData(detalhe)` e invalida listas e contagens.
  2. Assumir com outro responsável pede confirmação e reenvia com `confirmarTroca:true`.
  3. A caixa "Marcar como primeira resposta" aparece quando a config é ESCOLHA.
  4. `OperadorSelect` mostra `PresenceIndicator` em cada opção.
- **Pronto quando:**
  - [ ] testes dos diálogos com `renderRota` + `apiFalsa`: assumir, encaminhar, agendar, concluir, reabrir e cancelar chamam cada um o contrato esperado com o body esperado (assumir com outro responsável reenvia com `confirmarTroca:true`); 400 com `detalhes` aparece no campo; 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.24 — Conversa: lista de mensagens
- **Depende de:** T-10.22, T-6.3 · **Paralelo com:** T-10.23
- **Requisitos:** TM1; §6.2 (acessibilidade da conversa), §6.3 (6)
- **Arquivos:** `apps/web/src/routes/_app/chamados/$chamadoId/index.tsx`, `apps/web/src/features/conversa/{queries.ts,components/conversa-view.tsx,components/message-list.tsx,components/message-bubble.tsx,components/system-event.tsx,components/descricao-inicial-card.tsx,components/new-messages-pill.tsx}`
- **Passos:**
  1. `useInfiniteQuery` com `antesDe`. "Carregar anteriores" preserva a rolagem pela diferença de `scrollHeight`.
  2. Agrupamento por autor em até 5 min e separadores de data (`rotuloSeparador`).
  3. Mensagem interna com `bg-private`; menção a mim com `bg-mention`.
  4. `?foco=` centraliza, aplica `animate-destaque` e remove o parâmetro com `replace`.
  5. `role="log"`, cada mensagem num `<article>`.
  6. Avatar de cada autor com `UserAvatar mostrarPresenca`; os ids dos autores visíveis passam por `usePresenca(ids)` uma vez por render da lista.
- **Pronto quando:**
  - [ ] `index.test.tsx` com `renderRota` + `apiFalsa`: um link com `?foco=` centraliza e destaca; 403/404 mostram `ErrorState`;
  - [ ] teste com socket falso: `presenca:mudou` muda o `sr-only` do avatar do autor;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.25 — Compositor, menções e envio otimista
- **Depende de:** T-10.24, T-6.2 · **Paralelo com:** —
- **Requisitos:** TM5; S100, B16; §6.3 (Compositor)
- **Arquivos:** `apps/web/src/features/conversa/{cache.ts,cache.test.ts,components/composer.tsx,components/mention-popover.tsx}`, `apps/web/src/features/conversa/queries.ts`
- **Passos:**
  1. `cache.ts`: `mesclarAssentamento(paginas, dto)`. Se o id existe, substitui; se o `clienteId` é de um pendente, substitui o pendente; senão, insere. Ordena por id, com os pendentes no fim.
  2. Compositor:
     - `@` abre o popover (`/mencionaveis`, debounce de 150 ms, ↑↓ Enter Tab Esc);
     - `serializarComposer` no envio;
     - Toggle "Interno" só para a equipe;
     - Enter ou Ctrl+Enter conforme `enviarComEnter`.
  3. Estados da mensagem: Clock (enviando), Check (enviada), "Não enviada. Tentar novamente (mesmo `clienteId`) / Descartar".
  4. `mencoesIgnoradas` gera o toast "Fulano não tem acesso a este chamado".
  5. Botão `Paperclip`, arrastar sobre a conversa e colar imagem anexam ao comentário: primeiro o POST do comentário, depois `enviarArquivo` com `assentamentoId` e `interno` iguais aos do comentário, mostrando o progresso na bolha. Some quando `anexos.habilitados=false`.
- **Pronto quando:**
  - [ ] testes de `mesclarAssentamento`;
  - [ ] teste com `apiFalsa` respondendo erro de rede (status 0) ao POST: a bolha mostra "Não enviada", e "Tentar novamente" reenvia com o mesmo `clienteId`;
  - [ ] teste: colar imagem + Enter faz POST assentamento e depois POST anexos com o `assentamentoId` devolvido;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Sonnet
- **Tamanho:** M

### T-10.26 — Conversa em tempo real: sala, digitação e "Visto por"
- **Depende de:** T-10.25, T-10.13, T-7.3 · **Paralelo com:** T-10.27
- **Requisitos:** TM1, TM3, TM4; S93, S98
- **Arquivos:** `apps/web/src/features/conversa/{hooks.ts,hooks.test.ts,components/typing-indicator.tsx,components/read-receipt.tsx}`, `apps/web/src/features/conversa/components/conversa-view.tsx`
- **Passos:**
  1. `useSalaDoChamado(id)`: `chamado:entrar` ao montar e em cada `connect`; `acessoRevogado` leva ao toast "Você não tem mais acesso" e à lista.
  2. `assentamento:novo` faz `mesclarAssentamento`. Mensagem nova só rola sozinha a até 120 px do fim; senão, aparece a pílula.
  3. `useDigitando`: throttle de 3 s, `false` ao enviar, no blur e após 5 s; a recepção expira em 6 s; texto em `aria-live`.
  4. `useLeituras`: `POST leitura` com debounce de 1 s quando o sentinela do fim está visível, a aba visível e a janela com foco. "Visto por Ana, João +2".
- **Pronto quando:**
  - [ ] teste com timers falsos para digitação;
  - [ ] teste com socket falso: `digitando` recebido mostra "está digitando" em `aria-live`; `leitura` recebida mostra "Visto por"; `assentamento:novo` mescla a mensagem (o cenário com duas abas fica no spec Playwright da área);
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Sonnet
- **Tamanho:** M

### T-10.27 — Solução e validação pelo solicitante
- **Depende de:** T-10.24, T-5.9 · **Paralelo com:** T-10.26, T-10.28
- **Requisitos:** C13, C14; §6.3 (Chamado concluído)
- **Arquivos:** `apps/web/src/features/conversa/components/{solucao-card.tsx,validacao-card.tsx,encerrado-bar.tsx,validacao-card.test.tsx}`
- **Passos:**
  1. `ValidacaoCard`: `RadioGroup` com Ótimo, Bom, Regular e Ruim (ícones `Laugh`, `Smile`, `Meh`, `Frown`) e comentário, ou "Não resolveu" com motivo obrigatório.
  2. Barra "Encerrado em … [Reabrir]".
- **Pronto quando:**
  - [ ] o solicitante avalia só pelo teclado (teste);
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-10.28 — Aba Anexos
- **Depende de:** T-10.21, T-10.22, T-6.6 · **Paralelo com:** T-10.27, T-10.29
- **Requisitos:** S70, S71
- **Arquivos:** `apps/web/src/routes/_app/chamados/$chamadoId/anexos.tsx`, `apps/web/src/features/anexos/{queries.ts,components/anexos-view.tsx,components/anexo-card.tsx,components/anexo-preview-dialog.tsx}`
- **Passos:**
  1. Grade de cards e dropzone; o toggle "Interno" aparece só para a equipe.
  2. Prévia só para imagens (png, jpeg, gif, webp): `<img src="/api/v1/anexos/:id" loading="lazy">` no `AnexoPreviewDialog`. PDF e demais tipos não têm prévia, só o botão "Baixar". Não usar iframe, embed nem object.
  3. Download via `<a href="/api/v1/anexos/:id">`.
  4. "Excluir" só para ADMIN, com confirmação.
- **Pronto quando:**
  - [ ] `anexos.test.tsx` com `renderRota` + `apiFalsa`: (a) renderiza os cards; (b) enviar chama `enviarArquivo` com `interno` esperado; o link de download aponta para `/api/v1/anexos/:id`; imagem abre prévia e PDF só mostra "Baixar"; (c) 400 com `detalhes` aparece; (d) 403/404 mostram `ErrorState`;
  - [ ] `grep -rn '<iframe' apps/web/src` vazio;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-10.29 — Aba Histórico e impressão
- **Depende de:** T-10.22 · **Paralelo com:** T-10.27, T-10.28
- **Requisitos:** C22, C23
- **Arquivos:** `apps/web/src/routes/_app/chamados/$chamadoId/{historico.tsx,imprimir.tsx}`, `apps/web/src/features/historico/{queries.ts,components/historico-timeline.tsx,textos.ts}`
- **Passos:**
  1. `textos.ts`: o texto de cada `TipoEvento` a partir de `dados`.
  2. Filtro: Tudo, Status, Atribuição, SLA e Anexos.
  3. `imprimir.tsx`: dados, descrição, comentários **públicos**, solução e avaliação, com `data-print` e `window.print()` no botão.
- **Pronto quando:**
  - [ ] a prévia de impressão sai sem app bar e sem comentário interno;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-10.30 — Painel
- **Depende de:** T-10.4, T-8.1 · **Paralelo com:** T-10.31–T-10.37
- **Requisitos:** G03; §6.3 (8)
- **Arquivos:** `apps/web/src/routes/_app/painel.tsx`, `apps/web/src/features/painel/{queries.ts,components/kpi-grid.tsx,components/graficos.tsx,components/sla-proximos-table.tsx}`, `apps/web/src/components/display/chart-card.tsx`
- **Passos:**
  1. `StatCard`s clicáveis levam a `/chamados?visao=…`.
  2. Gráficos Recharts do shadcn, com `corDeGrafico` e "Ver como tabela".
  3. Filtros de período, área e modo na URL.
  4. Versão reduzida para USUARIO.
- **Pronto quando:**
  - [ ] o toggle mostra a `<table>`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.31 — Relatórios
- **Depende de:** T-10.4, T-8.3 · **Paralelo com:** T-10.30, T-10.32–T-10.37
- **Requisitos:** G04
- **Arquivos:** `apps/web/src/routes/_app/relatorios/{route.tsx,index.tsx,$relatorio.tsx}`, `apps/web/src/features/relatorios/{queries.ts,components/relatorio-filtros.tsx,components/relatorio-tabela.tsx}`
- **Passos:**
  1. Layout com `exigir('relatorio.ver')`. O `index` redireciona para `visao-geral`; um `$relatorio` desconhecido dá `notFound()`.
  2. Filtros na URL, KPIs, gráfico, tabela ordenável no cliente, link CSV e impressão.
- **Pronto quando:**
  - [ ] a impressão sai sem o shell;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.32 — Conhecimento: lista e artigo
- **Depende de:** T-10.4, T-8.4 · **Paralelo com:** T-10.30, T-10.31, T-10.33–T-10.37
- **Requisitos:** F01, S108
- **Arquivos:** `apps/web/src/routes/_app/conhecimento/{route.tsx,index.tsx,$artigoId/index.tsx}`, `apps/web/src/features/conhecimento/{queries.ts,components/categorias-pane.tsx,components/artigo-view.tsx}`
- **Passos:**
  1. Painel de categorias e busca.
  2. Artigo em `.markdown-artigo`, com "Foi útil?" e "Abrir chamado" (`/chamados/novo?problema=`).
  3. O badge "Interno" aparece para a equipe.
- **Pronto quando:**
  - [ ] uma busca sem resultado mostra o EmptyState com "Abrir chamado";
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.33 — Conhecimento: editor
- **Depende de:** T-10.32 · **Paralelo com:** T-10.34–T-10.37
- **Requisitos:** F01
- **Arquivos:** `apps/web/src/routes/_app/conhecimento/{novo.tsx,$artigoId/editar.tsx}`, `apps/web/src/features/conhecimento/components/artigo-form.tsx`
- **Passos:**
  1. Campos: título, resumo, categoria, tipos de problema (multi), visibilidade, situação e conteúdo (`MarkdownEditor`).
  2. `useAlteracoesNaoSalvas`. Excluir com confirmação.
- **Pronto quando:**
  - [ ] `novo.test.tsx` e `editar.test.tsx` com `renderRota` + `apiFalsa`: (a) renderização com os dados; (b) salvar chama o contrato esperado com o body esperado (visibilidade INTERNO incluída); (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState` (USUARIO em `/conhecimento/novo`);
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-10.34 — Inventário: lista e edição
- **Depende de:** T-10.4, T-8.5 · **Paralelo com:** T-10.30–T-10.33, T-10.35–T-10.37
- **Requisitos:** I01
- **Arquivos:** `apps/web/src/routes/_app/inventario/{route.tsx,index.tsx}`, `apps/web/src/features/inventario/{queries.ts,components/tipos-pane.tsx,components/ativos-table.tsx,components/ativo-sheet.tsx}`
- **Passos:**
  1. Layout com `exigir('inventario.ver')`.
  2. Tabela com filtros e cores de situação (§6.3, item 10).
  3. `AtivoSheet` com `inventario.gerenciar`.
- **Pronto quando:**
  - [ ] `index.test.tsx` com `renderRota` + `apiFalsa`: (a) renderiza os ativos; (b) criar um ativo e editar o departamento chamam `POST /ativos` e `PATCH /ativos/:id` com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403 (USUARIO) mostra `ErrorState`/`/sem-permissao`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.35 — Inventário: detalhe e etiqueta QR
- **Depende de:** T-10.34 · **Paralelo com:** T-10.30–T-10.33, T-10.36, T-10.37
- **Requisitos:** I02
- **Arquivos:** `apps/web/src/routes/_app/inventario/$ativoId.tsx`, `apps/web/src/features/inventario/components/{etiqueta-qr-dialog.tsx,ativo-chamados.tsx}`
- **Passos:**
  1. Abas Dados e Chamados.
  2. QR com `QRCodeSVG` para `${location.origin}/chamados/novo?equipamento=<etiqueta>`.
  3. Impressão em 50×30 mm via `@page { size: 50mm 30mm }` dentro de `@media print`, só no diálogo.
- **Pronto quando:**
  - [ ] o QR decodifica para a URL esperada (teste com o `value` da prop);
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-10.36 — Perfil: conta, aparência e notificações
- **Depende de:** T-10.4, T-10.15, T-6.9 · **Paralelo com:** T-10.30–T-10.35, T-10.37
- **Requisitos:** §6.3 (13)
- **Arquivos:** `apps/web/src/routes/_app/perfil/{route.tsx,index.tsx,aparencia.tsx,notificacoes.tsx}`, `apps/web/src/features/perfil/{queries.ts,components/preferencias-notificacao-table.tsx}`
- **Passos:**
  1. Conta: login e perfil só leitura.
  2. Aparência: tema em 3 cartões, densidade e "Enter envia".
  3. Notificações:
     - estado da permissão do navegador, com "Ativar" e "Testar";
     - matriz tipo × {No aplicativo, Área de trabalho}, com os tipos fixos travados;
     - desligar o in-app desliga o desktop.
- **Pronto quando:**
  - [ ] `notificacoes.test.tsx` com `renderRota` + `apiFalsa`: salvar envia as preferências esperadas e renderizar de novo com a resposta do GET mostra os mesmos valores; desligar o in-app desliga o desktop;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-10.37 — Perfil: segurança e sessões
- **Depende de:** T-10.36, T-2.9 · **Paralelo com:** T-10.30–T-10.35
- **Requisitos:** S24, S29, S30
- **Arquivos:** `apps/web/src/routes/_app/perfil/{seguranca.tsx,sessoes.tsx}`, `apps/web/src/features/perfil/components/{trocar-senha-card.tsx,dois-fatores-card.tsx,sessoes-table.tsx}`
- **Passos:**
  1. Trocar senha. O toast avisa que as outras sessões foram encerradas.
  2. 2FA: "Gerar novos códigos" pede a senha; "Desativar" só para USUARIO.
  3. Sessões: o badge "Esta sessão", encerrar uma e encerrar as outras.
- **Pronto quando:**
  - [ ] `sessoes.test.tsx` e `seguranca.test.tsx` com `renderRota` + `apiFalsa`: (a) lista as sessões com o badge "Esta sessão"; (b) "Encerrar" chama o contrato de encerrar sessão (T-2.9) com o id da linha e "Encerrar as outras" chama o contrato esperado; trocar senha envia o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P
