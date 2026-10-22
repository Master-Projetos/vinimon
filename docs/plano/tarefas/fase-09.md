> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 9 — Web: fundação e design system

### T-9.1 — Scaffold de `apps/web`
- **Depende de:** T-1.10 · **Paralelo com:** Fases 2–8
- **Requisitos:** S37, S77, S81; §3.12 (Vite), §6.6
- **Arquivos:** `apps/web/{package.json,vite.config.ts,tsconfig.json,tsconfig.app.json,tsconfig.node.json,index.html}`, `apps/web/public/theme-init.js`, `apps/web/src/main.tsx`, `apps/web/src/routes/__root.tsx`, `apps/web/src/routeTree.gen.ts`
- **Passos:**
  1. Versões exatas da §2.2. Acrescentar às devDependencies `@tanstack/router-cli@1.167.45`, que usa o mesmo `@tanstack/router-generator@1.167.45` do `@tanstack/router-plugin@1.168.47` (se a §2.2 fixar outra versão do plugin, usar o CLI com o mesmo router-generator). O script `typecheck` do web começa com `tsr generate && ` (o `routeTree.gen.ts` é regenerado antes do `tsc`).
  2. `index.html` conforme `docs/plano/relatorios/design.md` §1.11 (index.html e theme-init.js) (`lang="pt-BR"`, sem script inline, `<script src="/theme-init.js">` antes do módulo).
  3. `theme-init.js`: o de `docs/plano/relatorios/design.md` §1.11 (tema e densidade) mais, na primeira linha, `window.__zod_globalConfig = { jitless: true };` (S77).
  4. `main.tsx` mínimo: `createRoot(...).render(<p>Vinimon</p>)`.
  5. `src/routes/__root.tsx` mínimo, só para o `tsr generate` ter o que gerar: `export const Route = createRootRoute({ component: () => <p>Vinimon</p> })` (de `@tanstack/react-router`). Rodar `pnpm -F @vinimon/web exec tsr generate` e commitar `src/routeTree.gen.ts`. O `main.tsx` continua sem router; a T-9.7 liga o router e sobrescreve os dois arquivos.
- **Pronto quando:**
  - [ ] `pnpm -F @vinimon/web build` gera `dist/`;
  - [ ] `grep -c 'theme-init' apps/web/index.html` dá 1;
  - [ ] `grep -c 'tsr generate && ' apps/web/package.json` dá 1;
  - [ ] `pnpm -F @vinimon/web exec tsr generate` roda sem erro;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-9.2 — Tokens, fontes, testes do front, ícones e CI
- **Depende de:** T-9.1, T-1.11 · **Paralelo com:** —
- **Requisitos:** §6.1 (`globals.css` literal), S77
- **Arquivos:** `apps/web/src/styles/globals.css`, `apps/web/src/main.tsx`, `apps/web/vitest.config.ts`, `apps/web/src/test/setup.ts`, `apps/web/public/{favicon.svg,icon-192.png}`, `apps/web/package.json`, `.github/workflows/ci.yml`
- **Passos:**
  1. Copiar `globals.css` literal. `main.tsx` importa `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono` e o CSS.
  2. Vitest: jsdom, `setupFiles` com `@testing-library/jest-dom/vitest`, alias `@`.
  3. `favicon.svg`: quadrado `#3b5bd4` com "V" branco.
  4. `icon-192.png`, gerado uma vez com:
     ```bash
     node -e "const z=require('zlib'),f=require('fs');const w=192,r=Buffer.alloc(1+w*3);for(let x=0;x<w;x++)r.set([0x3b,0x5b,0xd4],1+x*3);const c=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const k=Buffer.alloc(4);k.writeUInt32BE(z.crc32(td));return Buffer.concat([l,td,k])};const h=Buffer.alloc(13);h.writeUInt32BE(w,0);h.writeUInt32BE(w,4);h[8]=8;h[9]=2;f.writeFileSync('apps/web/public/icon-192.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),c('IHDR',h),c('IDAT',z.deflateSync(Buffer.concat(Array(w).fill(r)))),c('IEND',Buffer.alloc(0))]))"
     ```
  5. No CI, o último passo volta a ser `pnpm build`.
- **Pronto quando:**
  - [ ] `pnpm -F @vinimon/web test` roda (`--passWithNoTests`);
  - [ ] `file apps/web/public/icon-192.png` mostra "PNG image data, 192 x 192";
  - [ ] o CI verde roda `pnpm build`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-9.3 — shadcn/ui
