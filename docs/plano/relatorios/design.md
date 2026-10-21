> Relatório do especialista, copiado literalmente (referência). Em conflito vale a Parte A (`docs/plano/fundamentos/`), depois a Parte B (`docs/plano/tarefas/`), depois este relatório.

# Design moderno e UX inspirada no Microsoft Teams (apps/web)

## 0. Premissas, versões e o que foi verificado

**Telas atuais lidas** em `/home/user/vinimon/public/app.js`, `style.css` e `index.html`:
- login;
- painel (KPIs e barras);
- abrir chamado (sugestão de FAQ com debounce de 400 ms);
- lista com filtros e paginação;
- detalhe com blocos, linha do tempo com destaque "glow" e formulários de ação;
- CRUD genérico em modal;
- relatórios (CSV e impressão), FAQ, configurações, perfil;
- sino com polling de 15 s e pop-ups.

O que se mantém do sistema atual:
- o destaque animado da mensagem vinda de uma notificação (`?foco=`);
- o escape de CSV contra fórmulas;
- a sugestão de artigos enquanto o usuário digita;
- os níveis Administrador, Operador e Usuário.

**Versões consultadas com `npm view` em 2026-10-21.** Fixar no `apps/web/package.json`:

| Pacote | Versão | Observação |
|---|---|---|
| react, react-dom | ^19.3.1 | |
| vite / @vitejs/plugin-react | ^8.3.5 / ^6.1.2 | o plugin-react 6 exige vite ^8 |
| tailwindcss, @tailwindcss/vite | ^4.3.3 | |
| tw-animate-css | ^1.4.0 | |
| @tanstack/react-router / @tanstack/router-plugin | ^1.170.45 / ^1.168.47 | |
| @tanstack/react-query (+devtools) | ^5.104.5 | |
| **@tanstack/react-table** | **~8.21.3** | v9 é a `latest`, mas a API mudou. O Haiku e o guia de data-table do shadcn usam v8. **Não atualizar.** |
| react-hook-form / @hookform/resolvers | ^7.90.0 / ^6.0.0 | o resolvers 6 aceita zod ^3.25 ou ^4 |
| zod | mesma versão de packages/shared | |
| socket.io-client | ^4.8.4 | |
| @fontsource-variable/inter, @fontsource-variable/jetbrains-mono | ^5.3.0 | |
| date-fns | ^4.4.0 | locale `ptBR` vem de `date-fns/locale` |
| react-markdown / remark-gfm | ^10.1.0 / ^4.0.1 | |
| react-dropzone | ^20.1.4 | API `useDropzone` mantida; v20 aceita colar arquivos |
| qrcode.react | ^4.2.0 | usar `QRCodeSVG` |
| **typescript** | **~5.9.3** | typescript-eslint 8.72 exige TS < 6.1. O TS 7 (`latest`) fica fora. |
| vitest 5.0.5, jsdom 30, @testing-library/react 16.3.3, user-event 14.6.8, jest-dom 7.0.1 | | |
| @playwright/test 1.64.1, @axe-core/playwright 4.14.0 | | |
| eslint-plugin-jsx-a11y 6.10.2, eslint-plugin-react-hooks 7.1.1 | | |

Estas dependências o `shadcn add` instala sozinho: radix-ui, class-variance-authority, clsx, tailwind-merge, lucide-react, cmdk, sonner, recharts, react-day-picker, input-otp.

**Não usar (decisão tomada):**
- next-themes: há provider próprio.
- react-resizable-panels 4.x: a API mudou; os painéis terão largura fixa e serão recolhíveis.
- @tanstack/react-virtual: a paginação basta.
- Tiptap: o editor será textarea com markdown.
- zustand: o cache do Query e um context bastam.
- @tailwindcss/typography: haverá CSS `.markdown` próprio.
- vaul: usar `Sheet side="bottom"`.
- culori: há implementação OKLCH própria, já testada (seção 1.7).

**Achados no pacote `shadcn@4.22.1`** (inspecionado no tarball):
- `init -d` equivale a `--template=next --preset=base-nova`, ou seja, Next com Base UI. **Proibido usar `-d`.**
- O estilo `"new-york"` continua aceito.
- `-b radix` escolhe Radix.
- **Decisão:** escrever o `components.json` à mão e rodar só `shadcn add` (seção 5.1).

**Ícones em lucide-react 1.61:** os nomes canônicos foram verificados (lista na seção 1.8). Os aliases antigos (`Trash2`, `Loader2`, `AlertTriangle`) ainda são exportados, mas use os canônicos da tabela.

**A rede bloqueou `ui.shadcn.com`.** Os novos componentes `field`, `empty`, `item`, `kbd`, `spinner`, `button-group` e `input-group` (lançados em out/2025) foram confirmados por busca na web, não pelo registro. Se algum faltar no registro, a tarefa W03 registra a falha e o componente próprio equivalente da seção 5.2 é usado.

---

## 1. Linguagem visual

### 1.1 Princípios
- Visual "Fluent/Teams":
  - moldura neutra (app bar e top bar);
  - painéis com leve elevação;
  - o painel de conteúdo tem canto superior esquerdo arredondado sobre a moldura;
  - cor de marca índigo usada com parcimônia: item ativo, ações primárias, foco e menções.
- Corpo de texto em 14 px, alta densidade de informação e ícones de traço fino (1,75).
- Contraste AA em todos os pares texto/fundo e 3:1 em bordas de controles, anel de foco e gráficos. Os valores foram verificados por script; a tabela está em 1.3.

### 1.2 Tokens: `apps/web/src/styles/globals.css`

Copiar literalmente. Todos os valores estão dentro do gamut sRGB.

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));
@custom-variant compacta (&:where([data-densidade="compacta"] *));

:root {
  color-scheme: light;
  --radius: 0.5rem;

  --background: oklch(1 0 0);
  --foreground: oklch(0.21 0.012 268);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.21 0.012 268);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.21 0.012 268);
  --primary: oklch(0.52 0.19 268);            /* #3b5bd4 */
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.955 0.012 268);
  --secondary-foreground: oklch(0.30 0.05 268);
  --muted: oklch(0.962 0.005 268);
  --muted-foreground: oklch(0.50 0.016 268);
  --accent: oklch(0.952 0.022 268);
  --accent-foreground: oklch(0.36 0.12 268);
  --destructive: oklch(0.55 0.21 25);          /* texto/ícone/borda de erro */
  --destructive-solid: oklch(0.55 0.21 25);    /* fundo de botão com texto branco */
  --border: oklch(0.91 0.006 268);
  --input: oklch(0.64 0.012 268);              /* 3,37:1 – borda de campo (WCAG 1.4.11) */
  --ring: oklch(0.52 0.19 268);
  --chart-1: oklch(0.52 0.19 268);
  --chart-2: oklch(0.56 0.093 215);
  --chart-3: oklch(0.58 0.15 150);
  --chart-4: oklch(0.62 0.132 65);
  --chart-5: oklch(0.58 0.2 25);
  --sidebar: oklch(0.982 0.003 268);
  --sidebar-foreground: oklch(0.21 0.012 268);
  --sidebar-primary: oklch(0.52 0.19 268);
  --sidebar-primary-foreground: oklch(0.99 0 0);
  --sidebar-accent: oklch(0.952 0.022 268);
  --sidebar-accent-foreground: oklch(0.36 0.12 268);
  --sidebar-border: oklch(0.91 0.006 268);
  --sidebar-ring: oklch(0.52 0.19 268);

  /* Vinimon */
  --frame: oklch(0.955 0.005 268);             /* app bar + top bar (#eff0f4) */
  --frame-foreground: oklch(0.45 0.015 268);
  --pane: oklch(0.982 0.003 268);              /* painel de lista (#f8f9fb) */
  --success: oklch(0.50 0.13 150);
  --success-foreground: oklch(0.99 0 0);
  --success-soft: oklch(0.965 0.03 150);
  --success-soft-foreground: oklch(0.45 0.11 150);
  --warning: oklch(0.77 0.16 75);
  --warning-foreground: oklch(0.25 0.05 65);
  --warning-soft: oklch(0.97 0.03 85);
  --warning-soft-foreground: oklch(0.48 0.09 65);
  --info-soft: oklch(0.96 0.02 240);
  --info-soft-foreground: oklch(0.45 0.097 240);
  --danger-soft: oklch(0.96 0.018 25);
  --danger-soft-foreground: oklch(0.50 0.19 25);
  --private: oklch(0.975 0.024 85);
  --private-border: oklch(0.60 0.12 70);
  --private-foreground: oklch(0.45 0.085 70);
  --mention: oklch(0.95 0.022 268);
  --mention-foreground: oklch(0.52 0.19 268);
  --bubble-own: oklch(0.95 0.022 268);
  --bubble-other: oklch(0.962 0.005 268);
  --highlight: oklch(0.93 0.031 268);
  --presence-online: oklch(0.63 0.17 145);
  --presence-busy: oklch(0.55 0.21 25);
  --presence-away: oklch(0.66 0.147 60);
  --presence-offline: oklch(0.60 0.01 268);
  --anel-presenca: var(--background);

  /* layout */
  --appbar-w: 4.25rem;
  --topbar-h: 3rem;
  --listpane-w: 20rem;
  --rail-w: 18rem;
  --bottomnav-h: 3.5rem;
  /* densidade (confortável) */
  --row-h: 2.5rem;
  --item-py: 0.625rem;
  --msg-gap: 0.75rem;
  --pane-px: 1rem;
}
[data-densidade="compacta"] { --row-h: 2rem; --item-py: 0.375rem; --msg-gap: 0.25rem; --pane-px: 0.75rem; }

.dark {
  color-scheme: dark;
  --background: oklch(0.205 0.006 268);        /* #16171a */
  --foreground: oklch(0.96 0.003 268);
  --card: oklch(0.235 0.007 268);              /* #1d1e21 */
  --card-foreground: oklch(0.96 0.003 268);
  --popover: oklch(0.25 0.008 268);            /* #202226 */
  --popover-foreground: oklch(0.96 0.003 268);
  --primary: oklch(0.72 0.13 272);             /* #889ef6 */
  --primary-foreground: oklch(0.20 0.04 272);
  --secondary: oklch(0.28 0.01 268);
  --secondary-foreground: oklch(0.92 0.01 268);
  --muted: oklch(0.27 0.008 268);
  --muted-foreground: oklch(0.74 0.012 268);
  --accent: oklch(0.29 0.03 268);
  --accent-foreground: oklch(0.88 0.045 272);
  --destructive: oklch(0.70 0.17 22);
  --destructive-solid: oklch(0.55 0.19 25);
  --border: oklch(0.31 0.008 268);
  --input: oklch(0.56 0.012 268);
  --ring: oklch(0.74 0.13 272);
  --chart-1: oklch(0.72 0.13 272);
  --chart-2: oklch(0.75 0.12 200);
  --chart-3: oklch(0.75 0.15 150);
  --chart-4: oklch(0.80 0.14 80);
  --chart-5: oklch(0.70 0.17 25);
  --sidebar: oklch(0.185 0.006 268);
  --sidebar-foreground: oklch(0.96 0.003 268);
  --sidebar-primary: oklch(0.72 0.13 272);
  --sidebar-primary-foreground: oklch(0.20 0.04 272);
  --sidebar-accent: oklch(0.29 0.03 268);
  --sidebar-accent-foreground: oklch(0.88 0.045 272);
  --sidebar-border: oklch(0.31 0.008 268);
  --sidebar-ring: oklch(0.74 0.13 272);

  --frame: oklch(0.16 0.005 268);
  --frame-foreground: oklch(0.72 0.012 268);
  --pane: oklch(0.185 0.006 268);
  --success: oklch(0.74 0.15 150);
  --success-foreground: oklch(0.20 0.03 150);
  --success-soft: oklch(0.29 0.05 150);
  --success-soft-foreground: oklch(0.84 0.12 150);
  --warning: oklch(0.80 0.15 75);
  --warning-foreground: oklch(0.22 0.04 65);
  --warning-soft: oklch(0.30 0.05 80);
  --warning-soft-foreground: oklch(0.84 0.12 85);
  --info-soft: oklch(0.29 0.05 240);
  --info-soft-foreground: oklch(0.84 0.084 240);
  --danger-soft: oklch(0.30 0.06 25);
  --danger-soft-foreground: oklch(0.82 0.095 25);
  --private: oklch(0.29 0.045 80);
  --private-border: oklch(0.68 0.12 80);
  --private-foreground: oklch(0.88 0.09 85);
  --mention: oklch(0.30 0.05 272);
  --mention-foreground: oklch(0.72 0.13 272);
  --bubble-own: oklch(0.30 0.05 272);
  --bubble-other: oklch(0.27 0.008 268);
  --highlight: oklch(0.33 0.06 272);
  --presence-online: oklch(0.72 0.17 145);
  --presence-busy: oklch(0.66 0.2 25);
  --presence-away: oklch(0.80 0.15 75);
  --presence-offline: oklch(0.60 0.01 268);
}

@theme inline {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-solid: var(--destructive-solid);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-frame: var(--frame);
  --color-frame-foreground: var(--frame-foreground);
  --color-pane: var(--pane);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-success-soft: var(--success-soft);
  --color-success-soft-foreground: var(--success-soft-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-warning-soft: var(--warning-soft);
  --color-warning-soft-foreground: var(--warning-soft-foreground);
  --color-info-soft: var(--info-soft);
  --color-info-soft-foreground: var(--info-soft-foreground);
  --color-danger-soft: var(--danger-soft);
  --color-danger-soft-foreground: var(--danger-soft-foreground);
  --color-private: var(--private);
  --color-private-border: var(--private-border);
  --color-private-foreground: var(--private-foreground);
  --color-mention: var(--mention);
  --color-mention-foreground: var(--mention-foreground);
  --color-bubble-own: var(--bubble-own);
  --color-bubble-other: var(--bubble-other);
  --color-highlight: var(--highlight);
  --color-presence-online: var(--presence-online);
  --color-presence-busy: var(--presence-busy);
  --color-presence-away: var(--presence-away);
  --color-presence-offline: var(--presence-offline);
}

@theme {
  --text-display: 1.875rem; --text-display--line-height: 2.25rem; --text-display--font-weight: 650; --text-display--letter-spacing: -0.02em;
  --text-title: 1.25rem; --text-title--line-height: 1.75rem; --text-title--font-weight: 600; --text-title--letter-spacing: -0.01em;
  --text-pane-title: 1rem; --text-pane-title--line-height: 1.5rem; --text-pane-title--font-weight: 600;
  --text-label: 0.6875rem; --text-label--line-height: 1rem; --text-label--font-weight: 600; --text-label--letter-spacing: 0.06em;
  --text-appbar: 0.6875rem; --text-appbar--line-height: 0.875rem; --text-appbar--font-weight: 500;

  --shadow-xs: 0 1px 2px 0 oklch(0.2 0.02 268 / 0.06);
  --shadow-sm: 0 1px 2px 0 oklch(0.2 0.02 268 / 0.06), 0 1px 3px 0 oklch(0.2 0.02 268 / 0.08);
  --shadow-md: 0 2px 4px -1px oklch(0.2 0.02 268 / 0.06), 0 4px 8px -2px oklch(0.2 0.02 268 / 0.10);
  --shadow-lg: 0 4px 8px -2px oklch(0.2 0.02 268 / 0.08), 0 12px 24px -4px oklch(0.2 0.02 268 / 0.14);
  --shadow-xl: 0 8px 16px -4px oklch(0.2 0.02 268 / 0.10), 0 24px 48px -8px oklch(0.2 0.02 268 / 0.20);

  --ease-fluent: cubic-bezier(0.33, 0, 0.1, 1);
  --ease-fluent-in: cubic-bezier(0.9, 0.1, 1, 0.2);

  --animate-mensagem-entrada: mensagem-entrada 180ms var(--ease-fluent) both;
  --animate-destaque: destaque 2.4s ease-out both;
  --animate-digitando: digitando 1.2s ease-in-out infinite;
  @keyframes mensagem-entrada { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @keyframes destaque { 0%, 30% { background-color: var(--highlight); } 100% { background-color: transparent; } }
  @keyframes digitando { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-3px); opacity: 1; } }
}

@layer base {
  * { @apply border-border outline-ring; }
  html, body { @apply bg-frame; }
  body { @apply font-sans text-sm text-foreground antialiased; }
  :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  ::selection { background-color: color-mix(in oklch, var(--primary) 22%, transparent); }
  svg.lucide { stroke-width: 1.75; }
}

@layer components {
  .badge-cor { background-color: var(--b-bg); color: var(--b-fg); border-color: var(--b-borda); }
  .dark .badge-cor { background-color: var(--b-bg-d); color: var(--b-fg-d); border-color: var(--b-borda-d); }
  .badge-cor-ponto { background-color: var(--b-ponto); }
  .dark .badge-cor-ponto { background-color: var(--b-ponto-d); }

  .markdown { @apply text-sm leading-relaxed break-words; }
  .markdown > * + * { @apply mt-2; }
  .markdown h1, .markdown h2 { @apply mt-4 text-base font-semibold; }
  .markdown h3, .markdown h4 { @apply mt-3 text-sm font-semibold; }
  .markdown a { @apply text-primary underline underline-offset-2 hover:no-underline; }
  .markdown code { @apply rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]; }
  .markdown pre { @apply overflow-x-auto rounded-md bg-muted p-3; }
  .markdown pre code { @apply bg-transparent p-0; }
  .markdown ul { @apply list-disc pl-5; }
  .markdown ol { @apply list-decimal pl-5; }
  .markdown blockquote { @apply border-l-2 border-border pl-3 text-muted-foreground; }
  .markdown table { @apply w-full border-collapse text-left; }
  .markdown th, .markdown td { @apply border border-border px-2 py-1; }
  .markdown hr { @apply my-4 border-border; }
  .markdown-artigo { @apply text-base; }
  .markdown-artigo h2 { @apply mt-6 text-lg; }
  .markdown-artigo h3 { @apply mt-4 text-base; }
}