- **Depende de:** T-9.2 · **Paralelo com:** —
- **Requisitos:** §6.4
- **Arquivos:** `apps/web/components.json`, `apps/web/src/lib/utils.ts`, `apps/web/src/components/ui/*` (gerados), `apps/web/package.json`
- **Passos:**
  1. Itens 1–3 da §6.4. Se o CLI sobrescrever `globals.css`, restaure com `git checkout apps/web/src/styles/globals.css`.
  2. Componente que faltar no registro: anote no commit e siga em frente (a T-9.4 cria o equivalente).
- **Pronto quando:**
  - [ ] `ls apps/web/src/components/ui | wc -l` ≥ 37 (ou os faltantes listados no commit);
  - [ ] `git grep -n dangerouslySetInnerHTML -- apps/web/src ':!apps/web/src/components/ui/**'` vazio;
  - [ ] `git diff --stat apps/web/src/styles/globals.css` vazio;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-9.4 — Tema, densidade e ajustes do shadcn
- **Depende de:** T-9.3, T-9.5 · **Paralelo com:** —
- **Requisitos:** §6.4 (item 4), `docs/plano/relatorios/design.md` §1.11 e §1.12
- **Arquivos:** `apps/web/src/components/theme/{theme-provider.tsx,density-provider.tsx,theme-provider.test.tsx}`, `apps/web/src/components/ui/{sonner.tsx,button.tsx,badge.tsx}` e `ring` em `components/ui/*` (gerados)
- **Passos:**
  1. `ThemeProvider` com `{tema, temaEfetivo, definirTema}` e `DensityProvider`, conforme `docs/plano/relatorios/design.md` §1.11. A persistência passa por `lib/storage.ts` (chaves `vinimon:tema` e `vinimon:densidade`).
  2. Ajustes com conferência por grep:
     - `ring-ring/50` → `ring-ring`;
     - destructive com `bg-destructive-solid` e sem `dark:bg-destructive/60`;
     - `sonner.tsx` com `useTheme` próprio;
     - os componentes equivalentes que faltaram na T-9.3.
- **Pronto quando:**
  - [ ] `grep -rn "ring-ring/50\|next-themes\|dark:bg-destructive/60" apps/web/src` vazio;
  - [ ] o teste mostra que `definirTema('ESCURO')` põe `dark` no `<html>`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-9.5 — Cliente HTTP, QueryClient e storage
- **Depende de:** T-9.2 · **Paralelo com:** T-9.3
- **Requisitos:** S33, S80; §7 (`lib/api.ts`, `query-client.ts`)
- **Arquivos:** `apps/web/src/lib/{api.ts,api.test.ts,query-client.ts,storage.ts,storage.test.ts}`, `apps/web/package.json`
- **Passos:**
  1. `api.ts` literal, mais `enviarArquivo(caminho, arquivos: File[], campos: Record<string,string>, aoProgresso: (pct:number)=>void, signal?)` com XHR, `X-CSRF-Token`, `withCredentials` e o mesmo tratamento de `ErroApi`.
  2. `query-client.ts` literal.
  3. `storage.ts`: `ler<T>(chave, padrao)`, `gravar`, `remover`, prefixo `vinimon:`, `try/catch`. Só tema, densidade, recentes, colunas, painel e rascunho (S80). Chaves de dados do usuário levam o id: `vinimon:u<id>:rascunho:novo-chamado`, `vinimon:u<id>:recentes`. `limparDadosDoUsuario()` remove todas as chaves `vinimon:u*`.
- **Pronto quando:**
  - [ ] testes com `fetch` simulado: 200 (parse e `Date`), 204, 400 com `detalhes`, 401, rede (status 0), `CSRF_INVALIDO` renova e repete **uma** vez;
  - [ ] teste: `limparDadosDoUsuario()` remove `vinimon:u7:recentes` e mantém `vinimon:tema`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-9.6 — Cores, datas e rótulos
- **Depende de:** T-9.2 · **Paralelo com:** T-9.5, T-9.7–T-9.15
- **Requisitos:** §6.1 (`cores.ts` e testes)
- **Arquivos:** `apps/web/src/lib/{cores.ts,cores.test.ts,datas.ts,datas.test.ts,rotulos.ts}`, `apps/web/package.json`
- **Passos:**
  1. `cores.ts` literal.
  2. `datas.ts` com date-fns `ptBR`: `formatarData`, `formatarDataHora`, `formatarHora`, `formatarCurto(d, agora)`, `formatarRelativo(d, agora)`, `formatarDuracao(min)`, `rotuloSeparador(d, agora)`. Fuso: `America/Sao_Paulo` via `Intl.DateTimeFormat` com `timeZone` vindo da config pública (padrão `America/Sao_Paulo`).
  3. `rotulos.ts`: rótulos pt-BR de perfil, tipo e papel de status, situação de ativo e de artigo, nota de avaliação, presença, visões, tipo de notificação e situação de SLA.
- **Pronto quando:**
  - [ ] os testes de cores da §6.1 passam;
  - [ ] datas: hoje, ontem, virada de ano, "3 h 20 min";
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-9.7 — Router, raiz, guarda do `_app` e consultas de auth
- **Depende de:** T-9.5, T-9.4 · **Paralelo com:** T-9.6
- **Requisitos:** S79, S80; §6.6 (regras do front), §7 (`features/auth/queries.ts`)
- **Arquivos:** `apps/web/src/{router.tsx,main.tsx,routeTree.gen.ts}`, `apps/web/src/routes/{__root.tsx,_app.tsx,login.tsx,trocar-senha.tsx,configurar-2fa.tsx,_app/index.tsx}`, `apps/web/src/features/auth/queries.ts`
- **Passos:**
  1. `router.tsx` com `defaultPreload:'intent'`, `defaultPendingMs:150`, `defaultPendingMinMs:300` e o `declare module`.
  2. `main.tsx`:
     - `configurarZod()`;
     - `criarQueryClient(() => { qc.setQueryData(authChaves.sessao, null); router.navigate({ to: '/login', search: { redirect: location.pathname } }); toast('Sua sessão expirou. Entre novamente.') })`;
     - `definirRenovadorCsrf(...)`;
     - providers de tema e densidade, `RouterProvider` e `Toaster`.
  3. `_app.tsx` `beforeLoad` conforme a §6.6, devolvendo `{ sessao }`.
  4. `login.tsx` provisório com `validateSearch` (`redirect` filtrado pela regex S79). `_app/index.tsx` provisório. `trocar-senha.tsx` e `configurar-2fa.tsx` provisórios (só `createFileRoute` e um texto), para que a T-10.1 já possa navegar para eles; a T-10.2 substitui o conteúdo.
  5. Rodar `pnpm -F @vinimon/web exec tsr generate` e commitar `src/routeTree.gen.ts`.
- **Pronto quando:**
  - [ ] `pnpm dev` com `/` sem sessão vai para `/login`;
  - [ ] `routeTree.gen.ts` commitado, com `/trocar-senha` e `/configurar-2fa`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-9.8 — Componentes de feedback
- **Depende de:** T-9.7 · **Paralelo com:** T-9.9–T-9.15
- **Requisitos:** §6.3 (estados), §6.5
- **Arquivos:** `apps/web/src/components/feedback/{empty-state.tsx,error-state.tsx,page-skeleton.tsx,confirm-dialog.tsx,not-found-state.tsx,feedback.test.tsx}`, `apps/web/src/router.tsx`
- **Passos:**
  1. Props de `docs/plano/relatorios/design.md` §5.2 (bloco feedback/).
  2. `ErrorState`: mensagem por status (403/404/0/5xx) e `requestId` com botão de copiar.
  3. `ConfirmDialog`: foco inicial em "Cancelar".
  4. Ligar `defaultPendingComponent`, `defaultErrorComponent` e `defaultNotFoundComponent`.
- **Pronto quando:**
  - [ ] uma rota inexistente mostra `NotFoundState`;
  - [ ] o teste de `ErrorState` mostra o `requestId`;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-9.9 — Display, parte 1: badges, SLA e tempo
- **Depende de:** T-9.6 · **Paralelo com:** T-9.8, T-9.10–T-9.15
- **Requisitos:** §6.1 (aplicação de cor), §6.5
- **Arquivos:** `apps/web/src/components/display/{color-badge.tsx,status-badge.tsx,prioridade-badge.tsx,sla-badge.tsx,relative-time.tsx,display.test.tsx}`, `apps/web/src/hooks/use-agora.ts`, `apps/web/package.json`
- **Passos:**
  1. `ColorBadge` define as variáveis `--b-*` com `obterCores`.
  2. `SlaBadge` usa `situacaoSla` de shared com ícone e texto (`Clock`, `Hourglass`, `TriangleAlert`, `CircleCheck`, pausado).
  3. `RelativeTime` renderiza `<time dateTime title>`.