@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
@media (prefers-contrast: more) {
  :root, .dark { --border: var(--input); --muted-foreground: var(--foreground); }
}
@media print {
  html, body { background: #fff !important; color: #000 !important; }
  [data-print="ocultar"] { display: none !important; }
  [data-print="expandir"] { overflow: visible !important; height: auto !important; max-height: none !important; }
}
```

### 1.3 Contrastes verificados (WCAG, calculados a partir dos valores OKLCH)

| Par | Claro | Escuro |
|---|---|---|
| foreground sobre background, card, pane, frame, muted, bolhas, private, mention | ≥ 14,4 | ≥ 10,9 |
| muted-foreground sobre background, pane, frame, muted, accent, secondary, bolhas | ≥ 5,22 | ≥ 6,13 |
| primary sobre background, pane, frame (item ativo da app bar) | ≥ 5,07 | ≥ 7,37 |
| primary-foreground sobre primary | 5,62 | 7,18 |
| destructive (texto) sobre fundos | 5,41 | ≥ 5,55 |
| branco sobre destructive-solid | 5,41 | 5,35 |
| pares soft (success, warning, info, danger), private e mention | ≥ 4,99 | ≥ 5,43 |
| frame-foreground (rótulos da app bar, 11 px) sobre frame | 6,53 | 7,82 |
| input (borda de campo) sobre background e pane | ≥ 3,37 | ≥ 3,30 |
| ring sobre todos os fundos | ≥ 5,07 | ≥ 7,10 |
| chart-1 a chart-5 sobre card | ≥ 3,02 | ≥ 5,79 |
| cores de presença sobre card e pane | ≥ 3,24 | ≥ 3,44 |

Mínimos: texto 4,99 (claro) e 5,43 (escuro); elementos de interface 3,0 ou mais. O par `border` (1,3:1) é decorativo, e por isso as bordas de campos usam `--input`.

### 1.4 Tipografia
- Inter Variable (`import '@fontsource-variable/inter'`) e JetBrains Mono Variable (`import '@fontsource-variable/jetbrains-mono'`), ambas importadas em `main.tsx`.
- Base de 14 px (`text-sm` no body). A escala usa a padrão do Tailwind mais os utilitários semânticos definidos no `@theme`:

| Uso | Classe |
|---|---|
| Marca no login | `text-display` |
| Título de página / H1 do painel de conteúdo | `text-title` |
| Título de painel de lista, título de card | `text-pane-title` |
| Rótulo de seção (MAIÚSCULAS) | `text-label uppercase text-muted-foreground` |
| Rótulo da app bar | `text-appbar` |
| Corpo | `text-sm` |
| Meta (hora, autor, contagens) | `text-xs text-muted-foreground` |
| Número de KPI | `text-3xl font-semibold tabular-nums` |
| Nº do chamado, etiqueta, código | `font-mono text-xs` (ex.: `#125`, `PAT-0001`) |
| Corpo de artigo | `.markdown .markdown-artigo` (16 px), `max-w-prose` |

- Números em tabelas, prazos de SLA e durações sempre com `tabular-nums`.

### 1.5 Raios, sombras e espaçamento
- **Raios:** `--radius` 8 px, de onde saem `rounded-sm` (4), `rounded-md` (6), `rounded-lg` (8, cards e bolhas) e `rounded-xl` (12, canto do painel de conteúdo, diálogos). Badges usam `rounded-full`.
- **Sombras** (camadas no estilo Fluent):
  - `shadow-xs`: item ativo na lista;
  - `shadow-sm`: cards;
  - `shadow-lg`: popover e dropdown;
  - `shadow-xl`: dialog e sheet.
  - No escuro a elevação vem da cor da superfície (frame < pane < background < card < popover); a sombra fica igual.
- **Espaçamento:** grade de 4 px da escala do Tailwind.
  - Padding horizontal de painel: `px-(--pane-px)`.
  - Gap entre cards: `gap-4`.
  - Gap interno de formulário: `gap-4`.
  - Seções: `space-y-6`.
- **Medidas fixas:**
  - app bar 68 px (`--appbar-w`);
  - top bar 48 px;
  - painel de lista 320 px;
  - trilho direito 288 px;
  - barra inferior móvel 56 px;
  - cabeçalho de painel `h-14`.

### 1.6 Densidade (modo compacto)
- Atributo `data-densidade="confortavel" | "compacta"` no `<html>`. Padrão: `compacta` para nível 1 e 2, `confortavel` para nível 3. Preferência salva no servidor e espelhada em `localStorage['vinimon:densidade']`.
- **O que muda:**
  - linha de tabela `h-(--row-h)` (40 para 32 px);
  - itens de lista `py-(--item-py)`;
  - espaço entre mensagens `gap-(--msg-gap)`;
  - avatar da mensagem 32 para 24 px (`compacta:size-6`);
  - `ChamadoListItem` e `ActivityItem` escondem a 3ª linha (`compacta:hidden`).
- Controles shadcn (botões e inputs `h-9`) não mudam. Em barras de ferramentas de tabela use `size="sm"`.
- O alvo mínimo de 24×24 px (WCAG 2.5.8) se mantém: botões-ícone continuam `size-8`, ou `size-7` no compacto.

### 1.7 Cores de status e prioridade configuráveis, com AA garantido

O admin escolhe qualquer cor hexadecimal; o front deriva as variações.

- **Variante "suave"** (padrão em listas e cabeçalho):
  - fundo claro tingido (L 0,955; C = min(0,3·C, 0,04));
  - texto da mesma matiz, escurecido em passos de 0,01 em L até atingir **≥ 4,5:1 contra o próprio fundo**;
  - ponto (`ponto`) com a cor original ajustada até 3:1 contra o fundo.
  - No escuro: fundo L 0,31; texto clareado até 4,5:1; ponto clareado até 3:1.
- **Variante "sólida"** (ex.: "Crítica" na tabela):
  - fundo = cor original, com texto branco ou `#111318`;
  - L é ajustado até 4,5:1;
  - entre as duas opções, vence a de menor desvio de L em relação à cor original.
- **Cor de gráfico:** ajusta até 3:1 contra a superfície clara mais escura (`#f8f9fb`) ou a superfície escura mais clara (`#202226`). Assim, vale para todos os fundos.
- Cada candidato passa por mapeamento de gamut (busca binária na croma) e o contraste é medido **no hex final**.
- **Teste por script:** 20.000 cores aleatórias mais casos-limite (#000, #fff, #ff0, #888), nos dois modos.
  - Mínimo de texto: 4,96.
  - Mínimo do ponto: 3,00.
  - Mínimo da variante sólida: 4,50.
  - Mínimo do gráfico: 3,00 claro e 3,14 escuro.

Código de referência (copiar para `apps/web/src/lib/cores.ts`; mesma lógica testada):

```ts
type Oklch = { l: number; c: number; h: number };
export type ModoTema = 'claro' | 'escuro';
export interface CoresBadge { fundo: string; texto: string; borda: string; ponto: string }

const SUPERFICIE_CLARA_MAIS_ESCURA = '#f8f9fb'; // --pane claro
const SUPERFICIE_ESCURA_MAIS_CLARA = '#202226'; // --popover escuro
const paraLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const paraGama = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexParaRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Cor inválida: ${hex}`);
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function rgbParaHex(rgb: number[]): string {
  return '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}
export function rgbParaOklch(rgb: [number, number, number]): Oklch {
  const [r, g, b] = rgb.map(paraLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h: c < 1e-4 ? 0 : h };
}
function oklchParaRgbLinear({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180, a = c * Math.cos(hr), b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}
const noGamut = (v: number[]) => v.every((x) => x >= -1e-6 && x <= 1 + 1e-6);
export function oklchParaHex(o: Oklch): string {
  const l = Math.min(1, Math.max(0, o.l));
  let c = o.c;
  if (!noGamut(oklchParaRgbLinear({ l, c, h: o.h }))) {
    let lo = 0, hi = c;
    for (let i = 0; i < 20; i++) {
      const meio = (lo + hi) / 2;
      if (noGamut(oklchParaRgbLinear({ l, c: meio, h: o.h }))) lo = meio; else hi = meio;
    }
    c = lo;
  }
  return rgbParaHex(oklchParaRgbLinear({ l, c, h: o.h }).map((v) => paraGama(Math.min(1, Math.max(0, v)))));
}
export function luminancia(hex: string): number {
  const [r, g, b] = hexParaRgb(hex).map(paraLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a: string, b: string): number {
  const x = luminancia(a), y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function ajustar(o: Oklch, fundo: string, minimo: number, direcao: -1 | 1): string {
  const cur = { ...o };
  for (let i = 0; i < 120; i++) {
    const hex = oklchParaHex(cur);
    if (contraste(hex, fundo) >= minimo) return hex;
    cur.l = Math.min(1, Math.max(0, cur.l + direcao * 0.01));
  }
  return direcao < 0 ? '#000000' : '#ffffff';
}
export function coresDeBadge(hex: string, modo: ModoTema): CoresBadge {
  const base = rgbParaOklch(hexParaRgb(hex));
  const { c, h } = base;
  if (modo === 'claro') {
    const fundo = oklchParaHex({ l: 0.955, c: Math.min(c * 0.3, 0.04), h });
    return {
      fundo,
      texto: ajustar({ l: Math.min(base.l, 0.5), c: Math.min(c, 0.16), h }, fundo, 4.5, -1),
      borda: oklchParaHex({ l: 0.86, c: Math.min(c * 0.5, 0.08), h }),
      ponto: ajustar(base, fundo, 3, -1),
    };
  }
  const fundo = oklchParaHex({ l: 0.31, c: Math.min(c * 0.35, 0.06), h });
  return {
    fundo,
    texto: ajustar({ l: Math.max(base.l, 0.82), c: Math.min(c, 0.12), h }, fundo, 4.5, +1),
    borda: oklchParaHex({ l: 0.45, c: Math.min(c * 0.5, 0.08), h }),
    ponto: ajustar(base, fundo, 3, +1),
  };
}
export function corSolida(hex: string): { fundo: string; texto: string } {
  const base = rgbParaOklch(hexParaRgb(hex));
  const branco = '#ffffff', preto = '#111318';
  const a = ajustar(base, branco, 4.5, -1), b = ajustar(base, preto, 4.5, +1);
  const da = Math.abs(rgbParaOklch(hexParaRgb(a)).l - base.l);
  const db = Math.abs(rgbParaOklch(hexParaRgb(b)).l - base.l);
  return da <= db ? { fundo: a, texto: branco } : { fundo: b, texto: preto };
}
export function corDeGrafico(hex: string, modo: ModoTema): string {
  const base = rgbParaOklch(hexParaRgb(hex));
  return modo === 'claro' ? ajustar(base, SUPERFICIE_CLARA_MAIS_ESCURA, 3, -1) : ajustar(base, SUPERFICIE_ESCURA_MAIS_CLARA, 3, +1);
}
const cache = new Map<string, { claro: CoresBadge; escuro: CoresBadge; solida: { fundo: string; texto: string } }>();
export function obterCores(hex: string) {
  const k = hex.toLowerCase();
  let v = cache.get(k);
  if (!v) { v = { claro: coresDeBadge(k, 'claro'), escuro: coresDeBadge(k, 'escuro'), solida: corSolida(k) }; cache.set(k, v); }
  return v;
}
```

**Como aplicar.** O `ColorBadge` define no `style` as variáveis `--b-bg`, `--b-fg`, `--b-borda`, `--b-ponto` e as versões `-d` de cada uma, e usa as classes `.badge-cor` / `.badge-cor-ponto`. A troca de tema não exige recalcular nada.

**Testes** (`cores.test.ts`):
- (a) `coresDeBadge` com 5.000 cores pseudoaleatórias de semente fixa: `contraste(texto, fundo) >= 4.5` nos dois modos;
- (b) a variante sólida dá ≥ 4,5;
- (c) `corDeGrafico` dá ≥ 3 contra `#ffffff`, `#f8f9fb`, `#1d1e21` e `#202226`;
- (d) hex inválido lança erro.

**Prévia no admin:** o `ColorField` mostra o badge claro e o escuro, lado a lado, com a razão calculada (ex.: "7,1:1 · AA").

**Avatares sem foto:** iniciais, com cor escolhida em `['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#db2777','#7c3aed','#475569'][id % 8]` e renderizada por `coresDeBadge` (variante suave). AA garantido.

### 1.8 Ícones (lucide-react 1.61; nomes verificados)
- `strokeWidth` 1,75 vem do CSS global.
- Tamanhos: `size-4` (16 px) em botões e menus; `size-5` em cabeçalhos; `size-6` na app bar.
- Ícones decorativos levam `aria-hidden`. Botão só com ícone exige `aria-label` e `Tooltip`.

| Uso | Ícone |
|---|---|
| Apps: Atividade, Chamados, Painel, Base, Inventário, Relatórios, Admin, Ajuda | `Bell`, `Ticket`, `LayoutDashboard`, `BookOpenText`, `Monitor`, `ChartColumn`, `Settings`, `LifeBuoy` |
| Novo chamado / compor | `TicketPlus` / `SquarePen` |
| Buscar, filtrar, colunas, salvar filtro, filtro salvo | `Search`, `ListFilter`, `Columns3`, `BookmarkPlus`, `Bookmark` |
| Exportar, imprimir, enviar arquivo | `Download`, `Printer`, `CloudUpload` |
| Anexar, enviar, mencionar, privado, citar | `Paperclip`, `SendHorizontal`, `AtSign`, `Lock`, `Quote` |
| Assumir, encaminhar, agendar, encerrar, reabrir | `Hand`, `ArrowRightLeft`, `CalendarClock`, `CircleCheck`, `RotateCcw` |
| Editar, excluir, mais, copiar, link, externo, fechar | `Pencil`, `Trash`, `Ellipsis` / `EllipsisVertical`, `Copy`, `Link`, `ExternalLink`, `X` |
| Voltar, painel esquerdo, propriedades | `ChevronLeft`, `PanelLeftClose` / `PanelLeftOpen`, `PanelRight` |
| SLA: no prazo, em risco, vencido, cumprido | `Clock`, `Hourglass`, `TriangleAlert`, `CircleCheck` |
| Mensagem: enviando, enviada, lida, falhou | `Clock`, `Check`, `CheckCheck`, `CircleAlert` |
| Cronômetro | `Timer`, `CirclePlay`, `CirclePause` |
| Tema, densidade | `Sun`, `Moon`, `SunMoon`; `Rows3` (confortável), `Rows4` (compacta) |
| Perfil, sessões, 2FA, senha, sair | `UserRound`, `MonitorSmartphone`, `ShieldCheck`, `KeyRound`, `LogOut` |
| Notificação na área de trabalho, silenciar, avisos, fixado | `BellRing`, `BellOff`, `Megaphone`, `Pin` |
| Avaliação, útil / não útil | `Star`, `ThumbsUp` / `ThumbsDown` |
| Entidades | Área `Building`, Local `MapPin`, Prioridade `Flag`, Status `CircleDot`, Tipo de problema `Shapes`, Campos `SlidersHorizontal`, Auditoria e Histórico `History`, QR `QrCode`, Etiqueta `Tag`, Usuários `Users` |
| Estados de erro | Offline `WifiOff`, Servidor `ServerCrash`, Sem resultados `SearchX`, Sem permissão `Ban`, Não encontrado `FileQuestion`, Vazio `Inbox` |
| Arquivos | `FileImage`, `FileText`, `FileSpreadsheet`, `FileArchive`, `File` |

### 1.9 Movimento
- Durações:
  - 100 ms: hover, pressionar;
  - 200 ms: popover e menu (classes `animate-in`/`fade-in`/`zoom-in-95` do tw-animate-css, já presentes nos componentes shadcn);
  - 250 ms: Sheet.
- Curvas: `ease-fluent` (desaceleração) para entradas; `ease-fluent-in` para saídas.
- Mensagem nova: `animate-mensagem-entrada`.
- Mensagem focada vinda de notificação: `animate-destaque` no wrapper da linha, herdado do "glow" atual.
- "Digitando": três pontos `animate-digitando` com `[animation-delay:150ms]` e `[animation-delay:300ms]`.
- Contador de não lidas: sem animação. Presença: troca instantânea.
- `prefers-reduced-motion`: tratado no CSS global. No JS, `usePrefersReducedMotion()` decide `scrollIntoView({ behavior: reduzido ? 'auto' : 'smooth' })`, e o indicador de digitação mostra só o texto, sem pontos.

### 1.10 Acessibilidade (requisitos verificáveis)
**Estrutura:**
- O primeiro elemento focável é o `SkipLink` "Pular para o conteúdo" (`#conteudo`).
- Landmarks:
  - `<nav aria-label="Aplicativos">` na app bar;
  - `<header>` na top bar;
  - `<aside aria-label="...">` no painel de lista;
  - `<main id="conteudo" tabIndex={-1}>`;
  - `<aside aria-label="Propriedades do chamado">` no trilho.
- `<html lang="pt-BR">`.
- Ao mudar de rota (exceto quando só mudam parâmetros de busca), o foco vai para o `h1` do conteúdo (`tabIndex={-1}`) pelo hook `useFocoAoNavegar`, assinando `router.subscribe('onResolved', ...)` com comparação de `pathname`.

**Foco e teclado:**
- Foco visível: contorno de 2 px em `--ring`, contraste ≥ 5:1.
- shadcn: o patch da seção 1.12 remove a transparência `/50`.
- Tudo é operável por teclado. Atalhos na seção 2.7; nenhum atalho de uma letra dispara com foco em campo de texto.
- Links da app bar: `aria-current="page"`.
- Abas por rota: `<nav aria-label="Seções do chamado">` com links e `aria-current="page"`. Não usar `role=tab`, porque são navegação.

**Cor nunca é o único indicador:**
- status e prioridade sempre com texto;
- SLA com ícone e texto;
- presença com glifo (check / sólido / relógio / anel com X) e texto em `sr-only`;
- comentário privado com ícone `Lock` e o rótulo "Privado".

**Conversa:**
- contêiner `role="log" aria-label="Conversa do chamado #125"`;
- ao carregar mensagens antigas no topo, `aria-busy="true"` enquanto prepende, para não anunciar;
- cada mensagem é um `<article aria-labelledby={idCabecalho}>`;
- indicador de digitação em `aria-live="polite" aria-atomic="true"`, atualizado só quando o conjunto de pessoas muda;
- confirmação de leitura com texto `sr-only` ("Lida por Ana Souza às 09:16").

**Formulários:**
- rótulo visível sempre;
- `aria-invalid`, `aria-describedby` (descrição e erro), `aria-required`;
- mensagem de erro em texto;
- primeiro campo inválido recebe foco no submit (`shouldFocusError` do RHF).

**Tabelas:**
- `<table aria-label>`;
- `aria-sort` nos cabeçalhos ordenáveis;
- checkbox com `aria-label="Selecionar chamado #125"`;
- barra de ações em massa como `role="region" aria-label="Ações em massa"` com contador `aria-live`;
- linha clicável sempre tem também um `<Link>` na célula "#" e em "Assunto" (o teclado usa o link; nada de `tabIndex` na `<tr>`).

**Gráficos:** cada `ChartCard` tem o botão "Ver como tabela" (alterna uma `<table>` com os mesmos dados) e `accessibilityLayer` no Recharts.

**Diálogos e menus:** Radix já cuida de foco preso e retorno. `AlertDialog` em toda ação destrutiva.

**Tamanho de alvo:** ≥ 24×24 px.

**Validação automática:** axe via Playwright em todas as rotas principais, em claro, escuro e compacto (tarefa W51). Nenhuma violação "serious" ou "critical" é aceita.

### 1.11 Tema claro / escuro / sistema

`apps/web/public/theme-init.js` é carregado no `<head>` **antes** do bundle. É arquivo externo, compatível com CSP `script-src 'self'`.

```js
(function () { try {
  var t = localStorage.getItem('vinimon:tema') || 'sistema';
  var d = localStorage.getItem('vinimon:densidade');
  var escuro = t === 'escuro' || (t === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches);
  var r = document.documentElement;
  r.classList.toggle('dark', escuro); r.style.colorScheme = escuro ? 'dark' : 'light';
  if (d === 'compacta' || d === 'confortavel') r.dataset.densidade = d;
} catch (e) {} })();
```

`index.html`:

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Vinimon</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script src="/theme-init.js"></script>
</head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

**`ThemeProvider`** (`components/theme/theme-provider.tsx`):
- estado `tema: 'claro' | 'escuro' | 'sistema'`;
- `temaEfetivo: 'claro' | 'escuro'`;
- escuta `matchMedia('(prefers-color-scheme: dark)')` quando o tema é "sistema";
- aplica a classe `dark` e `colorScheme` no `<html>`;
- grava em `localStorage`;
- expõe `useTheme()` com `{ tema, temaEfetivo, definirTema }`.

**`DensityProvider`:** mesmo padrão, com `data-densidade` e `useDensidade()`.

**Sincronização com o servidor** (`useSincronizarPreferencias(me)` no layout `_app`):
- ao carregar `me.preferencias`, aplica e grava localmente;
- ao mudar no app, faz `PATCH /api/me/preferencias`.

### 1.12 Ajustes obrigatórios depois do `shadcn add` (tarefa W04)
1. Em `src/components/ui/*.tsx`, trocar `ring-ring/50` por `ring-ring`. Verificar: `grep -rn "ring-ring/50" src/components/ui` não retorna nada.
2. Em `button.tsx` e `badge.tsx`, variante `destructive`: trocar `bg-destructive` por `bg-destructive-solid`, `hover:bg-destructive/90` por `hover:bg-destructive-solid/90`, e remover `dark:bg-destructive/60`. Verificar com grep.
3. Em `sonner.tsx`: trocar `import { useTheme } from "next-themes"` por `import { useTheme } from "@/components/theme/theme-provider"` e usar `theme={temaEfetivo === 'escuro' ? 'dark' : 'light'}`. Verificar: `grep -rn next-themes src` não retorna nada e `next-themes` não está no package.json.
4. Exceção de lint: `components/ui/**` pode usar `dangerouslySetInnerHTML`. O `ChartStyle` do chart injeta um `<style>`. Nenhum outro lugar pode.

**Nota para o plano da API (CSP):** produção precisa de `style-src 'self' 'unsafe-inline'`, porque Sonner e o chart do shadcn injetam `<style>` e Radix/Recharts usam estilos inline. Também `script-src 'self'`, `img-src 'self' data: blob:` e `connect-src 'self'`, cobrindo o ws do mesmo host. Notificações na área de trabalho exigem HTTPS ou localhost.

---

## 2. Layout estilo Teams

### 2.1 Estrutura (desktop ≥ 1280 px)
```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [V] Vinimon · Minha Empresa   [Q Pesquisar chamados, artigos, pessoas...   Ctrl K]  [sino 3] (OP*)│ TopBar h-12 bg-frame
├──────┬───────────────────────┬───────────────────────────────────────────────┬───────────────┤
│[sino]│ Chamados        [+][..]│ #125 Impressora do 2º andar não imprime       │ PROPRIEDADES  │
│Ativid│───────────────────────│ [Aguardando] [Alta] [relógio Resolve em 2h]  (AS*)(OP*)│ Status  [v]   │
│[tick]│ VISÕES                │ Conversa | Detalhes | Anexos 2 | Histórico | Tempo│ Prioridade[v] │
│Chamad│ > Meus em aberto   12 │───────────────────────────────────────────────│ Operador  [v] │
│[pain]│   Da minha área    31 │          ─── Hoje ───                         │ Área      [v] │
│Painel│   Sem operador      4 │ (AS) Ana Souza 09:12                          │ Agendar   [..]│
│[livr]│   SLA em risco      3 │ ┌───────────────────────────────┐             │ [Assumir]     │
│ Base │ FILTROS SALVOS        │ │ A impressora não imprime...    │             │ [Encaminhar]  │
│[mon] │   Críticos TI       2 │ └───────────────────────────────┘             │ [Encerrar]    │
│Invent│                       │                   09:15 [v][v] Você           │ PARTICIPANTES │
│[graf]│                       │              ┌──────────────────────────┐     │ (AS*) Ana     │
│Relat │                       │              │ Estou verificando o toner │     │ (OP*) Operador│
│[engr]│                       │              └──────────────────────────┘     │               │
│Admin │                       │ Ana está digitando . . .                      │               │
│      │                       │ ┌───────────────────────────────────────────┐ │               │
│[boia]│                       │ │ Escreva uma resposta... use @ para mencionar│ │               │
│Ajuda │                       │ │ [cadeado Privado][clipe][@]   [Enviar >]   │ │               │
└──────┴───────────────────────┴───────────────────────────────────────────────┴───────────────┘
 AppBar  ListPane w-80 bg-pane   Conteúdo bg-background rounded-tl-xl border      Trilho w-72 (xl+)
```

`AppShell`:
- `grid h-dvh grid-rows-[var(--topbar-h)_1fr] md:grid-cols-[var(--appbar-w)_1fr]`;
- TopBar e AppBar ficam sobre `bg-frame`;
- a área de trabalho é `flex min-h-0 overflow-hidden rounded-tl-xl border-l border-t bg-background` (canto arredondado do Teams v2);
- o painel de lista fica dentro dela, à esquerda, com `bg-pane border-r`.

### 2.2 Breakpoints
| Faixa | App bar | Painel de lista | Trilho direito | Navegação |
|---|---|---|---|---|
| < 768 (mobile) | oculta | uma coluna: lista OU conteúdo (prop `modoMobile`) | botão `PanelRight` abre `Sheet side="right"` | `MobileNav` inferior (5 itens) + FAB "Novo chamado" na rota Chamados |
| 768–1023 | 68 px | `w-72`; em rotas de detalhe fica oculto, com botão `PanelLeftOpen` abrindo `Sheet side="left"` | Sheet | app bar |
| 1024–1279 | 68 px | `w-80`, recolhível (estado em `localStorage['vinimon:painel-lista']`) | Sheet | app bar |
| ≥ 1280 | 68 px | `w-80`, recolhível | fixo `w-72` | app bar |

### 2.3 App bar
- Item com 56 px de altura: ícone `size-6` e rótulo `text-appbar` embaixo, em `text-frame-foreground`.
- Hover: `bg-accent`.
- Ativo: `text-primary font-semibold` e indicador vertical de 3×20 px `bg-primary rounded-r-full` à esquerda.
- Contador: pílula `bg-destructive-solid text-white text-[10px] min-w-4 h-4` no canto do ícone; mostra "99+" acima de 99.
- Itens e visibilidade (permissões de `packages/shared`; se os nomes diferirem, prevalecem os de shared):

| id | Rótulo (aria-label completo) | Rota | Visível para | Contador |
|---|---|---|---|---|
| atividade | Atividade | `/atividade` | todos | notificações não lidas |
| chamados | Chamados | `/chamados` | todos | — |
| painel | Painel | `/painel` | todos (dados no escopo do perfil) | — |
| conhecimento | Base (aria: "Base de conhecimento") | `/conhecimento` | todos | — |
| inventario | Inventário | `/inventario` | `inventario.ver` | — |
| relatorios | Relatórios | `/relatorios` | `relatorios.ver` | — |
| admin | Admin (aria: "Administração") | `/admin` | `admin.acessar` | — |
| (rodapé) ajuda | Ajuda | abre `AtalhosDialog` | todos | — |

### 2.4 Top bar
**Esquerda:**
- marca: quadrado `size-7 rounded-md bg-primary text-primary-foreground` com "V";
- nome do sistema (`text-sm font-semibold`, só em lg+);
- no mobile, o título do app atual.

**Centro:** `BuscaGlobalTrigger`, um botão que parece input (`max-w-xl w-full h-8 rounded-md bg-background border`), com `Search`, o texto "Pesquisar chamados, artigos, equipamentos e pessoas" e `Kbd` "Ctrl K" ("⌘ K" no Mac). Abre a `CommandPalette`. No mobile vira botão-ícone.

**Direita:**
- `OfflineIndicator`, só quando o socket estiver desconectado há mais de 5 s: "Reconectando...";
- `NotificationBell` (Popover);
- `UserMenu`: Avatar 28 px com `PresenceIndicator`, que abre o DropdownMenu.

```
┌ Notificações              [Marcar todas como lidas] ┐   ┌ (OP*) Operador de TI                ┐
│ * (AS)@ Ana mencionou você em #125 · 5 min          │   │  operador@exemplo.com · Operador     │
│   "...@Operador pode verificar o toner?"            │   │ Status: * Disponível              >  │ → Disponível / Ocupado / Ausente / Redefinir (automático)
│ * (OP)  #130 foi atribuído a você · 1 h             │   │ Meu perfil                           │
│   (!)   SLA de #118 vence em 30 min · 2 h           │   │ Tema: Sistema                     >  │ → Claro / Escuro / Sistema (radio)
│ [Ver tudo em Atividade]                             │   │ Densidade: Compacta               >  │ → Confortável / Compacta (radio)
└─────────────────────────────────────────────────────┘   │ Atalhos de teclado          Ctrl /   │
                                                          │ Sair                                 │
                                                          └──────────────────────────────────────┘
```

**Presença:**
- estados `online` (Disponível), `ocupado`, `ausente`, `offline` (calculado no servidor);
- manual persiste até ser trocado;
- automático: `useOcioso(5 min)`, que conta sem eventos de mouse/teclado/toque ou com a aba oculta;
- se o status atual é `online`, emite `presenca:definir {status:'ausente', automatico:true}`;
- ao voltar a atividade, emite `online`, mas só se o "ausente" tinha sido automático;
- quando ocupado, notificações na área de trabalho só para menções e alertas de SLA.

### 2.5 Painéis (`TwoPane`)
- **Painel de lista:**
  - cabeçalho `h-14 px-(--pane-px)` com `text-pane-title` e ações-ícone;
  - seções com `text-label uppercase`;
  - itens `rounded-md px-3 py-(--item-py)`; hover `bg-accent`;
  - ativo: `bg-background shadow-xs ring-1 ring-border` (cartão branco, como no Teams);
  - não lido: título `font-semibold` e ponto `size-2 bg-primary`;
  - define `[--anel-presenca:var(--pane)]`.
- **Conteúdo:** `PaneHeader` `h-14` (título `text-title` truncado, subtítulo, ações) e abas em linha abaixo (`RouteTabs`). Corpo com `overflow-y-auto` próprio, sem rolar a página.
- **Trilho:** `w-72 border-l bg-pane overflow-y-auto` com seções `ListPaneSection`.

### 2.6 Mobile (< 768)
```
┌ Chamados        [Q][sino](OP*) ┐    ┌ [<] #125 Impressora não...  [PanelRight] ┐
│ [Visão: Meus em aberto v][Filtros]│ │ [Aguardando][Alta][relógio 2h]           │
│ ┌──────────────────────────────┐ │   │ Conversa Detalhes Anexos Hist. Tempo →  │ (abas com rolagem horizontal)
│ │ (AS*) Impressora não imprime │ │   │ ...mensagens...                          │
│ │ #125 · Ana Souza · 09:41     │ │   │                                          │
│ │ [Alta] [Aguardando] [2 h]    │ │   │ ┌ Escreva uma resposta...    [>] ┐       │
│ └──────────────────────────────┘ │   │ └────────────────────────────────┘       │ (composer fixo; sem barra inferior nesta tela)
│                           (+)    │   └──────────────────────────────────────────┘
├──────────────────────────────────┤
│ Atividade Chamados Painel Base Mais│  MobileNav h-14 + pb-[env(safe-area-inset-bottom)]
└──────────────────────────────────┘
```
- "Mais" abre `Sheet side="bottom"` com Inventário, Relatórios, Administração (conforme permissão), Avisos, Meu perfil e Sair.
- Sonner com `mobileOffset={{ bottom: 'calc(var(--bottomnav-h) + 8px)' }}`.

### 2.7 Atalhos de teclado
Registro em `lib/atalhos.ts` e hook `useAtalhos`. Atalhos de letra são ignorados quando o foco está em input, textarea ou contenteditable.

| Atalho | Ação |
|---|---|
| Ctrl/⌘ K | busca global (funciona inclusive dentro de campos) |
| Ctrl/⌘ / ou `?` | diálogo de atalhos |
| `g` + `a` / `c` / `p` / `b` / `i` / `r` / `d` | Atividade / Chamados / Painel / Base / Inventário / Relatórios / Admin (janela de 1 s entre teclas) |
| `c` | novo chamado |
| `/` | foco na busca do painel atual |
| `j` / `k` | próximo / anterior na lista (painel de lista e Atividade) |
| `r` | (no chamado) foco no composer |
| Enter / Shift+Enter / Ctrl+Enter | no composer: enviar / nova linha / enviar. A preferência "Enter envia" vale `true` por padrão; com ela desligada, Enter quebra linha e Ctrl+Enter envia. |
| Esc | fecha popover, sheet ou paleta; no composer, fecha o autocomplete de menção |

### 2.8 Tempo real (o que o front consome)
- Fim do polling de 15 s.
- `lib/socket.ts`: singleton `io({ path: '/socket.io', withCredentials: true, autoConnect: false, transports: ['websocket','polling'] })`, tipado com `ServerToClientEvents` e `ClientToServerEvents` de `packages/shared` (lista na seção 4.9).
- Conecta no layout `_app` e desconecta no logout.
- Reconexão:
  - invalida `notificacaoKeys.contagem`;
  - invalida a conversa aberta;
  - reentra na sala do chamado.

---

## 3. Telas

Convenções aplicadas a todas as telas:
- **carregando** = `Skeleton` com o formato do conteúdo, via `pendingComponent` da rota (`defaultPendingMs: 150`, `defaultPendingMinMs: 300`);
- **vazio** = `EmptyState` (sobre o `Empty` do shadcn);
- **erro** = `ErrorState` com "Tentar novamente" (`reset()` / `router.invalidate()`);
- toasts só para mutações.

### 3.1 Login, 2FA e troca obrigatória de senha
Rotas: `/login?redirect=`, `/trocar-senha`, `/configurar-2fa`. Recuperação de senha fica para a fase do e-mail (W14b).
```
┌──────────────────────────────────┬───────────────────────────────────────┐
│ (lg+) painel da marca             │            [V] Vinimon                │
│ gradiente radial primary          │      Entrar na sua conta              │
│ [V] Vinimon                       │      Minha Empresa                    │
│ "Gestão de chamados da            │  Login  [______________________]      │
│  Minha Empresa"                   │  Senha  [__________________][olho]    │
│ - Converse com o suporte em       │  (!) Caps Lock ativado                │
│   tempo real                      │  [Alert: Login ou senha inválidos.]   │
│ - Acompanhe prazos e status       │  [           Entrar            ]      │
└──────────────────────────────────┴───────────────────────────────────────┘
Etapa 2FA (mesmo card, transição fade): "Verificação em duas etapas"
  "Digite o código de 6 dígitos do seu aplicativo autenticador."
  [_ _ _ - _ _ _]  (InputOTP, autoComplete="one-time-code")   [Verificar]
  [Usar código de recuperação]  → troca para Input texto     [Voltar]
/trocar-senha: Card "Defina uma nova senha" · Senha atual · Nova senha · Confirmar
  PasswordStrength + checklist (mínimo N caracteres, letras e números, diferente da atual)  [Salvar e continuar]
/configurar-2fa (política obrigatória): mesmo conteúdo do DoisFatoresSetupDialog, em página.
```
- **shadcn:** Card, Field, Input, InputGroup (botão de mostrar senha), Button, Spinner, Alert, InputOTP, Separator.
- **Comportamento:**
  - `autoComplete` `username` / `current-password` / `new-password`;
  - aviso de Caps Lock via `getModifierState('CapsLock')`;
  - mensagem genérica para credencial inválida (não revela se o login existe);
  - 429 ou 423 mostra "Muitas tentativas. Tente novamente em N min." com contagem regressiva, e o botão fica desabilitado;
  - `redirect` só é aceito se começar com "/" e não com "//" (contra open redirect);
  - depois do login, `invalidateQueries(authKeys.me)`.
- **Guardas:**
  - `me.deveTrocarSenha` manda para `/trocar-senha`;
  - `me.precisaConfigurar2fa` manda para `/configurar-2fa`;
  - quem já está logado e abre `/login` vai para `/`.
- **Estados:** carregando = botão com Spinner e campos desabilitados; erro de rede = Alert "Sem conexão com o servidor".

### 3.2 Painel
Rota: `/painel?periodo=7|30|90&area=`.
```
┌ Painel                                          [Período: 30 dias v] [Área: Todas v] ┐
│ [Em aberto 42][Sem operador 4][Atribuídos a mim 7][SLA vencido 3][Abertos hoje 9]       │
│ [Encerrados hoje 11][Satisfação 4,6]        (StatCard clicável → /chamados?visao=...)   │
│ ┌ Abertos x encerrados (30 dias) ──────────────────┐ ┌ Em aberto por status ─────────┐ │
│ │ AreaChart 2 séries (chart-1, chart-3)  [tabela]   │ │ BarChart horizontal (cores do │ │
│ └──────────────────────────────────────────────────┘ │ status via corDeGrafico)      │ │
│ ┌ Por prioridade ┐ ┌ SLA cumprido no período ┐ ┌ Em aberto por área ┐               │
│ │ donut           │ │ radial 92% + "276 de 300" │ │ BarChart            │               │
│ ┌ SLA mais próximo do vencimento (5) ──────────────┐ ┌ Mural de avisos ──────────────┐ │
│ │ #  Assunto          Operador   Vence em          │ │ [Importante] Manutenção sáb.. │ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Grade:**
  - KPIs: `grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7`;
  - gráficos: `grid gap-4 lg:grid-cols-3`, com o primeiro gráfico em `lg:col-span-2`.
- **Nível 3 (usuário):**
  - KPIs: Meus em aberto, Aguardando minha resposta, Encerrados no período;
  - gráficos: Meus chamados por status e Recentes (5);
  - sem filtro de área.
- **shadcn:** Card, Chart (ChartContainer, ChartTooltip, ChartLegend), Select, Skeleton, Table, Badge, Toggle ("Ver como tabela").
- **Estados:**
  - carregando: 7 skeletons de KPI e 5 de gráfico;
  - vazio no período: dentro de cada gráfico, `EmptyState compacto` "Sem chamados no período";
  - erro: `ErrorState` na página.

### 3.3 Atividade (feed unificado)
Rota: `/atividade?filtro=tudo|nao-lidas|mencoes|atribuicoes|sla|avisos&item=<id>`.
```
┌ Atividade        [CheckCheck][..]┐┌ #125 · Impressora do 2º andar não imprime  [Abrir chamado] ┐
│ [Tudo][Não lidas 5][Menções][Atribuições][SLA][Avisos]││                                       │
│ ┌ [megafone] Manutenção da rede sábado 8h  [Ver] [x] ┐││ ConversaView modo="previa" rolada até   │
│ * (AS)[@]  Ana Souza mencionou você em #125   5 min  ││ a mensagem (animate-destaque); composer │
│            "...@Operador pode verificar o toner?"   ││ disponível                              │
│ * (OP)[mão] #130 foi atribuído a você          1 h   ││                                         │
│   (!)      SLA de solução de #118 vence em 30 min 2 h││                                         │
│   ─── Ontem ───                                      ││                                         │
│   (JL)[balão] João comentou em #119           Ontem  ││                                         │
│ [Carregar mais] (também por IntersectionObserver)    ││                                         │
└──────────────────────────────────────────────────────┘└─────────────────────────────────────────┘
```
- **Item:** avatar do autor com presença e mini-ícone do tipo no canto (`AtSign`, `Hand`, `MessageSquare`, `ArrowRightLeft`, `Timer`, `Star`, `Megaphone`, `TicketPlus`). Título, trecho de 2 linhas (oculto no compacto) e hora curta.
- **Menu de contexto do item** (`ContextMenu` e botão `Ellipsis`): Marcar como lida / não lida, Abrir em nova aba.
- **Comportamento:**
  - clicar define `?item=`, marca a notificação como lida e carrega a prévia à direita;
  - no mobile, navega para `/chamados/$id?foco=`;
  - `j`/`k` navegam pela lista;
  - topo do feed: `AvisosStrip` (avisos fixados e ativos) e `DesktopNotificationsPrompt` (se `Notification.permission === 'default'`): "Ativar notificações na área de trabalho [Ativar] [Agora não]".
- **shadcn:** ToggleGroup (filtros), Item, Avatar, Badge, ContextMenu, DropdownMenu, Button, Skeleton, Empty, Alert.
- **Estados:**
  - vazio: "Tudo em dia" (`CheckCheck`), com descrição por filtro (ex.: "Nenhuma menção a você");
  - sem item selecionado: `EmptyState` "Selecione uma atividade para ver a conversa";
  - erro: `ErrorState` no painel.

### 3.4 Lista de chamados
Rota: `/chamados`, com search params definidos em `ChamadoFiltrosSchema` (seção 4.4).
```
┌ Chamados        [TicketPlus][..]┐┌ Meus em aberto (12)                      [BookmarkPlus Salvar filtro][Download]┐
│ [Q Filtrar visões...]           ││ [Q Buscar nº, assunto, descrição, solicitante] [Status v][Prioridade v][Área v]│
│ VISÕES                          ││ [Operador v][Tipo v][Período][SLA v] [Limpar filtros]     [Columns3][Rows4]    │
│ > Meus em aberto           12   ││ ┌──┬──────┬──────────────────────────────┬───────────┬──────────┬────────┬───────┬────────┐│
│   Da minha área            31   ││ │[]│ #  ^ │ Assunto                      │Solicitante│Prioridade│Status  │SLA    │Atualiz.││
│   Sem operador              4   ││ │[]│ 125  │* Impressora não imprime [clip2]│(AS) Ana   │[Alta]    │[Aguard]│2 h    │09:41   ││
│   SLA em risco ou vencido   3   ││ │[x]│ 124  │  Sem rede no financeiro       │(JL) João  │[Crítica] │[Em at.]│!venc. │Ontem   ││
│   Abertos por mim               ││ └──┴──────┴──────────────────────────────┴───────────┴──────────┴────────┴───────┴────────┘│
│   Todos em aberto               ││ 1–25 de 312         Linhas por página [25 v]        [<] Página 1 de 13 [>]                   │
│   Encerrados                    ││        ┌ 2 selecionados [Atribuir v][Status v][Prioridade v][Encaminhar][Exportar][x] ┐    │
│ FILTROS SALVOS                  ││        └──────────────────── barra flutuante fixa no rodapé ────────────────────────┘    │
│   Críticos TI     2  [..]       ││                                                                                             │
└─────────────────────────────────┘└─────────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Visões** (contagens de `GET /api/chamados/contagens`):
  - `meus-abertos`: para operador, atribuídos a mim; para usuário, abertos por mim;
  - `minha-area`, `sem-operador`, `sla-risco` (só operadores);
  - `abertos-por-mim`, `todos-abertos`, `encerrados`, `todos`.
  - O servidor interpreta `visao`; o front só envia o parâmetro.
- **Colunas:**
  - ids: `selecao, numero, assunto, solicitante, area, problema, prioridade, status, operador, abertura, atualizacao, sla, local, equipamento`;
  - padrão para operador: `selecao, numero, assunto, solicitante, prioridade, status, operador, sla, atualizacao`;
  - padrão para usuário: `numero, assunto, status, operador, atualizacao`, sem seleção;
  - visibilidade em `localStorage['vinimon:chamados:colunas:v1']` pelo menu `DataTableColumnToggle`;
  - colunas com `meta.ocultarAbaixo: 'lg' | 'xl'` recebem `hidden lg:table-cell`.
- **Célula Assunto:**
  - ponto de não lido;
  - assunto truncado com `title`;
  - ícone de clipe com contagem de anexos;
  - mini `TriangleAlert` quando o SLA venceu.
- **Ordenação:** clique no cabeçalho atualiza `ordem`/`dir`; ordenação feita no servidor.
- **Filtros facetados:** Popover com Command multisseleção, cor e contagem; o botão mostra "Status · 2" ou os badges escolhidos.
- **Período:** `DateRangePicker` com atalhos Hoje, 7 dias, 30 dias, Este mês, Mês passado.
- **SLA:** no prazo / em risco / vencido.
- **Busca:** debounce de 300 ms; `#125` ou só dígitos mostra a opção "Abrir #125" no topo.
- **Filtros salvos:** `SalvarFiltroDialog` com nome e Switch "Compartilhar com minha área". Menu do item: Renomear, Compartilhar, Excluir. Clicar aplica `filtroId` e os filtros.
- **Ações em massa** (operadores, máximo 100 itens): Atribuir (combobox de operadores), Status, Prioridade, Encaminhar (área). Resposta parcial abre Dialog "8 atualizados, 2 falharam" com a lista de motivos.
- **Exportar CSV:** `GET /api/chamados/exportar.csv?<filtros>` faz o download do arquivo completo, gerado no servidor (substitui o limite atual de 200 linhas).
- **Mobile:** cartões `ChamadoListItem`; visões num Select; filtros num `Sheet side="bottom"`.
- **shadcn:** Table, Checkbox, Button, ButtonGroup, Input, InputGroup, Popover, Command, Badge, Calendar, DropdownMenu, Select, Dialog, Switch, Skeleton, Empty, Tooltip, ContextMenu (linha), Kbd.
- **Estados:**
  - carregando: 10 linhas skeleton; ao trocar de página, `placeholderData: keepPreviousData` com opacidade 60% e `aria-busy`;
  - vazio sem filtros: "Nenhum chamado por aqui" com [Abrir chamado];
  - vazio com filtros: "Nenhum chamado corresponde aos filtros" com [Limpar filtros];
  - erro: `ErrorState`.

### 3.5 Abrir chamado
Rota: `/chamados/novo?equipamento=PAT-0001&problema=3`. Fica no conteúdo do layout Chamados, com o painel de visões à esquerda.
```
┌ Novo chamado                                        [nuvem] Rascunho salvo às 09:41 [Descartar] ┐
│ ┌ Formulário (max-w-3xl) ────────────────────────────────┐ ┌ Isto pode resolver (lg+, sticky) ┐ │
│ │ Abrir em nome de [(AS) Ana Souza · ana          v]     │ │ > Impressora não imprime          │ │
│ │ Área de atendimento* [TI v]  Tipo de problema [Impr. v]│ │   (Collapsible com o artigo)      │ │
│ │ Assunto* [______________________________]   23/150     │ │   [ThumbsUp Isso resolveu]        │ │
│ │ Descrição* [ textarea autosize, markdown       ]       │ │ > Trocar o toner                  │ │
│ │ Prioridade  (o)Baixa (*)Média (o)Alta (o)Crítica       │ │ [Ver mais na base]                │ │
│ │ Local [Matriz - 1º andar v] Equipamento [PAT-0003 v]   │ └───────────────────────────────────┘ │
│ │ Contato [Ana Souza]   Telefone [__________]            │                                       │
│ │ ── Informações adicionais (Impressora) ──              │                                       │
│ │ Nº do toner [______]   Andar [2º v]   Urgente? [ ]     │                                       │
│ │ ┌ [CloudUpload] Arraste arquivos, cole uma imagem ou   ┐│                                       │
│ │ │ clique para selecionar · até 10 MB cada              ││                                       │
│ │ └──────────────────────────────────────────────────────┘│                                       │
│ │ [FileImage foto.png 120 KB  x]                          │                                       │
│ │                               [Cancelar] [Abrir chamado]│                                       │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Campos:**
  - "Abrir em nome de" só para operadores: ComboboxField com busca em `/api/usuarios?q=`.
  - Escolher o tipo de problema preenche a área (como hoje). Os tipos ficam filtrados pela área.
  - Prioridade: RadioGroup em pílulas com o ponto da cor; o padrão é a prioridade marcada como padrão no `meta`.
  - Equipamento: Combobox por etiqueta ou modelo, filtrado pelo local quando houver. Aceita `?equipamento=` vindo do QR code.
- **Campos personalizados:**
  - `GET /api/campos-personalizados?areaId=&problemaId=`;
  - cada um é renderizado por `CampoPersonalizadoInput`;
  - o schema é composto com `schemaDosCampos(campos)` de `packages/shared` (a API valida com o mesmo).
- **Sugestões de artigos:**
  - `ArtigosSugeridos` busca a partir do assunto e das primeiras 200 letras da descrição (debounce de 400 ms, ≥ 4 caracteres);
  - "Isso resolveu" chama `POST /api/artigos/:id/resolveu`, limpa o rascunho, mostra o toast "Que bom! Nenhum chamado foi aberto." e navega para `/conhecimento/:id`.
- **Rascunho:** `localStorage['vinimon:rascunho:novo-chamado']`, debounce de 1 s, restaurado com o banner "Rascunho restaurado [Descartar]".
- **Envio:**
  1. `POST /api/chamados`.
  2. Upload sequencial dos anexos (`POST /api/chamados/:id/anexos`, multipart com progresso via XHR) enquanto o botão mostra "Enviando anexos 1/2...".
  3. Toast "Chamado #126 aberto" com ação [Ver] e navegação para `/chamados/126`.
  - Se um anexo falhar depois da criação: toast de erro "1 anexo não foi enviado — reenvie na aba Anexos" e navega mesmo assim.
- **Dropzone:**
  - limite e tipos vêm do `meta.config` (`tamanhoMaxAnexoMb`, `tiposAnexo`);
  - arquivos rejeitados aparecem inline ("relatorio.exe: tipo não permitido");
  - colar imagem anexa automaticamente.
- **shadcn:** Field, Input, Textarea, Select, Command/Popover (combobox), RadioGroup, Switch, Checkbox, Calendar, Collapsible, Card, Button, Spinner, Progress, Alert.
- **Estados:**
  - carregando `meta`: skeleton de formulário;
  - se `anexos` estiver desabilitado na config, o dropzone não aparece;
  - erro 422 aplica os erros de campo no formulário (`aplicarErrosDoServidor`).

### 3.6 Detalhe do chamado
Rota layout: `/chamados/$chamadoId`.

**Cabeçalho** (`ChamadoHeader`):
- `#125` em mono e `text-title` com o assunto;
- `StatusBadge`, `PrioridadeBadge`, `SlaBadge`;
- `AvatarGroup` de participantes (máx. 4 + "+N") com presença;
- ações: `Link` (copiar link), `Printer`, `PanelRight` (Propriedades, abaixo de xl), `Ellipsis` (Copiar nº, Abrir em nova aba, Ver equipamento).

**Abas** (`RouteTabs`): Conversa (index) | Detalhes | Anexos (contagem) | Histórico | Tempo (só `chamados.atender`).

**Trilho direito** (`QuickActionsRail`; vira Sheet abaixo de xl):
- seção "Propriedades":
  - Status: Select com badges; os status do tipo "encerrado" ficam fora — encerrar só pelo diálogo;
  - Prioridade: Select;
  - Operador: Combobox com presença, filtrado pela área;
  - Área: Select;
  - Agendado para: `DateTimePicker` em Popover.
- seção "Ações":
  - [Assumir] (se o operador não for eu);
  - [Encaminhar] abre Dialog com área, operador e motivo (obrigatório);
  - [Encerrar] abre Dialog com solução (obrigatória, markdown) e o Checkbox "Criar artigo na base de conhecimento a partir da solução" (operadores);
  - [Reabrir] (se encerrado) abre Dialog com motivo.
- seção "Participantes": solicitante, operador e mencionados, cada um com presença e `HoverCard` de perfil (nome, área, e-mail, telefone, status).
- Mudanças no trilho aplicam na hora (mutação), com toast "Status alterado para Em atendimento" e evento de sistema na conversa.
- O usuário nível 3 vê o trilho só para leitura e, se a config permitir, o botão [Encerrar meu chamado].

**Aba Conversa** (`ConversaView`):
```
│          ─── Hoje ───                                                    │
│ ┌ Descrição inicial (card) ──────────────────────────────────────────┐  │
│ │ (AS*) Ana Souza abriu o chamado · 09:12                              │  │
│ │ A impressora do 2º andar não imprime desde ontem...  [clip foto.png] │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│        [Hand] Operador de TI assumiu o chamado · 09:20                    │ ← SystemEvent centralizado, text-xs
│        [CircleDot] Status: [Aguardando] → [Em atendimento] · 09:21        │
│                                         09:22 Você                        │
│                          ┌───────────────────────────────────────┐        │ ← própria: direita, bg-bubble-own
│                          │ Bom dia! Vou verificar o toner.        │        │
│                          └───────────────────────────────────────┘ [CheckCheck] │ ← lida (primary) + tooltip "Lida por Ana às 09:23"
│ (AS*) Ana Souza 09:25  [@]                                                │ ← me menciona: borda esquerda primary + bg-mention
│ ┌──────────────────────────────────────────────┐                          │
│ │ Obrigada! @Operador de TI o toner é o 85A.   │                          │
│ └──────────────────────────────────────────────┘                          │
│      ┌ [Lock] Privado · visível só para a equipe ─────────── 09:30 Você ┐ │ ← bg-private, border-l-[3px] border-private-border
│      │ Pedir toner ao almoxarifado (estoque baixo).                      │ │
│      └────────────────────────────────────────────────────────────────────┘ │
│                      [ 2 novas mensagens  v ]                             │ ← NewMessagesPill (quando rolado para cima)
│ Ana está digitando . . .                                                  │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ [FileImage print.png 80%====  x]                                      │ │ ← anexos do comentário
│ │ Escreva uma resposta... use @ para mencionar                          │ │
│ │ [Lock Privado][Paperclip][AtSign]   Enter envia · Shift+Enter quebra [>]│ │
│ └──────────────────────────────────────────────────────────────────────┘ │
```
- **Mensagens:**
  - agrupamento: mensagens seguidas do mesmo autor em até 5 min omitem o cabeçalho e usam gap menor;
  - separadores de data: "Hoje", "Ontem" ou "segunda-feira, 12 de outubro";
  - mensagens de outros: avatar 32 px (24 no compacto) e bolha `bg-bubble-other rounded-lg px-3 py-2 max-w-[min(80%,48rem)]`; o cabeçalho dentro da bolha tem nome em semibold e hora em muted;
  - mensagens próprias: à direita, sem avatar;
  - menu ao passar o mouse ou focar (`Ellipsis`): Copiar texto, Copiar link da mensagem (`?foco=id`), Citar (insere `> texto` no composer).
- **Envio otimista:**
  - `clienteId` é um `crypto.randomUUID()`;
  - a bolha aparece com `Clock` (enviando), passa a `Check` (enviada) e a `CheckCheck` (lida);
  - em falha: `CircleAlert` com "Não enviada. [Tentar novamente] [Descartar]" inline;
  - o eco do socket com o mesmo `clienteId` substitui a bolha otimista, sem duplicar.
- **Rolagem:**
  - ao abrir, vai para o fim, ou para `?foco=id` (centralizado, com `animate-destaque`; depois remove `foco` da URL com `navigate({ search: ..., replace: true })`);
  - mensagem nova só rola sozinha se o usuário estiver a até 120 px do fim; senão, aparece a pílula;
  - "Carregar mensagens anteriores" no topo (cursor, 50 por página) preserva a posição (diferença de `scrollHeight`).
- **Leitura:**
  - quando o sentinela do fim está visível, a janela tem foco e a aba está visível, emite `chamado:ler` com debounce de 1 s;
  - "lida" = algum outro participante tem `ultimoAssentamentoId >= id`;
  - nas mensagens privadas, só contam os leitores da equipe.
- **Digitação:**
  - `chamado:digitando true` com throttle de 3 s enquanto digita;
  - `false` ao enviar, ao perder o foco ou após 5 s parado;
  - quem recebe expira cada pessoa após 6 s sem atualização;
  - textos: "Ana está digitando", "Ana e João estão digitando", "Várias pessoas estão digitando".
- **Menções:**
  - digitar `@` seguido de até 30 caracteres sem espaço duplo abre o `MentionPopover` acima do composer;
  - lista: participantes primeiro, depois `GET /api/chamados/:id/mencionaveis?q=&privado=` (no modo privado, só equipe);
  - teclado: ↑/↓, Enter ou Tab escolhe, Esc fecha;
  - escolher insere "@Nome " no textarea e guarda `{nome → id}` num mapa;
  - no envio, `serializarMencoes()` converte cada `@Nome` do mapa no token `@[Nome](usuario:ID)` e envia `mencoes: number[]`;
  - ao renderizar, o token vira `MentionChip`, em `bg-mention text-mention-foreground`, com "@" incluído.
- **Composer:**
  - `AutosizeTextarea` de 1 a 10 linhas;
  - "Privado" é um Toggle (só equipe). Ligado: borda `border-private-border`, fundo `bg-private` e placeholder "Comentário privado — o solicitante não verá";
  - anexar: botão ou arrastar sobre a conversa (overlay "Solte para anexar") ou colar imagem. O comentário é criado primeiro e os arquivos sobem depois com `assentamentoId`.
- **Chamado encerrado:**
  - `SolucaoCard` (`bg-success-soft`, `CircleCheck`, "Solução · Operador de TI · 21/10 14:20", markdown);
  - no lugar do composer, a barra "Chamado encerrado em 21/10 às 14:20. [Reabrir]" (se permitido);
  - `AvaliacaoCard` (seção 3.14).
- **shadcn:** Avatar, HoverCard, Badge, Button, Toggle, Tooltip, DropdownMenu, Popover, Command (lista de menção), Textarea, Separator, Skeleton, Spinner, Progress, Alert.
- **Estados:**
  - carregando: skeleton de 6 bolhas alternadas;
  - sem mensagens além da descrição: texto discreto "Nenhuma resposta ainda. Escreva a primeira.";
  - erro ao carregar: `ErrorState compacto`;
  - socket offline: o composer continua via HTTP; "digitando" e "lida" ficam pausados, com o aviso "Reconectando..." na top bar.

**Aba Detalhes:**
```
│ Descrição            markdown completo                                   │
│ Solicitante          (AS*) Ana Souza · Disponível · ana@... · Ramal 1234 · Financeiro │
│ Classificação        Área: TI · Tipo: Impressora · Local: Matriz 1º · Equipamento: PAT-0003 (link) │
│ Informações adicionais  Nº do toner: 85A · Andar: 2º                     │
│ Prazos (SLA)         Resposta [==========] Cumprida às 09:20 (prazo 13:12)│
│                      Solução  [======----] Vence em 3 h 10 min (21/10 17:12) │
│ Datas                Abertura 21/10 09:12 · 1ª resposta 09:20 · Agendado — · Encerramento — │
│ Avaliação            [Star x5] "Atendimento rápido" (se houver)           │
```
- **shadcn:** Card, Progress (o SLA usa `bg-success`, `bg-warning` ou `bg-destructive-solid` conforme o estado, sempre com texto), Separator e `KeyValueGrid`.

**Aba Anexos:**
- `FileDropzone` (se o chamado estiver aberto e houver permissão);
- grade de `AnexoCard` com ícone por tipo, nome, tamanho, autor, data e as ações [Ver] (imagens e PDF: `AnexoPreviewDialog` com `<img>` ou `<iframe sandbox>` para PDF), [Baixar] e [Excluir] (autor ou admin, com AlertDialog);
- vazio: "Nenhum anexo" com a dica de arrastar.

**Aba Histórico:**
- `HistoricoTimeline`: linha do tempo vertical com todos os eventos (abertura, atribuição, status de → para, prioridade, encaminhamento com motivo, agendamento, SLA cumprido ou violado, encerramento, reabertura, anexos);
- Select de filtro: Tudo / Status / Atribuição / SLA / Anexos;
- o usuário nível 3 vê só os eventos públicos.

**Aba Tempo** (equipe):
```
│ Tempo total 3 h 20 min        [CirclePlay Iniciar cronômetro] [+ Lançar tempo] │
│ Operador      Início        Fim     Duração   Descrição              [..]      │
│ Operador TI   21/10 09:15   10:05   50 min    Troca de toner                   │
│ Operador TI   21/10 14:00   —       00:12:31 (ao vivo)  [CirclePause Parar]    │
```
- O cronômetro é persistido no servidor (apontamento com `fim: null`) e sobrevive a recarregar a página.
- "Lançar tempo" abre Dialog com data, início, fim ou duração e descrição.
- Só o autor edita ou exclui o próprio lançamento.
- Vazio: "Nenhum tempo lançado".

### 3.7 Base de conhecimento
Rotas: `/conhecimento?busca=&categoria=`, `/conhecimento/$artigoId`, `/conhecimento/novo`, `/conhecimento/$artigoId/editar`.
```
┌ Base de conhecimento  [+]┐┌ [Q Pesquisar artigos...                                   ]            ┐
│ [Q Filtrar categorias]   ││ MAIS ACESSADOS                                                         │
│ CATEGORIAS               ││ ┌ Como redefinir minha senha de rede?                                  ┐│
│ > Todas            24    ││ │ Acesso / Senha · atualizado há 3 dias · 120 visualizações · 92% útil ││
│   Acesso / Senha    5    ││ │ "...abra um chamado em <mark>senha</mark>..."                        ││
│   Impressora        3    ││ └──────────────────────────────────────────────────────────────────────┘│
│   Rede / Internet   4    ││ ATUALIZADOS RECENTEMENTE ...                                           │
└──────────────────────────┘└────────────────────────────────────────────────────────────────────────┘
Artigo: [<] Base / Impressora   [Pencil Editar][..] (equipe)
  text-title "Impressora não imprime" · Categoria · Por Operador de TI · atualizado 12/10 · 120 visualizações
  [Badge Interno] (se visibilidade = equipe)
  corpo .markdown .markdown-artigo max-w-prose
  ┌ Este artigo foi útil?  [ThumbsUp Sim] [ThumbsDown Não] ┐   Não resolveu? [Abrir chamado] (→ /chamados/novo?problema=)
  Relacionados (3)
Editor: Título* · Categoria (tipo de problema) · Visibilidade (Público | Só equipe) · Publicado (Switch)
  Conteúdo* [Escrever | Visualizar] (MarkdownEditor)    [Cancelar] [Salvar]
```
- No mobile, as categorias viram Select no topo.
- **shadcn:** Item, Badge, Input, InputGroup, Tabs (Escrever/Visualizar), Select, Switch, Button, ButtonGroup, Skeleton, Empty, AlertDialog (excluir).
- **Estados:** busca sem resultado: "Nenhum artigo para 'termo'" com [Abrir chamado]; artigo inexistente: `notFound()` e "Artigo não encontrado".

### 3.8 Inventário
Rotas: `/inventario?busca=&tipo=&situacao=&local=&pagina=`, `/inventario/$equipamentoId?aba=dados|chamados|movimentacoes|aquisicao`.
```
┌ Inventário        [+]┐┌ Equipamentos (128)   [Q Etiqueta, série, modelo, responsável] [Situação v][Local v] [Columns3][Download] ┐
│ TIPOS                ││ Etiqueta  Tipo      Modelo              Série     Local       Responsável  Situação     Garantia  Chamados │
│ > Todos         128  ││ PAT-0001  Desktop   Dell OptiPlex 3080  SN123456  Matriz 1º   Maria Souza  [Em uso]     03/2027   1        │
│   Desktop        60  ││ PAT-0003  Impressora HP LaserJet M404   SN777888  Matriz 1º   Administr.   [Manutenção] (!)11/2026 2        │
│   Notebook       41  ││                                                                                                          │
└──────────────────────┘└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
Detalhe: [<] PAT-0003 · HP LaserJet M404  [Em manutenção]   [TicketPlus Abrir chamado][QrCode Etiqueta][Pencil Editar][..]
  Tabs: Dados | Chamados (2) | Movimentações | Aquisição e garantia
  Dados: KeyValueGrid (tipo, fabricante, modelo, série, local, responsável, observação) + "Especificações" (chave/valor)
  Chamados: mini DataTable dos chamados do equipamento
  Movimentações: timeline local/responsável/situação (de → para, por quem, quando)
  Aquisição: fornecedor, nota fiscal, data de compra, valor, garantia até (alerta se < 30 dias)
```
- Situação usa tokens fixos:
  - Em uso: `success-soft`;
  - Em estoque: `info-soft`;
  - Em manutenção: `warning-soft`;
  - Baixado: `muted`.
- Criar e editar acontecem em `EquipamentoSheet` (Sheet à direita, `sm:max-w-lg`).
- "Baixar equipamento" pede confirmação (AlertDialog).
- **Etiqueta:**
  - `EtiquetaQrDialog` mostra o `QRCodeSVG` de `${location.origin}/chamados/novo?equipamento=PAT-0003`, a etiqueta em mono, o modelo e o nome da organização;
  - [Imprimir] usa `window.print()` com `data-print` (só a etiqueta, 50×30 mm).
- **shadcn:** Table, Tabs, Sheet, Field, Input, Select, Calendar, Badge, Dialog, AlertDialog, Skeleton, Empty.
- **Estados:** vazio: "Nenhum equipamento cadastrado" com [Cadastrar equipamento]; com filtros: [Limpar filtros].

### 3.9 Relatórios
Rotas: `/relatorios`, que redireciona para `/relatorios/visao-geral`; `/relatorios/$relatorio?de=&ate=&area=&operador=`.

Valores de `$relatorio`: `visao-geral, por-status, por-area, por-problema, por-operador, por-solicitante, sla, avaliacoes, tempo`. Outro valor dá `notFound()`.
```
┌ Relatórios          ┐┌ Por área                                         [Download Exportar CSV][Printer Imprimir] ┐
│ > Visão geral       ││ [Período: Este mês v  01/10/2026 – 21/10/2026] [Área v] [Operador v]                         │
│   Por status        ││ [Total 312] [Encerrados 280] [No prazo 92%] [Tempo médio de solução 6,2 h]                   │
│   Por área          ││ ┌ BarChart (chart-1..5 ou cores configuradas) ──────────────────────────── [Ver como tabela] ┐│
│   Por tipo          ││ └───────────────────────────────────────────────────────────────────────────────────────────┘│
│   Por operador      ││ Nome          Total   Encerrados   % no prazo   Tempo médio   (ordenável no cliente)            │
│   Por solicitante   ││ TI            240     220          93%          5,8 h                                           │
│   SLA               ││                                                                                               │
│   Avaliações        ││                                                                                               │
│   Tempo apontado    ││                                                                                               │
└─────────────────────┘└───────────────────────────────────────────────────────────────────────────────────────────────┘
```
- Os filtros ficam na URL; mudar um filtro refaz a consulta (sem botão "Gerar").
- CSV: `GET /api/relatorios/:relatorio.csv?...` (download).
- Impressão: some todo o shell (`data-print="ocultar"`), sobra cabeçalho com organização e período, KPIs, gráfico e tabela.
- **shadcn:** Chart, Table, Select, Popover e Calendar (intervalo), Button, Card, Skeleton, Empty.
- **Estados:** sem dados no período: "Sem chamados no período selecionado".

### 3.10 Administração (tabela + Sheet de edição)
Rotas:
- `/admin`, que redireciona para `/admin/usuarios`;
- `/admin/usuarios`;
- `/admin/$entidade`, com `$entidade ∈ areas | prioridades | status | problemas | locais | tipos-equipamento`;
- `/admin/campos`, `/admin/avisos`, `/admin/configuracoes`, `/admin/auditoria`.
```
┌ Administração           ┐┌ Tipos de problema                                   [+ Novo tipo] ┐  ┌ Sheet direita (sm:max-w-md) ┐
│ PESSOAS                 ││ Defina SLAs de resposta e solução por tipo.                         │  │ Editar tipo de problema  [x]│
│ > Usuários              ││ [Q Buscar...] [Situação: Ativos v]                                  │  │ Nome* [Impressora         ] │
│ CHAMADOS                ││ Nome           Área   SLA resposta  SLA solução  Ativo   [..]       │  │ Área* [TI v]                │
│   Áreas                 ││ Impressora     TI     4 h           24 h         Sim     [..]       │  │ SLA resposta (h)* [4]       │
│   Tipos de problema     ││ Rede/Internet  TI     1 h           6 h          Sim     [..]       │  │ SLA solução (h)*  [24]      │
│   Prioridades           ││                                                                     │  │ Campos personalizados [v v] │
│   Status                ││                                                                     │  │ Ativo [x]                   │
│   Campos personalizados ││                                                                     │  │ ──────────────────────────  │
│ ESTRUTURA               ││                                                                     │  │ [Cancelar]        [Salvar]  │
│   Locais                ││                                                                     │  └─────────────────────────────┘
│   Tipos de equipamento  ││                                                                     │
│ COMUNICAÇÃO             ││                                                                     │
│   Mural de avisos       ││                                                                     │
│ SISTEMA                 ││                                                                     │
│   Configurações         ││                                                                     │
│   Auditoria             ││                                                                     │
└─────────────────────────┘└─────────────────────────────────────────────────────────────────────┘
```
- **CRUD genérico:**
  - `EntidadePage` é guiada por `EntidadeDescritor` (`features/admin/entidades.ts`), com schema Zod de shared, colunas e campos;
  - menu da linha: Editar, Ativar/Desativar, Excluir (AlertDialog);
  - se a exclusão der 409 ("em uso"), toast "Registro em uso. Desative-o em vez de excluir.";
  - fechar o Sheet com alterações não salvas pede confirmação ("Descartar alterações?").
- **Cores de prioridade e status:** `ColorField` com input nativo de cor, hex, 12 sugestões e a prévia do badge claro e escuro com a razão de contraste.
- **Usuários** (página própria):
  - colunas: Nome com avatar e presença, Login, E-mail, Perfil, Área, 2FA (Ativo/Inativo), Último acesso, Ativo;
  - ações: Editar, Redefinir senha (gera senha temporária, mostrada uma vez no `SenhaTemporariaDialog` com copiar; força a troca no próximo login), Desativar 2FA, Encerrar sessões, Desativar;
  - o formulário não tem campo de senha digitada pelo admin.
- **Campos personalizados:**
  - Sheet com rótulo, chave (slug automático, editável só na criação), tipo (`texto | texto_longo | numero | data | selecao | selecao_multipla | booleano`), obrigatório, texto de ajuda;
  - `OpcoesEditor` (adicionar, remover, subir, descer) para seleções;
  - "Aplica-se a": todas as áreas, áreas específicas ou tipos de problema específicos;
  - ordem e ativo;
  - prévia ao vivo do campo.
- **Auditoria:**
  - tabela somente leitura: Data, Usuário, Ação, Entidade, Registro, IP;
  - filtros por período, usuário e ação;
  - linha expansível com o diff JSON (antes e depois), renderizado como texto em `<pre>`.
- **shadcn:** Table, Sheet, Field, Input, Textarea, Select, Switch, Checkbox, Command (multisseleção), DropdownMenu, AlertDialog, Dialog, Badge, Skeleton, Empty.

### 3.11 Configurações (admin)
Rota: `/admin/configuracoes`. Uma página com seções em Card; cada seção é um formulário próprio com [Salvar] e índice âncora à esquerda em lg+.
```
┌ Configurações ─────────────────────────────────────────────────────────────────────┐
│ Geral          ┌ Geral ──────────────────────────────────────────────────────────┐ │
│ Segurança      │ Nome do sistema* [Vinimon]   Organização* [Minha Empresa]       │ │
│ Chamados       │                                                       [Salvar]  │ │
│ Notificações   └─────────────────────────────────────────────────────────────────┘ │
│                ┌ Sessão e segurança ─────────────────────────────────────────────┐ │
│                │ Duração da sessão (horas) [8]   Comprimento mínimo da senha [10] │ │
│                │ Exigir 2FA para administradores [x]   para operadores [ ]       │ │
│                └─────────────────────────────────────────────────────────────────┘ │
│                ┌ Chamados ───────────────────────────────────────────────────────┐ │
│                │ Permitir anexos [x]  Tamanho máximo (MB) [10]  Tipos permitidos │ │
│                │ Usuário pode encerrar o próprio chamado [x]                     │ │
│                │ Reabertura permitida até [7] dias após o encerramento           │ │
│                │ Avaliação do atendimento [x]                                    │ │
│                └─────────────────────────────────────────────────────────────────┘ │
│                ┌ Notificações ───────────────────────────────────────────────────┐ │
│                │ E-mail habilitado (somente leitura, vem do servidor)            │ │
│                │ Alerta de SLA quando restar [20]% do prazo                      │ │
│                └─────────────────────────────────────────────────────────────────┘ │
```
- Salvar invalida `metaKeys` e `config`; toast "Configurações salvas".
- As chaves seguem o contrato da API (seção 4.9).

### 3.12 Perfil
Rotas: `/perfil` (Conta), `/perfil/aparencia`, `/perfil/notificacoes`, `/perfil/seguranca`, `/perfil/sessoes`. Navegação em painel de lista no desktop e Select no mobile.
```
Conta:        Avatar 64 px [Alterar foto] [Remover] · Nome* · E-mail · Telefone · (Login e Perfil só leitura) [Salvar]
Aparência:    Tema: 3 cartões RadioGroup com miniatura (Claro | Escuro | Sistema)
              Densidade: (o) Confortável (*) Compacta, com prévia de 2 linhas de tabela
              Composer: [x] Enter envia a mensagem (Shift+Enter quebra linha)
Notificações: Notificações do navegador: [Estado: Permitidas / Bloqueadas / Não solicitadas] [Ativar] [Testar]
              (Bloqueadas → instrução "Clique no cadeado da barra de endereço > Notificações > Permitir")
              ┌ Evento                          No aplicativo  Área de trabalho  E-mail* ┐
              │ Menções a mim                   [x]            [x]               [x]     │
              │ Chamados atribuídos a mim       [x]            [x]               [x]     │
              │ Comentários nos meus chamados   [x]            [x]               [ ]     │
              │ Mudança de status               [x]            [ ]               [ ]     │
              │ Alertas de SLA (equipe)         [x]            [x]               [x]     │
              │ Novos chamados na minha área    [x]            [ ]               [ ]     │
              │ Avisos do mural                 [x]            [x]               [ ]     │
              │ Avaliações recebidas (equipe)   [x]            [ ]               [ ]     │
              └ *coluna E-mail só aparece se config.emailHabilitado ──────────────────────┘ [Salvar]
Segurança:    Trocar senha: Senha atual · Nova · Confirmar · PasswordStrength [Alterar senha]
              Verificação em duas etapas: [Badge Ativa/Inativa]
                Inativa → [Configurar] → DoisFatoresSetupDialog:
                  1) QRCodeSVG(otpauthUri) + chave em mono com [Copiar]
                  2) InputOTP 6 dígitos [Verificar]
                  3) Códigos de recuperação (10) em grade mono + [Copiar] [Baixar .txt]; [x] "Guardei meus códigos" habilita [Concluir]
                Ativa → [Gerar novos códigos] (pede senha) · [Desativar] (pede senha + código; bloqueado se a política exigir)
Sessões:      Tabela: Dispositivo/navegador · IP · Início · Último acesso · [Badge Esta sessão] · [Encerrar]
              [Encerrar todas as outras sessões] (AlertDialog)
```
- Trocar a senha encerra as outras sessões (servidor) e mostra o toast "Senha alterada. As outras sessões foram encerradas."
- **shadcn:** Avatar, Field, Input, RadioGroup, Switch, Checkbox, Table, InputOTP, Dialog, AlertDialog, Badge, Button, Alert, Skeleton.

### 3.13 Mural de avisos
Rotas: `/avisos` (leitura, todos) e `/admin/avisos` (gestão).
```
/avisos:  [Megaphone] Mural de avisos
  ┌ [Pin] [Urgente] Queda de energia programada — sábado 8h às 12h        publicado 20/10 ┐  (danger-soft)
  │ markdown...                                                       válido até 26/10   │
  └──────────────────────────────────────────────────────────────────────────────────────┘
  ┌ [Importante] Nova política de senhas                                                  ┐  (warning-soft)
  ┌ [Informativo] Horário de atendimento no feriado                                       ┐  (info-soft)
Banner global (AvisoBanner, abaixo da top bar): só avisos "urgente" ativos e não dispensados:
  [TriangleAlert] Queda de energia programada — sábado 8h às 12h  [Ver] [x]
Admin: tabela (Título, Nível, Público, Início, Fim, Fixado, Ativo) + Sheet:
  Título* · Conteúdo* (MarkdownEditor) · Nível (Informativo | Importante | Urgente) · Público (Todos | Equipe | Áreas: multisseleção)
  Início* / Fim (DateTimePicker) · Fixado (Switch) · Ativo (Switch)
```
- Os avisos aparecem também no topo da Atividade (`AvisosStrip`, só os fixados) e no card do Painel.
- Dispensar o banner chama `POST /api/avisos/:id/dispensar`, persistido por usuário.
- Socket `aviso:novo` invalida `avisoKeys` e, para avisos urgentes, gera uma notificação na área de trabalho.
- **Estados:** vazio: "Nenhum aviso no momento".

### 3.14 Avaliação do atendimento
Aparece na aba Conversa quando o chamado está encerrado, `config.avaliacaoHabilitada` está ligada, o solicitante sou eu e ainda não houve avaliação. A notificação "Avalie o atendimento do chamado #125" leva para `?foco=avaliacao`.
```
┌ Como foi o atendimento? ───────────────────────────────────────────┐
│ [Star][Star][Star][Star][Star]   "Muito satisfeito"                  │  RadioGroup com 5 itens; ← → mudam; rótulos:
│ Comentário (opcional) [______________________________________]      │  1 Muito insatisfeito · 2 Insatisfeito · 3 Neutro
│                                                   [Enviar avaliação] │  4 Satisfeito · 5 Muito satisfeito
└──────────────────────────────────────────────────────────────────────┘
Depois: "Obrigado pela avaliação!" + estrelas somente leitura. A equipe vê a avaliação como card de sistema e na aba Detalhes.
```
- As estrelas usam `fill-warning text-warning-foreground` quando ativas. Cada item tem `aria-label` com o rótulo e o estado selecionado é exposto pelo `RadioGroup` do Radix.
- **shadcn:** Card, RadioGroup (estilizado), Textarea, Button.
- **Estados:** enviando = Spinner; erro = toast com o formulário mantido.

### 3.15 Telas auxiliares
- **CommandPalette (Ctrl K):** `CommandDialog` com `shouldFilter={false}` e grupos, nesta ordem:
  - "Abrir #N" quando o termo é numérico;
  - Chamados, Artigos, Equipamentos, Pessoas (`GET /api/busca?q=`, debounce de 200 ms, 5 por grupo);
  - Ir para (apps com `Kbd` "G A" etc., filtrados localmente);
  - Ações: Abrir chamado (C), Alternar tema, Definir status Disponível / Ocupado / Ausente, Densidade, Atalhos;
  - Recentes: os últimos 8 chamados visitados, de `localStorage['vinimon:recentes']`, quando o termo está vazio.
  - Rodapé com `Kbd`: "↑↓ navegar · Enter abrir · Esc fechar".
- **`/sem-permissao`:** `EmptyState` (`Ban`) "Você não tem acesso a esta área" com [Voltar ao início].
- **404 (notFoundComponent):** `FileQuestion` "Página não encontrada".
- **Erro de rota:** `ErrorState` com mensagem por status:
  - 403: "Você não tem acesso a este conteúdo";
  - 404: "Não encontrado";
  - status 0 (sem conexão, `WifiOff`): "Sem conexão com o servidor";
  - 5xx (`ServerCrash`): "Algo deu errado do nosso lado", com o "Código para o suporte" em `requestId` copiável.
- **AtalhosDialog:** tabela de atalhos (seção 2.7) com `Kbd`.

---

## 4. Estrutura de pastas e convenções

### 4.1 Árvore exata de `apps/web`
```
apps/web/
  index.html
  components.json
  package.json                (nome: @vinimon/web)
  vite.config.ts
  tsconfig.json  tsconfig.app.json  tsconfig.node.json
  eslint.config.js
  playwright.config.ts
  public/
    favicon.svg  icon-192.png  theme-init.js
  e2e/
    login.spec.ts  chamado-fluxo.spec.ts  a11y.spec.ts
  src/
    main.tsx
    router.tsx
    routeTree.gen.ts          (gerado pelo plugin; versionado; não editar; ignorado por eslint/prettier)
    styles/globals.css
    test/setup.ts
    routes/
      __root.tsx
      login.tsx
      trocar-senha.tsx
      configurar-2fa.tsx
      _app.tsx                (layout autenticado: AppShell + guarda)
      _app/
        index.tsx             (redirect: equipe → /atividade; usuário → /chamados)
        sem-permissao.tsx
        atividade.tsx
        painel.tsx
        avisos.tsx
        chamados/
          route.tsx           (layout Chamados: TwoPane com VisoesPane OU ChamadosListaCompacta; validateSearch dos filtros)
          index.tsx           (tabela)
          novo.tsx
          $chamadoId/
            route.tsx         (layout do chamado: header + RouteTabs + Outlet + QuickActionsRail; loader)
            index.tsx         (Conversa)
            detalhes.tsx
            anexos.tsx
            historico.tsx
            tempo.tsx
        conhecimento/
          route.tsx           (layout com CategoriasPane)
          index.tsx
          novo.tsx
          $artigoId/
            index.tsx
            editar.tsx
        inventario/
          route.tsx           (layout com TiposPane; beforeLoad exigir('inventario.ver'))
          index.tsx
          $equipamentoId.tsx
        relatorios/
          route.tsx           (layout com RelatoriosPane; exigir('relatorios.ver'))
          index.tsx           (redirect /relatorios/visao-geral)
          $relatorio.tsx
        admin/
          route.tsx           (layout com AdminNavPane; exigir('admin.acessar'))
          index.tsx           (redirect /admin/usuarios)
          usuarios.tsx
          $entidade.tsx
          campos.tsx
          avisos.tsx
          configuracoes.tsx
          auditoria.tsx
        perfil/
          route.tsx           (layout com PerfilNavPane)
          index.tsx
          aparencia.tsx
          notificacoes.tsx
          seguranca.tsx
          sessoes.tsx
    components/
      ui/                     (gerado pelo shadcn; só os ajustes da seção 1.12)
      layout/   app-shell.tsx app-bar.tsx app-bar-item.tsx top-bar.tsx mobile-nav.tsx two-pane.tsx
                pane-header.tsx list-pane-section.tsx list-pane-nav-item.tsx route-tabs.tsx skip-link.tsx
                offline-indicator.tsx busca-global-trigger.tsx
      feedback/ empty-state.tsx error-state.tsx page-skeleton.tsx confirm-dialog.tsx not-found-state.tsx
      data/     data-table.tsx data-table-toolbar.tsx data-table-faceted-filter.tsx data-table-column-toggle.tsx
                data-table-pagination.tsx data-table-column-header.tsx data-table-bulk-bar.tsx
      form/     campo-form.tsx password-input.tsx password-strength.tsx autosize-textarea.tsx combobox-field.tsx
                multi-combobox-field.tsx date-picker.tsx date-time-picker.tsx date-range-picker.tsx color-field.tsx
                file-dropzone.tsx upload-list.tsx markdown-editor.tsx campo-personalizado-input.tsx
      display/  color-badge.tsx status-badge.tsx prioridade-badge.tsx sla-badge.tsx user-avatar.tsx avatar-group.tsx
                presence-indicator.tsx user-hover-card.tsx relative-time.tsx markdown.tsx mention-chip.tsx
                key-value-grid.tsx stat-card.tsx chart-card.tsx kbd-shortcut.tsx pode.tsx
      theme/    theme-provider.tsx density-provider.tsx
      command/  command-palette.tsx atalhos-dialog.tsx
    features/
      auth/          api.ts queries.ts guards.ts components/ (auth-layout, login-form, dois-fatores-form, trocar-senha-form)
      meta/          api.ts queries.ts                     (cadastros p/ selects + config pública)
      chamados/      api.ts queries.ts filtros.ts columns.tsx components/ (chamados-table, chamado-list-item,
                     visoes-pane, chamados-lista-compacta, chamado-header, quick-actions-rail, novo-chamado-form,
                     artigos-sugeridos, bulk-actions-bar, salvar-filtro-dialog, encerrar-dialog, encaminhar-dialog,
                     reabrir-dialog, agendar-popover, operador-select, chamado-detalhes)
      conversa/      api.ts queries.ts hooks.ts components/ (conversa-view, message-list, message-bubble, system-event,
                     date-separator, typing-indicator, read-receipt, composer, mention-popover, new-messages-pill,
                     descricao-inicial-card, solucao-card, avaliacao-card)
      anexos/        api.ts queries.ts components/ (anexos-view, anexo-card, anexo-preview-dialog)
      historico/     api.ts queries.ts components/ (historico-timeline)
      tempo/         api.ts queries.ts components/ (tempo-view, cronometro-button, apontamento-dialog)
      notificacoes/  api.ts queries.ts desktop.ts components/ (notification-bell, notification-item, desktop-notifications-prompt)
      atividade/     components/ (activity-feed, activity-item, activity-filters, activity-preview)   (usa queries de notificacoes)
      presenca/      api.ts queries.ts hooks.ts components/ (user-menu)
      busca/         api.ts queries.ts
      painel/        api.ts queries.ts components/ (kpi-grid, abertos-encerrados-chart, distribuicao-bar-chart,
                     prioridade-donut-chart, sla-radial-chart, sla-proximos-table)
      avisos/        api.ts queries.ts components/ (aviso-card, aviso-banner, avisos-strip, aviso-sheet)
      conhecimento/  api.ts queries.ts components/ (categorias-pane, artigo-list, artigo-view, artigo-form, artigo-feedback)
      inventario/    api.ts queries.ts components/ (tipos-pane, equipamentos-table, equipamento-sheet, equipamento-header,
                     etiqueta-qr-dialog, movimentacoes-timeline)
      relatorios/    api.ts queries.ts components/ (relatorios-pane, relatorio-filtros, relatorio-tabela, exportar-csv-button)
      admin/         api.ts queries.ts entidades.ts components/ (admin-nav-pane, entidade-page, entidade-sheet,
                     usuarios-page, senha-temporaria-dialog, campos-personalizados-editor, opcoes-editor,
                     configuracoes-secao, auditoria-table)
      perfil/        api.ts queries.ts components/ (perfil-nav-pane, tema-selector, densidade-selector,
                     preferencias-notificacao-table, trocar-senha-card, dois-fatores-card, dois-fatores-setup-dialog,
                     codigos-recuperacao-list, sessoes-table, avatar-upload)
    lib/
      api-client.ts  query-client.ts  socket.ts  cores.ts  cores.test.ts  datas.ts  datas.test.ts
      sla.ts  sla.test.ts  mencoes.ts  mencoes.test.ts  permissoes.ts  atalhos.ts  storage.ts
      rotulos.ts  form.ts  utils.ts (cn – shadcn)
    hooks/
      use-debounce.ts  use-media-query.ts  use-mobile.ts  use-prefers-reduced-motion.ts  use-atalhos.ts
      use-ocioso.ts  use-document-title.ts  use-copiar.ts  use-alteracoes-nao-salvas.ts  use-agora.ts
      use-foco-ao-navegar.ts  use-socket-evento.ts
```
- `vite.config.ts`:
  - plugins na ordem `[tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()]`;
  - `resolve.alias: { '@': path.resolve(__dirname, 'src') }`;
  - `server.proxy: { '/api': API, '/socket.io': { target: API, ws: true } }`, com `API = process.env.VITE_API_PROXY ?? 'http://localhost:3000'`. A porta segue o plano da API; o padrão assumido é 3000.
- `tsconfig.app.json`:
  - `"strict": true`, `"noUncheckedIndexedAccess": true`;
  - `"paths": { "@/*": ["./src/*"] }`;
  - `"types": ["vite/client"]`.

### 4.2 Convenções de código
- **Arquivos** em kebab-case (`status-badge.tsx`). Componentes em PascalCase com **export nomeado**. Arquivos de rota exportam só `Route`.
- **Identificadores sem acento**, com domínio em português (`Chamado`, `Assentamento`, `Inventario`, `Configuracoes`) e termos técnicos em inglês (`api`, `queries`, `components`, `hooks`, `props`). Textos de interface com acentuação correta.
- **Hooks:** `useX` em `use-x.ts`. Constantes em UPPER_SNAKE. Tipos e interfaces em PascalCase, props como `XProps`.
- **Rótulos repetidos** ficam em `lib/rotulos.ts`: `NIVEIS`, `TIPOS_STATUS`, `ROTULOS_PRESENCA`, `SITUACOES_EQUIPAMENTO`, `ROTULOS_VISAO`, `ROTULOS_NOTA`. Não há biblioteca de i18n.
- **Tipos de domínio** vêm de `@vinimon/shared`; o front não redeclara tipos de API.
- **Somente `features/*/api.ts` conhece URLs.** Componentes não chamam `apiFetch`; usam hooks de `queries.ts`. Verificação: `grep -rn "apiFetch(" src --include=*.tsx` não retorna nada.
- **Proibido:**
  - `dangerouslySetInnerHTML` fora de `components/ui/**` (regra `no-restricted-syntax`);
  - `fetch(` direto fora de `lib/api-client.ts`;
  - `localStorage` direto fora de `lib/storage.ts`, com chaves sempre prefixadas `vinimon:`;
  - import de `next-themes` ou de `@radix-ui/*` (usar `components/ui`).
- **Links externos no markdown:** `target="_blank" rel="noopener noreferrer nofollow"`.
- **react-markdown** sem `rehype-raw` (HTML cru não é renderizado). `urlTransform` aceita `usuario:` e, para o resto, usa `defaultUrlTransform`.

### 4.3 Rotas e guardas
- `__root.tsx`:
  - `createRootRouteWithContext<{ queryClient: QueryClient }>()`;
  - componente: `<Outlet/>` + `<Toaster position="bottom-right" closeButton />`;
  - `notFoundComponent`.
- `router.tsx`:
  - `createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent', defaultPreloadStaleTime: 0, scrollRestoration: true, defaultPendingMs: 150, defaultPendingMinMs: 300, defaultPendingComponent: PageSkeleton, defaultErrorComponent: ErrorState, defaultNotFoundComponent: NotFoundState })`;
  - `declare module '@tanstack/react-router' { interface Register { router: typeof router } }`.
- `_app.tsx` `beforeLoad`:
  - `const me = await context.queryClient.ensureQueryData(authQueries.me())`;
  - o queryFn devolve `null` em 401;
  - `!me` → `throw redirect({ to: '/login', search: { redirect: location.href } })`;
  - `me.deveTrocarSenha` → `redirect({ to: '/trocar-senha' })`;
  - `me.precisaConfigurar2fa` → `redirect({ to: '/configurar-2fa' })`;
  - `return { me }`, que fica disponível em `context.me` nas filhas.
- **Permissão:**
  - `features/auth/guards.ts`: `export const exigir = (p: Permissao) => ({ context }: { context: { me: UsuarioSessao } }) => { if (!temPermissao(context.me, p)) throw redirect({ to: '/sem-permissao' }); }`;
  - uso: `beforeLoad: exigir('admin.acessar')`;
  - na interface: `<Pode permissao="chamados.atender">...</Pode>` e `usePode(p)`. A interface só esconde; quem garante é a API.
- **Parâmetros de rota numéricos:** `params: { parse: (p) => ({ chamadoId: z.coerce.number().int().positive().parse(p.chamadoId) }), stringify: (p) => ({ chamadoId: String(p.chamadoId) }) }`. Em erro de parse, `throw notFound()`.
- **Search params:**
  - `validateSearch: Schema` recebe o schema Zod direto (Standard Schema; **sem** `@tanstack/zod-adapter`);
  - todos os campos `.optional()`; os padrões são aplicados no componente (`const f = { ...FILTROS_PADRAO, ...search }`);
  - links do detalhe preservam os filtros com `search={true}`, porque o schema está em `chamados/route.tsx`, que é pai.
- **Loader:** `loader: ({ context, params }) => context.queryClient.ensureQueryData(chamadoQueries.detalhe(params.chamadoId))`. O componente lê com `useSuspenseQuery(chamadoQueries.detalhe(id))`.
- **Sessão expirada:** o `QueryCache` / `MutationCache` `onError` com `ApiError.status === 401` faz `queryClient.setQueryData(authKeys.me, null)`, `router.navigate({ to: '/login', search: { redirect } })` e o toast "Sua sessão expirou. Entre novamente."

### 4.4 Cliente HTTP, TanStack Query e chaves
**`lib/api-client.ts`:**
- `apiFetch<T>(caminho, { method?, body?, query?, signal? })`:
  - prefixo `/api`, `credentials: 'include'`, JSON;
  - em métodos diferentes de GET, envia o header CSRF (nomes `CSRF_HEADER` e `CSRF_COOKIE` exportados por `packages/shared/src/http.ts`; o valor vem do cookie);
  - `query` é serializado sem vazios; arrays repetem a chave.
- `class ApiError extends Error { status: number; codigo: string; camposComErro?: Record<string, string[]>; requestId?: string }`. Lê `message`, `code` e `fieldErrors` do corpo e `x-request-id` do header. Falha de rede vira `status 0`, `codigo 'REDE'`, mensagem "Sem conexão com o servidor".
- `enviarArquivo(caminho, arquivo, campos, aoProgresso, signal)`: XHR multipart com progresso de 0 a 100.

**`lib/query-client.ts`:**
- defaults: `staleTime: 30_000`, `gcTime: 300_000`, `refetchOnWindowFocus: true`, `retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2`;
- `MutationCache.onError`: `toast.error(meta?.erroTitulo ?? 'Não foi possível concluir a ação', { description: e.message })`, exceto quando `meta.silenciarErro`.

**Padrão por feature** (exemplo; vale para todas):
```ts
// features/chamados/api.ts — só HTTP
export const chamadosApi = {
  listar: (f: ChamadoFiltros, signal?: AbortSignal) => apiFetch<Paginado<ChamadoResumo>>('/chamados', { query: f, signal }),
  obter: (id: number, signal?: AbortSignal) => apiFetch<ChamadoDetalhe>(`/chamados/${id}`, { signal }),
  alterarStatus: (id: number, dados: AlterarStatusInput) => apiFetch<ChamadoDetalhe>(`/chamados/${id}/status`, { method: 'POST', body: dados }),
};
// features/chamados/queries.ts — React Query
export const chamadoKeys = {
  todos: ['chamados'] as const,
  listas: () => [...chamadoKeys.todos, 'lista'] as const,
  lista: (f: ChamadoFiltros) => [...chamadoKeys.listas(), f] as const,
  contagens: () => [...chamadoKeys.todos, 'contagens'] as const,
  detalhe: (id: number) => [...chamadoKeys.todos, 'detalhe', id] as const,
  mensagens: (id: number) => [...chamadoKeys.detalhe(id), 'mensagens'] as const,
  anexos: (id: number) => [...chamadoKeys.detalhe(id), 'anexos'] as const,
  historico: (id: number) => [...chamadoKeys.detalhe(id), 'historico'] as const,
  tempo: (id: number) => [...chamadoKeys.detalhe(id), 'tempo'] as const,
};
export const chamadoQueries = {
  lista: (f: ChamadoFiltros) => queryOptions({ queryKey: chamadoKeys.lista(f), queryFn: ({ signal }) => chamadosApi.listar(f, signal), placeholderData: keepPreviousData }),
  detalhe: (id: number) => queryOptions({ queryKey: chamadoKeys.detalhe(id), queryFn: ({ signal }) => chamadosApi.obter(id, signal) }),
};
export function useAlterarStatus(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: AlterarStatusInput) => chamadosApi.alterarStatus(id, dados),
    onSuccess: (ch) => { qc.setQueryData(chamadoKeys.detalhe(id), ch); qc.invalidateQueries({ queryKey: chamadoKeys.listas() }); qc.invalidateQueries({ queryKey: chamadoKeys.contagens() }); toast.success(`Status alterado para ${ch.status.nome}`); },
    meta: { erroTitulo: 'Não foi possível alterar o status' },
  });
}
```

**Chaves das demais features** (todas com o padrão `as const`):
- `authKeys.me = ['auth','me']` (staleTime 5 min)
- `metaKeys.tudo = ['meta']` (staleTime 5 min; invalidada depois de salvar no admin)
- `filtroSalvoKeys = ['filtros-salvos','chamados']`
- `notificacaoKeys`: `['notificacoes','lista',filtro]` (infinite) e `['notificacoes','contagem']`
- `presencaKeys.todos = ['presenca']` (`Record<number, PresencaStatus>`, staleTime Infinity, atualizada pelo socket)
- `buscaKeys.termo(q) = ['busca', q]`
- `painelKeys.dados(f) = ['painel', f]`
- `artigoKeys`: `['artigos','lista',f]`, `['artigos','detalhe',id]`, `['artigos','categorias']`, `['artigos','sugestoes',termo]`
- `equipamentoKeys`: `['equipamentos','lista',f]`, `['equipamentos','detalhe',id]`, `['equipamentos','detalhe',id,'chamados']`, `['equipamentos','detalhe',id,'movimentacoes']`, `['equipamentos','tipos']`
- `relatorioKeys.dados(tipo, f) = ['relatorios', tipo, f]`
- `adminKeys.lista(entidade, f) = ['admin', entidade, 'lista', f]`, `configKeys = ['config']`
- `campoKeys.escopo(areaId, problemaId) = ['campos-personalizados', areaId, problemaId]`
- `avisoKeys`: `['avisos','ativos']`, `['avisos','admin',f]`
- `perfilKeys`: `['me','preferencias']`, `['me','sessoes']`, `['me','2fa']`
- `usuarioKeys`: `['usuarios','busca',q]`, `['usuarios','mencionaveis',chamadoId,q,privado]`

**Hooks de mutação** são nomeados por ação no infinitivo: `useCriarChamado`, `useComentar`, `useAssumirChamado`, `useEncerrarChamado`, `useMarcarNotificacaoLida`.

**Conversa:** `useInfiniteQuery` com `getPreviousPageParam` (cursor). O socket aplica `setQueryData` na última página.

### 4.5 Erros e toasts
- **Consultas** mostram o erro inline (`ErrorState`), sem toast.
- **Mutações:**
  - sucesso: toast curto no particípio ("Chamado #126 aberto", "Configurações salvas"), com `action` quando houver destino;
  - erro: toast global pelo `MutationCache`;
  - 422 com `camposComErro`: aplicar no formulário com `aplicarErrosDoServidor(form.setError, erro)` (`lib/form.ts`), sem toast (`meta.silenciarErro: true`).
- **Ações destrutivas:** `ConfirmDialog` (AlertDialog) com verbo explícito ("Excluir tipo de problema"), botão `variant="destructive"` e foco inicial em "Cancelar".
- **Mensagem do chat** com falha: estado inline na bolha (seção 3.6), sem toast.
- **Textos de erro** são os da API (pt-BR). Fallback: "Não foi possível concluir a ação. Tente novamente."

### 4.6 Formulários
- react-hook-form com zod de `packages/shared`. Helper em `lib/form.ts`:
```ts
export function useZodForm<S extends z.ZodType>(schema: S, opcoes?: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, 'resolver'>) {
  return useForm<z.input<S>, unknown, z.output<S>>({ resolver: zodResolver(schema), mode: 'onTouched', ...opcoes });
}
```
- **Todo campo passa por `CampoForm`:** Controller com `Field`, `FieldLabel`, `FieldDescription` e `FieldError` do shadcn; `id`, `aria-invalid`, `aria-describedby` e `aria-required` são gerados automaticamente.
- Campos obrigatórios marcados com " *" (`aria-hidden`) mais `aria-required`.
- **Submit:** botão com `disabled={form.formState.isSubmitting || mutation.isPending}` e Spinner. Enter envia em formulários de uma coluna.
- **Sheets e páginas de edição** usam `useAlteracoesNaoSalvas(form.formState.isDirty)`: confirma ao fechar e usa `useBlocker` do TanStack Router ao navegar.
- **Schemas exclusivos de UI** (ex.: confirmar senha) estendem o schema de shared em `features/<x>/components/*`, com `.extend()` e `.refine()`.

### 4.7 Tempo real
- `lib/socket.ts`: `obterSocket()`, `conectarSocket()`, `desconectarSocket()`.
- `hooks/use-socket-evento.ts`: `useSocketEvento(evento, handler)`, com handler estável via ref.
- `features/presenca/hooks.ts`:
  - `useSincronizacaoTempoReal()` (chamado no layout `_app`) registra `notificacao:nova` (atualiza contagem, prepende na lista, notificação na área de trabalho, título da aba), `presenca:*`, `aviso:novo` e `chamados:lista-alterada` (invalida listas e contagens com throttle de 2 s);
  - `usePresenca(usuarioId)` lê de `presencaKeys.todos` com `select`.
- `features/conversa/hooks.ts`:
  - `useSalaDoChamado(id)`: emite `chamado:entrar` ao montar e na reconexão, e `chamado:sair` ao desmontar;
  - `useDigitando(id)`;
  - `useLeituras(id)`.
- `features/notificacoes/desktop.ts`:
  - `notificarAreaDeTrabalho(n: Notificacao, navegar: (to) => void)`;
  - só dispara se a permissão foi concedida, a preferência `desktop` do tipo está ligada e `document.visibilityState === 'hidden' || !document.hasFocus()`;
  - quando ocupado, só menções e SLA;
  - `new Notification(titulo, { body, tag: 'chamado-' + id, icon: '/icon-192.png' })`;
  - `onclick`: `window.focus()`, navega e fecha.
- **Título da aba:** `useDocumentTitle(titulo)` monta "(3) Chamados · Vinimon".

### 4.8 Desempenho
- `autoCodeSplitting` deixa recharts, react-markdown e qrcode só nos chunks das rotas que os usam.
- `defaultPreload: 'intent'` + `ensureQueryData` nos loaders.
- `keepPreviousData` nas listas.
- Debounce de 300 ms em buscas, com `AbortSignal` repassado ao fetch.
- Socket no lugar do polling.
- `loading="lazy"` em imagens de anexo.
- `React.memo` em `MessageBubble` e `ChamadoListItem`.
- Orçamento (W52): JS inicial da rota `/login` ≤ 200 kB gzip; shell + `/chamados` ≤ 350 kB gzip, conferidos na saída do `vite build`.

### 4.9 Contratos que o front consome (alinhar com o plano da API)
Os nomes do plano da API **prevalecem**. Se divergirem, ajuste só os `features/*/api.ts` e `packages/shared`.

**REST** (prefixo `/api`):

| Área | Endpoints |
|---|---|
| Auth | `POST auth/login` → `{etapa:'ok'\|'2fa'}`; `POST auth/2fa {codigo}\|{codigoRecuperacao}`; `POST auth/logout`; `GET auth/me` (inclui `permissoes`, `preferencias`, `deveTrocarSenha`, `precisaConfigurar2fa`); `POST auth/trocar-senha` |
| Meta | `GET meta` (áreas, prioridades, status, problemas, locais, tipos de equipamento, operadores, config pública: `nomeSistema`, `organizacao`, `anexosPermitidos`, `tamanhoMaxAnexoMb`, `tiposAnexo`, `avaliacaoHabilitada`, `emailHabilitado`, `usuarioPodeEncerrar`) |
| Chamados | `GET chamados?<ChamadoFiltros>` → `{itens,total,pagina,porPagina}`; `GET chamados/contagens`; `GET chamados/exportar.csv`; `POST chamados`; `GET chamados/:id` (inclui `participantes`, `leituras[]`, `avaliacao`, `permissoesDoUsuario`); `POST chamados/:id/{assumir,status,prioridade,encaminhar,agendar,encerrar,reabrir}`; `POST chamados/em-massa {ids,acao,...}` → `{sucesso[],falhas[{id,motivo}]}` |
| Conversa | `GET chamados/:id/assentamentos?antesDe=&limite=50`; `POST chamados/:id/assentamentos {texto,privado,mencoes[],clienteId}`; `GET chamados/:id/mencionaveis?q=&privado=` |
| Anexos | `GET chamados/:id/anexos`; `POST chamados/:id/anexos` (multipart: `arquivo`, `assentamentoId?`); `GET anexos/:id` (download); `DELETE anexos/:id` |
| Histórico, tempo, avaliação | `GET chamados/:id/historico`; `GET/POST chamados/:id/apontamentos`; `POST chamados/:id/apontamentos/cronometro {acao:'iniciar'\|'parar'}`; `PATCH/DELETE apontamentos/:id`; `POST chamados/:id/avaliacao {nota,comentario?}` |
| Filtros salvos | `GET/POST filtros-salvos`; `PATCH/DELETE filtros-salvos/:id` (`{nome, filtros: ChamadoFiltros, compartilhado}`) |
| Notificações | `GET notificacoes?filtro=&cursor=&limite=30` → `{itens,proximoCursor}`; `GET notificacoes/contagem`; `POST notificacoes/:id/{lida,nao-lida}`; `POST notificacoes/lidas {chamadoId?}` |
| Busca | `GET busca?q=` → `{chamados,artigos,equipamentos,usuarios}` (5 de cada, já no escopo do perfil) |
| Painel e relatórios | `GET painel?periodo=&areaId=`; `GET relatorios/:tipo?de=&ate=&areaId=&operadorId=`; `GET relatorios/:tipo.csv` |
| Conhecimento | `GET artigos?busca=&categoria=`; `GET artigos/categorias`; `GET artigos/sugestoes?q=`; `GET/POST/PUT/DELETE artigos[/:id]`; `POST artigos/:id/{util,resolveu}` |
| Inventário | `GET equipamentos?...`; `GET/POST/PUT equipamentos[/:id]`; `GET equipamentos/:id/{chamados,movimentacoes}`; `GET equipamentos/por-etiqueta/:etiqueta` |
| Admin | `GET/POST/PUT/DELETE admin/:entidade[/:id]`; `POST admin/usuarios/:id/{redefinir-senha,desativar-2fa,encerrar-sessoes}`; `GET/POST/PUT/DELETE campos-personalizados[/:id]`; `GET campos-personalizados?areaId=&problemaId=`; `GET/PUT config`; `GET admin/auditoria?...` |
| Avisos | `GET avisos/ativos`; `POST avisos/:id/dispensar`; `GET/POST/PUT/DELETE admin/avisos[/:id]` |
| Perfil | `PATCH me`; `PUT/DELETE me/avatar`; `GET/PATCH me/preferencias` (`{tema,densidade,enviarComEnter,notificacoes: Record<TipoNotificacao,{app,desktop,email}>}`); `POST me/2fa/configurar` → `{otpauthUri, segredo}`; `POST me/2fa/ativar {codigo}` → `{codigosRecuperacao[]}`; `POST me/2fa/desativar {senha,codigo}`; `POST me/2fa/codigos {senha}`; `GET me/sessoes`; `DELETE me/sessoes/:id`; `DELETE me/sessoes?outras=1` |

**Socket.IO** (tipos em `packages/shared/src/realtime.ts`):
- servidor → cliente:
  - `presenca:snapshot (Record<number,PresencaStatus>)`;
  - `presenca:atualizada {usuarioId,status}`;
  - `notificacao:nova (Notificacao)`;
  - `chamado:assentamento {chamadoId, assentamento, clienteId?}`;
  - `chamado:atualizado {chamadoId, campos[]}`;
  - `chamado:digitando {chamadoId, usuario:{id,nome}, digitando}`;
  - `chamado:leitura {chamadoId, usuarioId, ultimoAssentamentoId, lidoEm}`;
  - `chamados:lista-alterada {areaId}`;
  - `aviso:novo (Aviso)`.
- cliente → servidor:
  - `chamado:entrar {chamadoId} (ack {ok})`;
  - `chamado:sair {chamadoId}`;
  - `chamado:digitando {chamadoId, digitando}`;
  - `chamado:ler {chamadoId, ultimoAssentamentoId}`;
  - `presenca:definir {status:'online'|'ocupado'|'ausente', automatico}`.
- Segurança, a cargo da API:
  - assentamentos privados e o "digitando" do modo privado só vão para a sala da equipe (`chamado:<id>:equipe`);
  - `chamado:entrar` valida o escopo do usuário.

**Também em `packages/shared`** (usados pelo front):
- `ChamadoFiltrosSchema` (visao, busca, status[], prioridade[], area[], problema[], operador[] (0 = sem operador), solicitante, de e ate como `YYYY-MM-DD` validados por regex, sla, filtroId, ordem, dir, pagina, porPagina 25 | 50 | 100);
- `PresencaStatus`, `TipoNotificacao`, `Permissao`, `temPermissao`;
- `MENCAO_REGEX = /@\[([^\]]{1,80})\]\(usuario:(\d+)\)/g`;
- `schemaDosCampos(campos)`;
- `CSRF_HEADER` e `CSRF_COOKIE`.

---

## 5. Componentes

### 5.1 shadcn a instalar

1. **Criar `apps/web/components.json` à mão.** Não usar `shadcn init -d`.
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/styles/globals.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" }
}
```
2. **Criar `src/lib/utils.ts`** com `cn` (`clsx` + `tailwind-merge`).
3. **Rodar em `apps/web`:**
```
pnpm dlx shadcn@4.22.1 add alert alert-dialog avatar badge button button-group calendar card chart checkbox collapsible command context-menu dialog dropdown-menu empty field hover-card input input-group input-otp item kbd label popover progress radio-group scroll-area select separator sheet skeleton sonner spinner switch table tabs textarea toggle toggle-group tooltip -y
```
4. **Se o CLI sobrescrever `globals.css` com tokens próprios:** restaurar o arquivo da seção 1.2 (verificar com `git diff`).
5. **Fora de propósito:** `sidebar`, `resizable`, `drawer`, `form` (substituído por `field`), `navigation-menu`, `carousel`.

### 5.2 Componentes próprios (props TypeScript)

**layout/**
```ts
export type AppId = 'atividade' | 'chamados' | 'painel' | 'conhecimento' | 'inventario' | 'relatorios' | 'admin';
export interface AppBarItemDef { id: AppId; rotulo: string; rotuloAcessivel: string; icone: LucideIcon; to: LinkProps['to']; permissao?: Permissao; contador?: number; atalho: string }
export interface AppShellProps { children: React.ReactNode }
export interface AppBarProps { itens: AppBarItemDef[]; aoAbrirAjuda: () => void }
export interface AppBarItemProps { item: AppBarItemDef; ativo: boolean }
export interface MobileNavProps { itens: AppBarItemDef[] }          // mostra 4 + "Mais"
export interface TwoPaneProps {
  lista: React.ReactNode; listaRotulo: string; children: React.ReactNode;
  modoMobile: 'lista' | 'conteudo'; listaColapsavel?: boolean; idPersistencia?: string;   // 'vinimon:painel-lista:<id>'
  ocultarListaAbaixoDeLg?: boolean;                                                         // rotas de detalhe
  direita?: React.ReactNode; direitaRotulo?: string;                                        // trilho (xl+) / Sheet
}
export interface PaneHeaderProps { titulo: React.ReactNode; subtitulo?: React.ReactNode; voltarPara?: LinkProps; acoes?: React.ReactNode; abaixo?: React.ReactNode; nivel?: 'h1' | 'h2' }
export interface ListPaneSectionProps { titulo?: string; acao?: React.ReactNode; children: React.ReactNode }
export interface ListPaneNavItemProps { asChild?: boolean; ativo?: boolean; icone?: LucideIcon; rotulo: string; contagem?: number; naoLido?: boolean; acoes?: React.ReactNode; children?: React.ReactNode }
export interface RouteTabItem { to: LinkProps['to']; params?: Record<string, string | number>; search?: true; rotulo: string; icone?: LucideIcon; contagem?: number; exact?: boolean }
export interface RouteTabsProps { itens: RouteTabItem[]; rotulo: string }
export interface SkipLinkProps { alvo?: string }                    // padrão '#conteudo'
export interface OfflineIndicatorProps { desconectadoDesde: number | null }
export interface BuscaGlobalTriggerProps { aoAbrir: () => void; compacto?: boolean }
```
**feedback/**
```ts
export interface EmptyStateProps { icone: LucideIcon; titulo: string; descricao?: React.ReactNode; acao?: React.ReactNode; compacto?: boolean }
export interface ErrorStateProps { erro: unknown; aoTentarNovamente?: () => void; compacto?: boolean }   // usa ApiError.status/requestId
export interface PageSkeletonProps { variante?: 'lista' | 'tabela' | 'detalhe' | 'conversa' | 'formulario' | 'painel' }
export interface ConfirmDialogProps { aberto: boolean; aoMudarAberto: (v: boolean) => void; titulo: string; descricao: React.ReactNode; rotuloConfirmar: string; destrutivo?: boolean; aoConfirmar: () => void | Promise<void> }
export interface NotFoundStateProps { titulo?: string; descricao?: string }
```
**data/**
```ts
export interface DataTableProps<TData> {
  rotulo: string; colunas: ColumnDef<TData, unknown>[]; dados: TData[]; obterIdLinha: (l: TData) => string;
  total: number; pagina: number; porPagina: 25 | 50 | 100; aoMudarPagina: (p: number) => void; aoMudarPorPagina: (n: 25 | 50 | 100) => void;
  ordenacao?: { campo: string; direcao: 'asc' | 'desc' }; aoOrdenar?: (o: { campo: string; direcao: 'asc' | 'desc' }) => void;
  selecionavel?: boolean; selecao?: RowSelectionState; aoMudarSelecao?: (s: RowSelectionState) => void;
  colunasVisiveis?: VisibilityState; aoMudarColunasVisiveis?: (v: VisibilityState) => void;
  aoClicarLinha?: (l: TData) => void; carregando?: boolean; atualizando?: boolean; vazio: React.ReactNode;
  barraFerramentas?: React.ReactNode; rodape?: React.ReactNode;
}
export interface FacetOpcao { valor: string; rotulo: string; cor?: string; icone?: LucideIcon; contagem?: number }
export interface DataTableFacetedFilterProps { titulo: string; opcoes: FacetOpcao[]; selecionados: string[]; aoMudar: (v: string[]) => void }
export interface DataTableColumnToggleProps<TData> { table: Table<TData>; chavePersistencia: string }
export interface DataTablePaginationProps { total: number; pagina: number; porPagina: 25 | 50 | 100; aoMudarPagina: (p: number) => void; aoMudarPorPagina: (n: 25 | 50 | 100) => void }
export interface DataTableColumnHeaderProps { titulo: string; campo: string; ordenacao?: { campo: string; direcao: 'asc' | 'desc' }; aoOrdenar?: (o: { campo: string; direcao: 'asc' | 'desc' }) => void }
export interface DataTableBulkBarProps { quantidade: number; aoLimpar: () => void; children: React.ReactNode }
// ColumnMeta (declaration merging em data-table.tsx): { ocultarAbaixo?: 'md' | 'lg' | 'xl'; alinhar?: 'inicio' | 'fim'; larguraClasse?: string }
```
**form/**
```ts
export interface ControleAcessivel { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string; 'aria-required'?: boolean }
export interface CampoFormProps<T extends FieldValues, N extends FieldPath<T>> {
  control: Control<T>; name: N; rotulo: string; descricao?: string; obrigatorio?: boolean; orientacao?: 'vertical' | 'horizontal';
  children: (field: ControllerRenderProps<T, N>, controle: ControleAcessivel) => React.ReactNode;
}
export type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'>;
export interface PasswordStrengthProps { senha: string; minimo: number }        // regras: tamanho, letras, números, símbolos; barra + texto
export interface AutosizeTextareaProps extends React.ComponentProps<'textarea'> { minLinhas?: number; maxLinhas?: number }
export interface ComboboxOpcao { valor: string; rotulo: string; descricao?: string; prefixo?: React.ReactNode }
export interface ComboboxFieldProps { valor: string | null; aoMudar: (v: string | null) => void; opcoes?: ComboboxOpcao[]; buscar?: (termo: string, signal: AbortSignal) => Promise<ComboboxOpcao[]>; placeholder?: string; placeholderBusca?: string; textoVazio?: string; limpavel?: boolean; desabilitado?: boolean; id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }
export interface MultiComboboxFieldProps extends Omit<ComboboxFieldProps, 'valor' | 'aoMudar' | 'limpavel'> { valores: string[]; aoMudar: (v: string[]) => void; maxVisiveis?: number }
export interface DatePickerProps { valor: Date | null; aoMudar: (d: Date | null) => void; min?: Date; max?: Date; id?: string; desabilitado?: boolean; 'aria-invalid'?: boolean }
export interface DateTimePickerProps extends DatePickerProps { passoMinutos?: 5 | 15 | 30 }
export interface IntervaloDatas { de?: Date; ate?: Date }
export interface DateRangePickerProps { valor: IntervaloDatas; aoMudar: (v: IntervaloDatas) => void; atalhos?: boolean; id?: string }
export interface ColorFieldProps { valor: string; aoMudar: (hex: string) => void; id?: string; textoAmostra: string; sugestoes?: string[]; 'aria-invalid'?: boolean }
export interface FileDropzoneProps { aoSelecionar: (arquivos: File[]) => void; tamanhoMaximoBytes: number; tiposAceitos?: Record<string, string[]>; multiplo?: boolean; permitirColar?: boolean; desabilitado?: boolean; compacto?: boolean; rotulo?: string }
export interface UploadItem { id: string; arquivo: File; progresso: number; estado: 'pendente' | 'enviando' | 'concluido' | 'erro'; erro?: string }
export interface UploadListProps { itens: UploadItem[]; aoRemover?: (id: string) => void; aoTentarNovamente?: (id: string) => void }
export interface MarkdownEditorProps { valor: string; aoMudar: (v: string) => void; id?: string; minLinhas?: number; placeholder?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }
export interface CampoPersonalizadoInputProps { campo: CampoPersonalizado; valor: unknown; aoMudar: (v: unknown) => void; controle: ControleAcessivel }
```
**display/**
```ts
export interface ColorBadgeProps { cor: string; children: React.ReactNode; variante?: 'suave' | 'solida'; comPonto?: boolean; tamanho?: 'sm' | 'md'; className?: string; title?: string }
export interface StatusBadgeProps { status: { nome: string; cor: string; tipo: StatusTipo }; tamanho?: 'sm' | 'md' }
export interface PrioridadeBadgeProps { prioridade: { nome: string; cor: string; ordem: number }; tamanho?: 'sm' | 'md'; variante?: 'suave' | 'solida' }
export interface SlaBadgeProps { tipo: 'resposta' | 'solucao'; limite: string | null; inicio: string; concluidoEm?: string | null; compacto?: boolean }
                                                           // usa estadoSla() de lib/sla.ts e useAgora(60_000)
export interface UsuarioMin { id: number; nome: string; avatarUrl?: string | null }
export interface UserAvatarProps { usuario: UsuarioMin; tamanho?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; mostrarPresenca?: boolean; className?: string }
                                                           // xs 20, sm 24, md 32, lg 40, xl 64 px
export interface AvatarGroupProps { usuarios: UsuarioMin[]; max?: number; tamanho?: 'sm' | 'md'; mostrarPresenca?: boolean }
export interface PresenceIndicatorProps { status: PresencaStatus; tamanho?: 'sm' | 'md'; comRotulo?: boolean; className?: string }
export interface UserHoverCardProps { usuarioId: number; children: React.ReactNode }
export interface RelativeTimeProps { data: string | Date; formato?: 'relativo' | 'curto' | 'hora' | 'completo'; className?: string }  // <time dateTime title>
export interface MarkdownProps { texto: string; variante?: 'mensagem' | 'artigo'; className?: string }  // converte tokens de menção
export interface MentionChipProps { usuarioId: number; nome: string; ehVoce?: boolean }
export interface KeyValueGridProps { itens: { rotulo: string; valor: React.ReactNode; dica?: string }[]; colunas?: 1 | 2 | 3 }
export interface StatCardProps { titulo: string; valor: number | string; icone: LucideIcon; tom?: 'neutro' | 'info' | 'sucesso' | 'alerta' | 'perigo'; descricao?: string; link?: LinkProps; carregando?: boolean }
export interface ChartCardProps { titulo: string; descricao?: string; tabela: { colunas: string[]; linhas: (string | number)[][] }; acoes?: React.ReactNode; carregando?: boolean; vazio?: boolean; children: React.ReactNode }
export interface KbdShortcutProps { teclas: string[] }       // ['mod','K'] → "Ctrl K" ou "⌘ K"
export interface PodeProps { permissao: Permissao; children: React.ReactNode; senao?: React.ReactNode }
```
**theme/ e command/**
```ts
export type Tema = 'claro' | 'escuro' | 'sistema';
export interface ThemeContextValue { tema: Tema; temaEfetivo: 'claro' | 'escuro'; definirTema: (t: Tema) => void }
export type Densidade = 'confortavel' | 'compacta';
export interface DensityContextValue { densidade: Densidade; definirDensidade: (d: Densidade) => void }
export interface CommandPaletteProps { aberto: boolean; aoMudarAberto: (v: boolean) => void }
export interface AtalhosDialogProps { aberto: boolean; aoMudarAberto: (v: boolean) => void }
```
**features (principais)**
```ts
// chamados
export interface ChamadoListItemProps { chamado: ChamadoResumo; ativo: boolean; naoLido: boolean; mostrarSolicitante: boolean }
export interface VisoesPaneProps { visaoAtiva?: VisaoChamado; filtroSalvoAtivo?: number }
export interface ChamadosListaCompactaProps { filtros: ChamadoFiltros; chamadoAtivoId: number }
export interface ChamadosTableProps { filtros: ChamadoFiltros; aoMudarFiltros: (f: Partial<ChamadoFiltros>) => void; podeSelecionar: boolean }
export interface ChamadoHeaderProps { chamado: ChamadoDetalhe; aoAbrirPropriedades: () => void }
export interface QuickActionsRailProps { chamado: ChamadoDetalhe }
export interface NovoChamadoFormProps { preenchimento?: { equipamentoEtiqueta?: string; problemaId?: number } }
export interface ArtigosSugeridosProps { termo: string; aoResolver: (artigoId: number) => void }
export interface BulkActionsBarProps { ids: number[]; aoConcluir: () => void; aoLimpar: () => void }
export interface SalvarFiltroDialogProps { aberto: boolean; aoMudarAberto: (v: boolean) => void; filtros: ChamadoFiltros; filtroExistente?: FiltroSalvo }
export interface DialogDeAcaoProps { chamado: ChamadoDetalhe; aberto: boolean; aoMudarAberto: (v: boolean) => void }  // Encerrar/Encaminhar/Reabrir
export interface AgendarPopoverProps { chamado: ChamadoDetalhe }
export interface OperadorSelectProps { areaId: number; valor: number | null; aoMudar: (id: number | null) => void; id?: string }
// conversa
export interface ConversaViewProps { chamadoId: number; focoAssentamentoId?: number | 'avaliacao'; modo?: 'completo' | 'previa' }
export interface MessageBubbleProps { mensagem: Assentamento; propria: boolean; agrupada: boolean; mencionaVoce: boolean; estadoEnvio?: 'enviando' | 'enviada' | 'lida' | 'erro'; leitores?: { nome: string; lidoEm: string }[]; aoTentarNovamente?: () => void; aoDescartar?: () => void; aoCitar?: (texto: string) => void; destacar?: boolean }
export interface SystemEventProps { evento: Assentamento }
export interface DateSeparatorProps { data: string }
export interface TypingIndicatorProps { usuarios: { id: number; nome: string }[] }
export interface ReadReceiptProps { estado: 'enviando' | 'enviada' | 'lida' | 'erro'; leitores: { nome: string; lidoEm: string }[] }
export interface ComposerProps { chamadoId: number; podePrivado: boolean; desabilitado?: boolean; motivoDesabilitado?: string; citacao?: string; aoConsumirCitacao?: () => void }
export interface MentionPopoverProps { aberto: boolean; opcoes: UsuarioMin[]; indiceAtivo: number; carregando: boolean; aoEscolher: (u: UsuarioMin) => void; ancora: React.RefObject<HTMLElement | null> }
export interface NewMessagesPillProps { quantidade: number; aoClicar: () => void }
export interface AvaliacaoCardProps { chamadoId: number; avaliacao: Avaliacao | null; podeAvaliar: boolean }
export interface SolucaoCardProps { solucao: string; encerradoEm: string; operador: UsuarioMin | null }
// atividade / notificações / presença
export interface ActivityFeedProps { filtro: FiltroAtividade; itemAtivoId?: number }
export interface ActivityItemProps { item: Notificacao; ativo: boolean }
export interface ActivityFiltersProps { valor: FiltroAtividade; aoMudar: (f: FiltroAtividade) => void; contagens: Partial<Record<FiltroAtividade, number>> }
export interface ActivityPreviewProps { notificacao: Notificacao | null }
export interface NotificationItemProps { item: Notificacao; aoAbrir: (n: Notificacao) => void; compacto?: boolean }
// painel
export interface DistribuicaoBarChartProps { titulo: string; itens: { id: number; nome: string; cor?: string; total: number }[]; link?: (id: number) => LinkProps }
export interface AbertosEncerradosChartProps { serie: { data: string; abertos: number; encerrados: number }[] }
export interface SlaRadialChartProps { percentual: number; cumpridos: number; total: number }
// avisos
export interface AvisoCardProps { aviso: Aviso; compacto?: boolean }
// conhecimento / inventário / relatórios / admin / perfil
export interface ArtigoViewProps { artigo: ArtigoDetalhe }
export interface ArtigoFormProps { artigo?: ArtigoDetalhe }
export interface EquipamentoSheetProps { equipamentoId: number | null; aberto: boolean; aoMudarAberto: (v: boolean) => void }
export interface EtiquetaQrDialogProps { equipamento: { etiqueta: string; modelo?: string | null }; aberto: boolean; aoMudarAberto: (v: boolean) => void }
export interface RelatorioFiltrosProps { valor: FiltrosRelatorio; aoMudar: (v: FiltrosRelatorio) => void; campos: ('periodo' | 'area' | 'operador')[] }
export interface ExportarCsvButtonProps { href: string; rotulo?: string }
export type CampoDescritor =
  | { tipo: 'texto' | 'textarea' | 'email' | 'telefone'; nome: string; rotulo: string; obrigatorio?: boolean; max?: number; descricao?: string }
  | { tipo: 'numero'; nome: string; rotulo: string; obrigatorio?: boolean; min?: number; max?: number; sufixo?: string }
  | { tipo: 'booleano'; nome: string; rotulo: string; descricao?: string }
  | { tipo: 'cor'; nome: string; rotulo: string }
  | { tipo: 'selecao'; nome: string; rotulo: string; obrigatorio?: boolean; opcoes: { valor: string; rotulo: string }[] }
  | { tipo: 'referencia'; nome: string; rotulo: string; obrigatorio?: boolean; fonte: 'areas' | 'locais' | 'problemas' | 'tiposEquipamento' }
  | { tipo: 'multirreferencia'; nome: string; rotulo: string; fonte: 'camposPersonalizados' | 'areas' };
export interface ColunaDescritor { campo: string; rotulo: string; tipo?: 'texto' | 'numero' | 'booleano' | 'cor' | 'referencia' | 'selecao'; ocultarAbaixo?: 'md' | 'lg' }
export interface EntidadeDescritor { chave: 'areas' | 'prioridades' | 'status' | 'problemas' | 'locais' | 'tipos-equipamento'; rotulo: string; rotuloSingular: string; descricao: string; icone: LucideIcon; schema: z.ZodType; colunas: ColunaDescritor[]; campos: CampoDescritor[]; podeExcluir: boolean }
export interface EntidadePageProps { descritor: EntidadeDescritor }
export interface EntidadeSheetProps { descritor: EntidadeDescritor; registro: Record<string, unknown> | null; aberto: boolean; aoMudarAberto: (v: boolean) => void }
export interface OpcoesEditorProps { valor: string[]; aoMudar: (v: string[]) => void; id?: string }
export interface ConfiguracoesSecaoProps { id: string; titulo: string; descricao?: string; children: React.ReactNode }
export interface SenhaTemporariaDialogProps { senha: string | null; aoFechar: () => void }
export interface DoisFatoresSetupDialogProps { aberto: boolean; aoMudarAberto: (v: boolean) => void; obrigatorio?: boolean }
export interface CodigosRecuperacaoListProps { codigos: string[] }
export interface PreferenciasNotificacaoTableProps { valor: PreferenciasNotificacao; aoMudar: (v: PreferenciasNotificacao) => void; mostrarEmail: boolean; ehEquipe: boolean }
```
**lib/** (assinaturas)
- `lib/datas.ts`: `formatarData`, `formatarDataHora`, `formatarHora`, `formatarCurto(iso, agora)` (hoje: "09:41"; ontem: "Ontem"; mesmo ano: "12/10"; senão "12/10/25"), `formatarRelativo(iso, agora)` ("agora", "há 5 min", "há 2 h", "ontem", "há 3 dias", depois "dd/MM/yyyy"), `formatarDuracao(min)` ("45 min", "3 h 20 min", "2 d 4 h"), `rotuloSeparador(iso, agora)`.
- `lib/sla.ts`: `estadoSla({limite, inicio, concluidoEm, agora}) => { estado: 'sem_sla' | 'no_prazo' | 'em_risco' | 'vencido' | 'cumprido' | 'violado'; restanteMin: number | null; rotulo: string }`. "Em risco" quando restam ≤ max(60 min, 20% da janela).
- `lib/mencoes.ts`: `serializarMencoes(texto, mapa: Map<string, number>)` (nomes mais longos primeiro), `extrairIdsMencao(texto)`, `mencoesParaMarkdown(texto)` (troca `@[Nome](usuario:ID)` por `[@Nome](usuario:ID)`), `paraTextoVisivel(texto)`.
- `lib/storage.ts`: `ler<T>(chave, padrao)`, `gravar(chave, valor)`, `remover(chave)`, com prefixo `vinimon:` e `try/catch`.

---

## 6. Decomposição em tarefas do front para os agentes Haiku

Regras para todas as tarefas:
- Ao final de cada uma, rodar `pnpm --filter @vinimon/web typecheck && pnpm --filter @vinimon/web lint && pnpm --filter @vinimon/web test --run`.
- Uma tarefa = um commit.
- Endpoints da seção 4.9 que ainda não existam na API: criar o `api.ts` contra o contrato e testar com o servidor de desenvolvimento quando a tarefa da API estiver pronta.
- Tarefas marcadas "(dep. API X)" esperam a tarefa correspondente da API.

| ID | Entrega | Verificação |
|---|---|---|
| W01 | Criar o pacote `apps/web` (package.json com as versões da seção 0, `vite.config.ts`, tsconfigs, `index.html`, `public/theme-init.js`, `src/main.tsx` mínimo) | `pnpm --filter @vinimon/web build` passa; `grep -c theme-init index.html` dá 1 |
| W02 | `src/styles/globals.css` literal (1.2); importar fontes e CSS em `main.tsx` | build passa; uma página de teste mostra `bg-frame`/`text-primary`; a classe `dark` no html muda as cores |
| W03 | `components.json` e `lib/utils.ts` à mão; rodar `shadcn add` (5.1) | todos os 37 arquivos existem em `src/components/ui`; falhas listadas no commit |
| W04 | Ajustes da seção 1.12 | os 3 greps da 1.12 não retornam nada; build passa |
| W05 | `lib/cores.ts` (código 1.7) e `cores.test.ts` | os testes (a) a (d) passam |
| W06 | `lib/api-client.ts` (ApiError, CSRF, query, upload XHR) e testes com fetch simulado | testes de 200, 401, 422 (fieldErrors), rede e CSRF passam |
| W07 | `lib/query-client.ts`, `router.tsx`, `routes/__root.tsx`, `_app.tsx` (sem guarda), rotas vazias da árvore 4.1 com títulos | `pnpm dev` abre todas as rotas; `routeTree.gen.ts` gerado |
| W08 | `ThemeProvider`, `DensityProvider` e hooks `use-media-query`, `use-mobile`, `use-prefers-reduced-motion` | teste: `definirTema('escuro')` põe `dark` no html e grava em localStorage |
| W09 | `lib/datas.ts`, `lib/sla.ts`, `lib/mencoes.ts`, `lib/storage.ts`, `lib/rotulos.ts` com testes | testes de bordas (ontem, virada de ano, em risco, violado, nomes repetidos) passam |
| W10 | display/: ColorBadge, StatusBadge, PrioridadeBadge, SlaBadge, UserAvatar, AvatarGroup, PresenceIndicator, RelativeTime, KbdShortcut, KeyValueGrid, StatCard, Pode | teste: ColorBadge define `--b-bg`/`--b-fg` e `contraste()` ≥ 4,5; PresenceIndicator tem texto sr-only |
| W11 | feedback/: EmptyState, ErrorState, PageSkeleton, ConfirmDialog, NotFoundState; ligar `default*Component` no router | rota inexistente mostra NotFound; ErrorState mostra o requestId |
| W12 | form/ parte 1: CampoForm, `useZodForm`, `aplicarErrosDoServidor`, PasswordInput, PasswordStrength, AutosizeTextarea | teste: erro de campo gera `aria-invalid` e `aria-describedby` apontando para o erro |
| W13 | form/ parte 2: ComboboxField, MultiComboboxField, DatePicker, DateTimePicker, DateRangePicker, ColorField | teste de teclado no Combobox (abrir, ↓, Enter) |
| W14 | form/ parte 3: FileDropzone, UploadList, MarkdownEditor, `display/markdown.tsx`, MentionChip | teste: markdown com `<script>` não gera elemento script; token de menção vira chip |
| W15 | data/: DataTable e subcomponentes (react-table v8) | teste: seleção, `aria-sort`, ocultar coluna |
| W16 | auth: api, queries, guards; rotas `login` (credenciais + 2FA), `trocar-senha`, `configurar-2fa`; guarda no `_app`; tratamento global de 401 (dep. API auth) | e2e: admin entra; usuário com troca obrigatória é redirecionado; `?redirect=//x` é ignorado |
| W17 | Shell: AppShell, AppBar, TopBar, TwoPane, PaneHeader, ListPaneSection, ListPaneNavItem, RouteTabs, MobileNav, SkipLink, `useFocoAoNavegar` | axe sem violações no shell; em 375 px aparece a barra inferior; Tab inicial foca o SkipLink |
| W18 | meta: api e queries; `_app/index.tsx` redireciona por perfil; `sem-permissao`; app bar filtrada por permissão | usuário nível 3 não vê Inventário, Relatórios e Admin; `/admin` redireciona para sem-permissão |
| W19 | Socket: `lib/socket.ts`, `useSocketEvento`, `useSincronizacaoTempoReal`, presença em cache, OfflineIndicator (dep. API realtime) | derrubar a API por 6 s mostra "Reconectando..." e o aviso some ao voltar |
| W20 | UserMenu (status, tema, densidade, atalhos, sair) e `useOcioso` (5 min) | trocar o status reflete em outra aba em menos de 2 s; o tema persiste após recarregar |
| W21 | NotificationBell, contagem na app bar, `desktop.ts`, título da aba, DesktopNotificationsPrompt (dep. API notificações) | uma menção gera badge, entrada no popover e notificação do sistema com a aba oculta |
| W22 | CommandPalette, `useAtalhos`, AtalhosDialog, recentes | Ctrl+K abre a paleta; "125" mostra "Abrir #125"; `g c` navega; atalho ignorado com foco em input |
| W23 | Chamados: filtros, api, queries, `chamados/route.tsx`, VisoesPane com contagens (dep. API chamados) | trocar de visão atualiza a URL e a contagem |
| W24 | ChamadosTable: colunas, filtros facetados, busca, período, SLA, ordenação, paginação, colunas persistidas, cartões no mobile | e2e: filtrar por status, ordenar por #, mudar página; recarregar mantém tudo |
| W25 | Seleção em massa + BulkActionsBar + diálogo de falhas parciais | e2e: atribuir 2 chamados; o toast mostra a contagem |
| W26 | Filtros salvos (dialog, lista, renomear, excluir, compartilhar) (dep. API) | o filtro salvo aparece em outra sessão do mesmo usuário |
| W27 | Exportar CSV (link) | o download começa com o nome `chamados-AAAA-MM-DD.csv` |
| W28 | NovoChamadoForm: campos, combobox, prioridade, campos personalizados dinâmicos | e2e: o tipo "Impressora" mostra os campos extras; obrigatório vazio bloqueia o envio |
| W29 | ArtigosSugeridos, rascunho automático, upload pós-criação com progresso, `?equipamento=` | e2e: digitar "impressora" mostra sugestão; recarregar restaura o rascunho |
| W30 | Detalhe: `$chamadoId/route.tsx` com loader, ChamadoHeader, RouteTabs, QuickActionsRail e Sheet, diálogos (Encerrar, Encaminhar, Reabrir, Agendar), Assumir | e2e: assumir, mudar status, encerrar com solução, reabrir |
| W31 | ConversaView: lista, agrupamento, separadores, SystemEvent, privado, `?foco=`, carregar anteriores, pílula de novas | e2e: link `?foco=` centraliza e destaca; anteriores preservam a rolagem |
| W32 | Composer: autosize, Enter/Shift+Enter conforme preferência, privado, envio otimista com `clienteId`, falha e reenvio, anexos (botão, arrastar, colar) | teste: Enter envia e Shift+Enter quebra; e2e: com a API derrubada, a bolha mostra "Não enviada" |
| W33 | Menções: MentionPopover, mapa nome→id, serialização, destaque "mencionou você" | e2e: `@Ope` + Enter + enviar gera notificação de menção para o operador |
| W34 | Tempo real no chamado: sala, digitando, leituras, eco sem duplicar | e2e com 2 contextos: "está digitando" aparece; "Lida" aparece em ≤ 2 s |
| W35 | Abas Detalhes, Anexos (preview, baixar, excluir) e Histórico | axe sem violações nas 3 abas |
| W36 | Aba Tempo: cronômetro persistido, lançamento manual, total | o cronômetro continua após recarregar |
| W37 | SolucaoCard e AvaliacaoCard | e2e: o solicitante avalia com 4 estrelas pelo teclado |
| W38 | Atividade: feed infinito, filtros, marcar como lido ou não lido, prévia, j/k, AvisosStrip | clicar no item zera o ponto e a contagem do sino diminui |
| W39 | Painel: KPIs, 5 gráficos, tabela de SLA, "Ver como tabela", visão do nível 3 | axe sem violações; o toggle mostra a `<table>` |
| W40 | Avisos: `/avisos`, AvisoBanner, card no painel, dispensar | um aviso urgente aparece como banner e não volta depois de dispensado |
| W41 | Conhecimento: painel de categorias, lista com busca e realce, visualização do artigo, feedback | busca sem resultado mostra o EmptyState com "Abrir chamado" |
| W42 | Conhecimento: editor (operadores), excluir | artigo "Só equipe" invisível para o nível 3 |
| W43 | Inventário: TiposPane, tabela, filtros, EquipamentoSheet | e2e: criar equipamento e editar local |
| W44 | Inventário: detalhe com abas e EtiquetaQrDialog com impressão | o QR aponta para `/chamados/novo?equipamento=` |
| W45 | Relatórios: painel, filtros na URL, 9 relatórios (gráfico + tabela), CSV, CSS de impressão | prévia de impressão sem app bar e sem painéis |
| W46 | Admin: layout, `entidades.ts` (6 descritores), EntidadePage e EntidadeSheet genéricos, ColorField com prévia | e2e: criar prioridade com cor `#ffff00`; o badge mostra contraste ≥ 4,5 |
| W47 | Admin usuários: página própria, SenhaTemporariaDialog, desativar 2FA, encerrar sessões | o usuário redefinido é forçado a trocar a senha no login |
| W48 | Admin campos personalizados (editor, OpcoesEditor, prévia) | o campo criado aparece no Novo chamado do tipo vinculado |
| W49 | Admin mural de avisos e auditoria | a auditoria lista a criação do aviso |
| W50 | Configurações (4 seções) | salvar "Permitir anexos = não" esconde o dropzone no Novo chamado |
| W51 | Perfil: Conta (avatar), Aparência, Notificações (matriz + permissão do navegador + teste) | a preferência de desktop desligada bloqueia a notificação do tipo |
| W52 | Perfil: Segurança (senha, 2FA com QR, OTP e códigos), Sessões | e2e: ativar 2FA; o login seguinte pede o código |
| W53 | Qualidade: eslint (jsx-a11y, react-hooks, `no-restricted-syntax`/`imports` da seção 4.2), Playwright e axe em todas as rotas (claro, escuro, compacto) | `pnpm --filter @vinimon/web e2e` sem violações serious/critical |
| W54 | Desempenho: conferir o orçamento da seção 4.8 e lazy de recharts, markdown e qrcode | tamanhos gzip na saída do build dentro do limite |
| W14b | (fase do e-mail, dep. API) `/recuperar-senha` e `/redefinir-senha?token=` com AuthLayout | e2e com o e-mail de teste capturado |

---

### Arquivos críticos para a implementação
Estes caminhos ainda não existem; serão criados pelas tarefas W01–W34.
- `/home/user/vinimon/apps/web/src/styles/globals.css`
- `/home/user/vinimon/apps/web/src/lib/cores.ts`
- `/home/user/vinimon/apps/web/src/routes/_app.tsx` (e a árvore `/home/user/vinimon/apps/web/src/routes/_app/chamados/$chamadoId/route.tsx`)
- `/home/user/vinimon/apps/web/src/features/conversa/components/conversa-view.tsx`
- `/home/user/vinimon/public/app.js` (referência do comportamento atual a preservar: foco/destaque, sugestão de FAQ, escape de CSV)

Fontes consultadas:
- [shadcn/ui — 2025-10 new components](https://ui.shadcn.com/docs/changelog/2025-10-new-components)
- [shadcn Spinner (radix)](https://ui.shadcn.com/docs/components/radix/spinner)
- [shadcn Kbd (radix)](https://ui.shadcn.com/docs/components/radix/kbd)
- [Shadcnblocks — component styles (Vega/Nova/...)](https://www.shadcnblocks.com/blog/shadcn-component-styles-vega-nova-maia-lyra-mira)
- [Vercel Academy — components.json](https://vercel.com/academy/shadcn-ui/components-json)
- [mcpservers.org — shadcn skill (flags do CLI)](https://mcpservers.org/agent-skills/vercel/vercel-plugin/shadcn-2)
- Demais versões, flags do CLI e nomes de ícones: registro do npm (`npm view` e inspeção dos tarballs `shadcn@4.22.1`, `lucide-react@1.61.0` e `react-dropzone@20.1.4`).