- **Pronto quando:**
  - [ ] o teste mostra `contraste(fg, bg) ≥ 4,5` para `#ffff00`;
  - [ ] o `SlaBadge` ESTOURADO tem texto "Vencido";
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-9.10 — Display, parte 2: avatar, presença e blocos
- **Depende de:** T-9.6 · **Paralelo com:** T-9.8, T-9.9, T-9.11–T-9.15
- **Requisitos:** §6.2 (acessibilidade), §6.5
- **Arquivos:** `apps/web/src/components/display/{user-avatar.tsx,avatar-group.tsx,presence-indicator.tsx,key-value-grid.tsx,stat-card.tsx,kbd-shortcut.tsx,pode.tsx,display2.test.tsx}`, `apps/web/package.json`
- **Passos:**
  1. Avatar com iniciais e a cor por `id % 8` (§6.1).
  2. `PresenceIndicator` com glifo e `sr-only` ("Disponível").
  3. `Pode` usa `temPermissao(sessao.usuario.perfil, p)`.
  4. `KbdShortcut` mostra ⌘ no Mac.
- **Pronto quando:**
  - [ ] o texto `sr-only` da presença existe;
  - [ ] `Pode` esconde o conteúdo para USUARIO;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-9.11 — Formulários, parte 1
- **Depende de:** T-9.4 · **Paralelo com:** T-9.8–T-9.10, T-9.12–T-9.15
- **Requisitos:** §7 (`lib/form.ts`, `campo-form.tsx`)
- **Arquivos:** `apps/web/src/lib/form.ts`, `apps/web/src/components/form/{campo-form.tsx,password-input.tsx,password-strength.tsx,autosize-textarea.tsx,form.test.tsx}`
- **Passos:**
  1. `lib/form.ts` e `campo-form.tsx` literais.
  2. `PasswordStrength` carrega sob demanda com `const { ZxcvbnFactory } = await import('@zxcvbn-ts/core')` (e os dicionários `@zxcvbn-ts/language-common` e `@zxcvbn-ts/language-pt-br`), com a mesma construção preguiçosa da T-2.1 (`fabrica ??= new ZxcvbnFactory({ dictionary: { ...common.dictionary, ...ptBr.dictionary }, graphs: common.adjacencyGraphs, translations: ptBr.translations })` e `await fabrica.checkAsync(senha, userInputs)`), e mostra barra e texto. Se a §2.2 fixar a 3.0.4, usar a API `zxcvbnOptions`/`zxcvbnAsync` dessa versão e registrar a versão no commit.
  3. `AutosizeTextarea` com 1 a 10 linhas.
- **Pronto quando:**
  - [ ] o teste mostra que o erro do servidor gera `aria-invalid` e `aria-describedby` apontando para o erro;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-9.12 — Formulários, parte 2: seleção, datas e cor
- **Depende de:** T-9.11 · **Paralelo com:** T-9.13–T-9.15
- **Requisitos:** §6.5
- **Arquivos:** `apps/web/src/components/form/{combobox-field.tsx,multi-combobox-field.tsx,date-picker.tsx,date-time-picker.tsx,date-range-picker.tsx,color-field.tsx,form2.test.tsx}`
- **Passos:**
  1. `ComboboxField` com `opcoes` ou `buscar(termo, signal)`, debounce de 200 ms e Popover + Command.
  2. `DateRangePicker` com atalhos (Hoje, 7 dias, 30 dias, Este mês, Mês passado).
  3. `ColorField`: prévia clara e escura com a razão de contraste ("7,1:1 · AA").
- **Pronto quando:**
  - [ ] teste de teclado (abrir, ↓, Enter) no combobox;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-9.13 — Formulários, parte 3: upload, Markdown e menção
- **Depende de:** T-9.11, T-6.1 · **Paralelo com:** T-9.12, T-9.14, T-9.15
- **Requisitos:** S78; T67 (unidade)
- **Arquivos:** `apps/web/src/components/form/{file-dropzone.tsx,upload-list.tsx,markdown-editor.tsx}`, `apps/web/src/components/display/{markdown.tsx,mention-chip.tsx,markdown.test.tsx}`
- **Passos:**
  1. `FileDropzone` (react-dropzone) com colar imagem, limite, tipos aceitos e rejeição inline.
  2. `Markdown`:
     - `react-markdown` + `remark-gfm`, **sem** `rehype-raw`;
     - antes, converte `@[Nome](usuario:ID)` em `[@Nome](usuario:ID)`;
     - `urlTransform`: `usuario:` passa, o resto usa `defaultUrlTransform`;
     - componente `a`: `usuario:` vira `MentionChip`; os demais ganham `target=_blank rel="noopener noreferrer nofollow"`.
  3. `MarkdownEditor` com abas Escrever e Visualizar.
- **Pronto quando:**
  - [ ] teste: `<script>` não vira elemento; `[x](javascript:alert(1))` não gera `href` com `javascript:`; o token vira chip;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-9.14 — Tabela de dados
- **Depende de:** T-9.4 · **Paralelo com:** T-9.12, T-9.13, T-9.15
- **Requisitos:** §6.5 (`data/`)
- **Arquivos:** `apps/web/src/components/data/{data-table.tsx,data-table-toolbar.tsx,data-table-faceted-filter.tsx,data-table-column-toggle.tsx,data-table-pagination.tsx,data-table-column-header.tsx,data-table-bulk-bar.tsx,data-table.test.tsx}`
- **Passos:**
  1. react-table v8 com `manualPagination`/`manualSorting`.
  2. `ColumnMeta` (`ocultarAbaixo`, `alinhar`).
  3. `aria-sort`; checkbox com `aria-label`; barra de ações em massa com `aria-live`.
- **Pronto quando:**
  - [ ] teste de seleção, `aria-sort` e ocultar coluna;
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** M

### T-9.15 — Hooks utilitários
- **Depende de:** T-9.7 · **Paralelo com:** T-9.8–T-9.14
- **Requisitos:** §6.6 (hooks)
- **Arquivos:** `apps/web/src/hooks/{use-debounce.ts,use-media-query.ts,use-mobile.ts,use-prefers-reduced-motion.ts,use-document-title.ts,use-copiar.ts,use-alteracoes-nao-salvas.ts,use-foco-ao-navegar.ts}`
- **Passos:**
  1. `useFocoAoNavegar`: `router.subscribe('onResolved')`; quando o `pathname` muda, foca o `h1[tabindex="-1"]`.
  2. `useAlteracoesNaoSalvas`: `useBlocker` do TanStack Router.
  3. `useDocumentTitle` monta "(n) Título · Vinimon".
- **Pronto quando:**
  - [ ] `pnpm verificar`, com um teste simples de `useDebounce` usando timers falsos.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P

### T-9.16 — Infra de teste de telas
- **Depende de:** T-9.7 · **Paralelo com:** T-9.8–T-9.15
- **Requisitos:** Convenções (critérios de tela por `<rota>.test.tsx`)
- **Arquivos:** `apps/web/src/test/{render-rota.tsx,api-falsa.ts,render-rota.test.tsx}`
- **Passos:**
  1. `renderRota(caminho, { sessao, respostas })` monta o `QueryClient`, `createMemoryHistory` do TanStack Router com o `routeTree` real e os providers (tema, densidade, `Toaster`).
  2. `apiFalsa(respostas: Record<'GET /areas'|string, unknown | ((req: Request) => Response)>)` substitui `globalThis.fetch`, devolve 404 para rota não mapeada e registra as chamadas.
  3. Em tarefa de tela, todo critério "manual" é substituído por `<rota>.test.tsx` com `renderRota` + `apiFalsa`, cobrindo (a) renderização com os dados; (b) submit chama o contrato esperado com o body esperado; (c) 400 com `detalhes` aparece no campo; (d) 403/404 mostram `ErrorState`.
- **Pronto quando:**
  - [ ] o teste renderiza `/admin/areas` com 2 itens e confere o POST enviado (até a T-10.5 existir, usar uma rota de teste montada no próprio `render-rota.test.tsx`; a T-10.5 troca para `/admin/areas`);
  - [ ] `pnpm verificar`.
- **Trilha:** W
- **Modelo:** Haiku
- **Tamanho:** P
