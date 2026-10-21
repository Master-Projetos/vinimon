> Parte A (fundamentos), §6. Decisão fechada: não reabrir. Índice e regras de leitura em `docs/plano/README.md`.

## 6. Design system e telas

### 6.1 Tokens: `apps/web/src/styles/globals.css` (copiar literalmente)

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
  --primary: oklch(0.52 0.19 268);
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.955 0.012 268);
  --secondary-foreground: oklch(0.30 0.05 268);
  --muted: oklch(0.962 0.005 268);
  --muted-foreground: oklch(0.50 0.016 268);
  --accent: oklch(0.952 0.022 268);
  --accent-foreground: oklch(0.36 0.12 268);
  --destructive: oklch(0.55 0.21 25);
  --destructive-solid: oklch(0.55 0.21 25);
  --border: oklch(0.91 0.006 268);
  --input: oklch(0.64 0.012 268);
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
  --frame: oklch(0.955 0.005 268);
  --frame-foreground: oklch(0.45 0.015 268);
  --pane: oklch(0.982 0.003 268);
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
  --appbar-w: 4.25rem;
  --topbar-h: 3rem;
  --listpane-w: 20rem;
  --rail-w: 18rem;
  --bottomnav-h: 3.5rem;
  --row-h: 2.5rem;
  --item-py: 0.625rem;
  --msg-gap: 0.75rem;
  --pane-px: 1rem;
}
[data-densidade="compacta"] { --row-h: 2rem; --item-py: 0.375rem; --msg-gap: 0.25rem; --pane-px: 0.75rem; }

.dark {
  color-scheme: dark;
  --background: oklch(0.205 0.006 268);
  --foreground: oklch(0.96 0.003 268);
  --card: oklch(0.235 0.007 268);
  --card-foreground: oklch(0.96 0.003 268);
  --popover: oklch(0.25 0.008 268);
  --popover-foreground: oklch(0.96 0.003 268);
  --primary: oklch(0.72 0.13 272);
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

**Contraste verificado** (WCAG):
- texto ≥ 4,99 no claro e ≥ 5,43 no escuro;
- bordas de campo (`--input`), anel de foco, gráficos e presença ≥ 3:1;
- o par `border` (1,3:1) é decorativo.

**Tipografia:**
- Inter Variable e JetBrains Mono Variable, importadas em `main.tsx`; corpo em 14 px;
- `text-title` para o H1 do conteúdo; `text-pane-title`; `text-label uppercase text-muted-foreground` para seções; `text-appbar`;
- número do chamado e etiqueta em `font-mono text-xs`; números com `tabular-nums`.

**Raios:** 4, 6, 8 e 12 px; badges `rounded-full`. **Sombras:** `xs` (item ativo), `sm` (card), `lg` (popover), `xl` (dialog e sheet).

**Densidade:** `data-densidade` no `<html>`. Padrão COMPACTA para a equipe e CONFORTAVEL para USUARIO. Fica salva no servidor (`Usuario.densidade`) e espelhada em `vinimon:densidade`.

**`public/theme-init.js`** (carregado no `<head>` antes do bundle):

```js
(function () {
  window.__zod_globalConfig = { jitless: true }; // Zod lê este objeto ao carregar: sem new Function sob a CSP
  try {
    var t = localStorage.getItem('vinimon:tema') || 'sistema';
    var d = localStorage.getItem('vinimon:densidade');
    var escuro = t === 'escuro' || (t === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches);
    var r = document.documentElement;
    r.classList.toggle('dark', escuro);
    r.style.colorScheme = escuro ? 'dark' : 'light';
    if (d === 'compacta' || d === 'confortavel') r.dataset.densidade = d;
  } catch (e) {}
})();
```

`index.html`: `<html lang="pt-BR">`, meta `viewport` e `color-scheme`, `<script src="/theme-init.js"></script>`, `<div id="root">` e `<script type="module" src="/src/main.tsx">`. Nenhum script inline.

**Cores configuráveis com AA garantido** (`apps/web/src/lib/cores.ts`; o `ColorBadge` define `--b-bg`, `--b-fg`, `--b-borda`, `--b-ponto` e as versões `-d`):

```ts
type Oklch = { l: number; c: number; h: number }
export type ModoTema = 'claro' | 'escuro'
export interface CoresBadge { fundo: string; texto: string; borda: string; ponto: string }
type Rgb = [number, number, number]

const SUPERFICIE_CLARA_MAIS_ESCURA = '#f8f9fb'
const SUPERFICIE_ESCURA_MAIS_CLARA = '#202226'
const paraLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const paraGama = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

export function hexParaRgb(hex: string): Rgb {
  const digitos = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1]
  if (!digitos) throw new Error(`Cor inválida: ${hex}`)
  const n = Number.parseInt(digitos, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
function rgbParaHex(rgb: readonly number[]): string {
  return `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`
}
export function rgbParaOklch(rgb: Rgb): Oklch {
  const r = paraLinear(rgb[0])
  const g = paraLinear(rgb[1])
  const b = paraLinear(rgb[2])
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(A, B)
  let h = (Math.atan2(B, A) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c, h: c < 1e-4 ? 0 : h }
}
function oklchParaRgbLinear({ l, c, h }: Oklch): Rgb {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ]
}
const noGamut = (v: readonly number[]) => v.every((x) => x >= -1e-6 && x <= 1 + 1e-6)
export function oklchParaHex(o: Oklch): string {
  const l = Math.min(1, Math.max(0, o.l))
  let c = o.c
  if (!noGamut(oklchParaRgbLinear({ l, c, h: o.h }))) {
    let lo = 0
    let hi = c
    for (let i = 0; i < 20; i++) {
      const meio = (lo + hi) / 2
      if (noGamut(oklchParaRgbLinear({ l, c: meio, h: o.h }))) lo = meio
      else hi = meio
    }
    c = lo
  }
  return rgbParaHex(oklchParaRgbLinear({ l, c, h: o.h }).map((v) => paraGama(Math.min(1, Math.max(0, v)))))
}
export function luminancia(hex: string): number {
  const rgb = hexParaRgb(hex)
  return 0.2126 * paraLinear(rgb[0]) + 0.7152 * paraLinear(rgb[1]) + 0.0722 * paraLinear(rgb[2])
}
export function contraste(a: string, b: string): number {
  const x = luminancia(a)
  const y = luminancia(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
function ajustar(o: Oklch, fundo: string, minimo: number, direcao: -1 | 1): string {
  const cur = { ...o }
  for (let i = 0; i < 120; i++) {
    const hex = oklchParaHex(cur)
    if (contraste(hex, fundo) >= minimo) return hex
    cur.l = Math.min(1, Math.max(0, cur.l + direcao * 0.01))
  }
  return direcao < 0 ? '#000000' : '#ffffff'
}
export function coresDeBadge(hex: string, modo: ModoTema): CoresBadge {
  const base = rgbParaOklch(hexParaRgb(hex))
  const { c, h } = base
  if (modo === 'claro') {
    const fundo = oklchParaHex({ l: 0.955, c: Math.min(c * 0.3, 0.04), h })
    return {
      fundo,
      texto: ajustar({ l: Math.min(base.l, 0.5), c: Math.min(c, 0.16), h }, fundo, 4.5, -1),
      borda: oklchParaHex({ l: 0.86, c: Math.min(c * 0.5, 0.08), h }),
      ponto: ajustar(base, fundo, 3, -1),
    }
  }
  const fundo = oklchParaHex({ l: 0.31, c: Math.min(c * 0.35, 0.06), h })
  return {
    fundo,
    texto: ajustar({ l: Math.max(base.l, 0.82), c: Math.min(c, 0.12), h }, fundo, 4.5, 1),
    borda: oklchParaHex({ l: 0.45, c: Math.min(c * 0.5, 0.08), h }),
    ponto: ajustar(base, fundo, 3, 1),
  }
}
export function corSolida(hex: string): { fundo: string; texto: string } {
  const base = rgbParaOklch(hexParaRgb(hex))
  const branco = '#ffffff'
  const preto = '#111318'
  const a = ajustar(base, branco, 4.5, -1)
  const b = ajustar(base, preto, 4.5, 1)
  const da = Math.abs(rgbParaOklch(hexParaRgb(a)).l - base.l)
  const db = Math.abs(rgbParaOklch(hexParaRgb(b)).l - base.l)
  return da <= db ? { fundo: a, texto: branco } : { fundo: b, texto: preto }
}
export function corDeGrafico(hex: string, modo: ModoTema): string {
  const base = rgbParaOklch(hexParaRgb(hex))
  return modo === 'claro' ? ajustar(base, SUPERFICIE_CLARA_MAIS_ESCURA, 3, -1) : ajustar(base, SUPERFICIE_ESCURA_MAIS_CLARA, 3, 1)
}
const cache = new Map<string, { claro: CoresBadge; escuro: CoresBadge; solida: { fundo: string; texto: string } }>()
export function obterCores(hex: string) {
  const k = hex.toLowerCase()
  let v = cache.get(k)
  if (!v) {
    v = { claro: coresDeBadge(k, 'claro'), escuro: coresDeBadge(k, 'escuro'), solida: corSolida(k) }
    cache.set(k, v)
  }
  return v
}
```

Testes de `cores.test.ts`:
- 5.000 cores com semente fixa: texto ≥ 4,5 nos dois modos;
- variante sólida ≥ 4,5;
- `corDeGrafico` ≥ 3 contra `#ffffff`, `#f8f9fb`, `#1d1e21` e `#202226`;
- hex inválido lança erro.

Avatar sem foto: iniciais com cor `['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#db2777','#7c3aed','#475569'][id % 8]`, renderizada via `coresDeBadge`.

### 6.2 Layout estilo Teams

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [V] Vinimon · Minha Empresa  [Q Pesquisar chamados, artigos, equipamentos… Ctrl K] [sino 3](OP•)│ TopBar h-12 bg-frame
├──────┬──────────────────────┬───────────────────────────────────────────┬────────────┤
│Ativid│ Chamados      [+][…] │ #125 Impressora não imprime                │PROPRIEDADES│
│Chamad│ VISÕES               │ [Aguardando][Alta][Resolve em 2 h] (AS•)   │ Status  [v]│
│Painel│ > Minha fila      12 │ Conversa | Detalhes | Anexos 2 | Histórico │ Prioridade │
│ Base │   Fila aberta      4 │  … bolhas, eventos de sistema, digitando … │ [Assumir]  │
│Invent│   Minha área      31 │ ┌ Escreva… use @ para mencionar ────────┐ │ [Concluir] │
│Relat │   Aguardando valid.  │ │ [Interno][Clipe][@]          [Enviar] │ │PARTICIPANT.│
│Admin │                      │ └───────────────────────────────────────┘ │            │
└──────┴──────────────────────┴───────────────────────────────────────────┴────────────┘
 AppBar  ListPane w-80 bg-pane  Conteúdo bg-background rounded-tl-xl        Trilho w-72 (xl+)
```

**Shell:**
- `grid h-dvh grid-rows-[var(--topbar-h)_1fr] md:grid-cols-[var(--appbar-w)_1fr]`;
- a área de trabalho é `rounded-tl-xl border-l border-t bg-background`, com o painel de lista em `bg-pane border-r`.

**Breakpoints:**

| Faixa | Comportamento |
|---|---|
| < 768 | Uma coluna (lista ou conteúdo), `MobileNav` inferior (Atividade, Chamados, Painel, Base, Mais) e FAB "Novo chamado" |
| 768–1023 | App bar; lista com `w-72`, escondida no detalhe e aberta por `Sheet` |
| 1024–1279 | Lista `w-80` recolhível |
| ≥ 1280 | Trilho fixo `w-72` |

Abaixo de xl, o trilho vira `Sheet side="right"`.

**App bar:** itens de 56 px, ícone `size-6` e rótulo `text-appbar`. O ativo fica em `text-primary` com barra de 3×20 px e `aria-current="page"`. Contador em `bg-destructive-solid` ("99+" acima de 99). Itens:
- Atividade `Bell`;
- Chamados `Ticket`;
- Painel `LayoutDashboard`;
- Base `BookOpenText`;
- Inventário `Monitor` (`inventario.ver`);
- Relatórios `ChartColumn` (`relatorio.ver`);
- Admin `Settings` (`cadastro.gerenciar`);
- no rodapé, Ajuda `LifeBuoy` (abre o diálogo de atalhos).

**Top bar:**
- marca;
- `BuscaGlobalTrigger` (abre a `CommandPalette`);
- `OfflineIndicator`, quando o socket está caído há mais de 5 s;
- `NotificationBell` (Popover);
- `UserMenu`: status (Disponível, Ocupado, Ausente, Redefinir), Meu perfil, Tema, Densidade, Atalhos, Sair.

**Atalhos:**
- Ctrl/⌘ K;
- Ctrl/⌘ / ou `?`;
- `g` + `a`/`c`/`p`/`b`/`i`/`r`/`d`;
- `c` (novo chamado);
- `/` (busca do painel);
- `j`/`k` (próximo e anterior na lista);
- `r` (foco no compositor);
- Enter envia e Shift+Enter quebra linha (com `enviarComEnter=false`, Ctrl+Enter envia);
- Esc.

Atalhos de letra são ignorados com foco em campo de texto.

**Acessibilidade:**
- SkipLink; landmarks (`nav`, `header`, `aside`, `main#conteudo`);
- foco vai para o `h1` ao mudar de rota (`useFocoAoNavegar`);
- cor nunca é o único indicador (status e prioridade com texto, SLA com ícone, presença com glifo e `sr-only`, interno com `Lock` e o rótulo "Interno");
- conversa em `role="log"`, cada mensagem num `<article>`, digitando em `aria-live="polite"`;
- alvos ≥ 24 px;
- axe sem violações *serious* ou *critical*.

**Movimento:** 100, 200 e 250 ms com `ease-fluent`; `animate-mensagem-entrada`, `animate-destaque` (`?foco=`), `animate-digitando`; respeita `prefers-reduced-motion`.

### 6.3 Telas do MVP

Convenções de estado em todas as telas:
- **carregando:** `Skeleton` no formato do conteúdo (`defaultPendingMs: 150`, `defaultPendingMinMs: 300`);
- **vazio:** `EmptyState` (sobre o `Empty` do shadcn);
- **erro:** `ErrorState` com "Tentar novamente" e o `requestId` copiável;
- toasts só para mutações.

1. **`/login`, `/trocar-senha`, `/configurar-2fa`**
   - **Login:** card com Login e Senha (botão de mostrar), aviso de Caps Lock e erro genérico. 429 mostra contagem regressiva.
   - **Etapa 2FA:** `InputOTP` com 6 dígitos ou código de recuperação.
   - **Troca de senha:** senha atual, nova e confirmação, com `PasswordStrength` (zxcvbn sob demanda).
   - **Configurar 2FA:** QR (`QRCodeSVG`), chave com botão copiar, OTP, 10 códigos com "Copiar", "Baixar .txt" e "Guardei meus códigos".
   - **Guardas:** o estado da sessão decide a rota. `redirect` validado por S79.
2. **Shell** (seção 6.2), com `CommandPalette`:
   - "Abrir #N";
   - grupos Chamados, Base, Ativos e Pessoas (debounce de 200 ms);
   - Ir para; Ações (abrir chamado, tema, status de presença, densidade, ativar notificações);
   - Recentes (`vinimon:u<id>:recentes`).
3. **`/atividade?filtro=&item=`**
   - Filtros (`ToggleGroup`): Tudo, Não lidas, Menções, Atribuições, SLA.
   - Cada item mostra avatar com presença e mini-ícone, `textoNotificacao`, trecho, hora e ponto de não lida. Menu: marcar como lida ou não lida, deixar de seguir.
   - À direita, a prévia da conversa (`ConversaView modo="previa"` com foco).
   - `DesktopNotificationsPrompt`. `j`/`k` navegam. Lista infinita por cursor.
   - Vazio: "Tudo em dia".
4. **`/chamados`**
   - **VisoesPane:** visões da seção 3.6 com contagens (`GET /chamados/contagens`, `staleTime: 30_000`). `fila:atualizada` invalida `chamadoChaves.listas()` com debounce de 1 s e `chamadoChaves.contagens()` com throttle de 10 s, sempre com `refetchType: 'active'`.
   - **ChamadosTable** (react-table v8, `manualPagination`):
     - colunas: seleção, #, assunto (ponto de não lido, selo "Novo" até 10 min, clipe de anexos, ícone de SLA vencido, última interação no `title`), solicitante, área, problema, prioridade, status, operador, SLA, atualização;
     - visibilidade das colunas em `vinimon:chamados:colunas:v1`;
     - filtros facetados (Popover + Command), período, busca com debounce de 300 ms, ordenação no servidor;
     - CSV via link `GET /chamados/exportar` (nome `chamados-AAAA-MM-DD.csv`).
   - **Mobile:** cartões `ChamadoListItem`.
   - Vazio com e sem filtros.
5. **`/chamados/novo?equipamento=&problema=`**
   - "Abrir em nome de": combobox `GET /usuarios/busca`, só para a equipe.
   - Tipo de problema primeiro (com descrição e artigos visíveis); depois a área (só para a equipe, entre as áreas do tipo).
   - Assunto (contador), descrição em Markdown, prioridade (`RadioGroup` em pílulas), departamento, ativo (combobox por etiqueta).
   - Painel **Reincidência**: os 10 últimos chamados do ativo, mais os do mesmo solicitante e tipo nos últimos 30 dias.
   - Contato, e-mail de contato e telefone pré-preenchidos. Canal e tags só para a equipe.
   - `FileDropzone` (arrastar e colar), escondido se os anexos estiverem desligados.
   - Painel "Isto pode resolver" (`GET /artigos/sugestoes`, debounce de 400 ms, ≥ 4 caracteres).
   - Rascunho em `vinimon:u<id>:rascunho:novo-chamado` (apagado no logout por `limparDadosDoUsuario()`).
   - Envio: cria o chamado, sobe os anexos em sequência com progresso e mostra o toast "Chamado #N aberto".
6. **`/chamados/$chamadoId`** (layout com abas)
   - **Cabeçalho:** número em mono, assunto, badges de status, prioridade e SLA, `AvatarGroup` (solicitante, operador, participantes) com presença, botão `Bell`/`BellOff` "Seguir"/"Deixar de seguir" conforme `detalhe.seguindo` (chama `chamadosApi.seguir`/`deixarDeSeguir` e atualiza o cache do detalhe), copiar link, imprimir, propriedades.
   - **Abas:** Conversa (index), Detalhes, Anexos, Histórico.
   - **Trilho:** propriedades (status, prioridade, operador com `OperadorSelect`, que mostra `PresenceIndicator` em cada opção, área, tipo, departamento, ativo, tags, agendar) e ações conforme a seção 3.5 (Assumir, Encaminhar, Concluir, Reabrir, Cancelar), em `Dialog` com motivo ou justificativa quando a regra pede. Participantes com `HoverCard`.
   - **Conversa:**
     - **Mensagens:** card da descrição inicial; eventos de sistema centralizados; bolhas (as próprias à direita em `bg-bubble-own`); agrupamento por autor em até 5 min; separadores de data. Avatar de cada autor com `UserAvatar mostrarPresenca`; os ids dos autores visíveis passam por `usePresenca(ids)` uma vez por render da lista.
     - **Destaques:** menção a mim com `bg-mention` e borda primária; interno em `bg-private` com `border-l-[3px] border-private-border` e "Interno · visível só para a equipe".
     - **Envio otimista:** `clienteId`; estados Clock → Check → CheckCheck ("Visto por …"); em erro, "Não enviada. Tentar novamente / Descartar".
     - **Rolagem e leitura:** pílula "N novas mensagens"; "Carregar anteriores" (cursor) preservando a rolagem; leitura quando o fim está visível, a aba visível e com debounce de 1 s.
     - **Digitação:** throttle de 3 s, para depois de 5 s parado, expira em 6 s.
     - **Compositor:** `AutosizeTextarea`, menções com `@` (Popover + Command, `GET mencionaveis`), Toggle "Interno" (só equipe), anexos: botão `Paperclip`, arrastar sobre a conversa e colar imagem anexam ao comentário (primeiro o POST do comentário, depois `enviarArquivo` com `assentamentoId` e `interno` iguais aos do comentário, mostrando o progresso na bolha). O anexar some quando `anexos.habilitados=false`.
     - **Chamado concluído:** `SolucaoCard` e `ValidacaoCard` para o solicitante (4 opções: Ótimo `Laugh`, Bom `Smile`, Regular `Meh`, Ruim `Frown`, num `RadioGroup` navegável pelo teclado, mais comentário; ou "Não resolveu", com motivo obrigatório).
     - **Chamado encerrado:** barra "Encerrado em … [Reabrir]".
   - **Detalhes:** `KeyValueGrid` com solicitante, "Aberto por X em nome de Y", classificação, prazos de SLA (`Progress` com estado e texto), datas, avaliação e rejeições.
   - **Anexos:** grade de cards (prévia só para imagens png, jpeg, gif e webp, com `<img src="/api/v1/anexos/:id" loading="lazy">` no `AnexoPreviewDialog`; PDF e demais tipos não têm prévia, só o botão "Baixar"; sem iframe, embed nem object; excluir só ADMIN).
   - **Histórico:** linha do tempo dos `ChamadoEvento` com filtro (Tudo, Status, Atribuição, SLA, Anexos). O solicitante não vê eventos internos.
7. **`/chamados/$chamadoId/imprimir`:** layout fixo (dados, descrição, comentários **públicos**, solução e avaliação) com `data-print`.
8. **`/painel?periodo=&area=&modo=`**
   - **StatCards clicáveis:** abertos, fila aberta sem responsável, minha fila, abertos hoje, concluídos hoje, SLA vencido, SLA em risco, aguardando validação.
   - **Gráficos** (Recharts via shadcn Chart, com "Ver como tabela"): abertos × encerrados (4 meses), em aberto por status, por prioridade, por área, avaliações do mês.
   - Tabela "SLA mais próximo do vencimento".
   - USUARIO vê uma versão reduzida.
9. **`/conhecimento`, `/conhecimento/$id`, `/novo`, `/$id/editar`**
   - Painel de categorias; busca com destaque; artigo em `.markdown-artigo`; "Foi útil?" (voto); "Abrir chamado" com o problema.
   - Editor (só equipe): título, categoria, tipos de problema (multiseleção), visibilidade, situação, conteúdo com Escrever/Visualizar.
10. **`/inventario`, `/inventario/$id`**
    - Painel de tipos; tabela (etiqueta, tipo, modelo, série, departamento, responsável, situação, nº de chamados).
    - `AtivoSheet` para criar e editar.
    - Detalhe com abas Dados e Chamados; `EtiquetaQrDialog` (QR para `/chamados/novo?equipamento=<etiqueta>`, impressão 50×30 mm).
    - Cores das situações:

| Situação | Token |
|---|---|
| Em uso | success-soft |
| Em estoque | info-soft |
| Em manutenção | warning-soft |
| Baixado | muted |

11. **`/relatorios/$relatorio`:** visao-geral, por-status, por-area, por-problema, por-operador, por-solicitante, sla, avaliacoes. Filtros na URL, KPIs, gráfico, tabela, CSV e impressão.
12. **`/admin/*`** (painel de navegação):
    - **Cadastros:** usuarios, areas, unidades, departamentos, prioridades, status, problemas, canais, tags, jornadas, feriados, tipos-ativo, categorias-artigo. Cada um com tabela + `Sheet` de edição, copiado do exemplo canônico.
    - **Campos de cor:** `ColorField` com prévia clara e escura e a razão de contraste.
    - **Usuários:** redefinir senha (`SenhaTemporariaDialog`), resetar 2FA (pede a senha do admin), encerrar sessões, desbloquear login, áreas secundárias.
    - **configuracoes:** seções Geral, Sessão, Chamados, Anexos e SLA, cada uma com o próprio "Salvar".
    - **auditoria:** tabela somente leitura com o diff em `<pre>`.
13. **`/perfil`, `/perfil/aparencia`, `/perfil/notificacoes`, `/perfil/seguranca`, `/perfil/sessoes`**
    - Conta (nome, e-mail, telefone; login e perfil só leitura).
    - Aparência (tema em 3 cartões, densidade, "Enter envia").
    - Notificações: estado da permissão do navegador com "Ativar" e "Testar", matriz tipo × {No aplicativo, Área de trabalho}. Os tipos fixos ficam travados.
    - Segurança (trocar senha, 2FA, códigos).
    - Sessões (tabela com "Esta sessão", encerrar, encerrar as outras).
14. **`/sem-permissao`, 404, erro de rota:** mensagens por status (403, 404, 0 com `WifiOff`, 5xx com `ServerCrash`).

**Fora do MVP:** mural de avisos, aba Tempo, filtros salvos, campos personalizados, calendário, avatar com foto.

### 6.4 Componentes shadcn

1. Criar `apps/web/components.json` **à mão** (proibido `shadcn init -d`, que gera Next com Base UI):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york", "rsc": false, "tsx": true,
  "tailwind": { "config": "", "css": "src/styles/globals.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" }
}
```

2. Criar `src/lib/utils.ts` com `cn()` (clsx + tailwind-merge).
3. Rodar em `apps/web`:

```
pnpm dlx shadcn@4.22.1 add alert alert-dialog avatar badge button button-group calendar card chart checkbox collapsible command context-menu dialog dropdown-menu empty field hover-card input input-group input-otp item kbd label popover progress radio-group scroll-area select separator sheet skeleton sonner spinner switch table tabs textarea toggle toggle-group tooltip -y
```

4. **Ajustes obrigatórios** (cada um conferido por grep):
   - trocar `ring-ring/50` por `ring-ring` em `components/ui`;
   - variante `destructive` de button e badge: `bg-destructive-solid` e `hover:bg-destructive-solid/90`, sem `dark:bg-destructive/60`;
   - `sonner.tsx`: usar `useTheme` de `@/components/theme/theme-provider`; `next-themes` não pode aparecer no projeto;
   - se o CLI sobrescrever `globals.css`, restaurar o conteúdo da seção 6.1.
5. **Não instalar:** sidebar, resizable, drawer, form (usar `field`), navigation-menu, carousel.

Componente que faltar no registro deve ser registrado no commit, e em seu lugar entra um componente próprio equivalente.

### 6.5 Componentes próprios

- **`layout/`:** AppShell, AppBar, AppBarItem, TopBar, MobileNav, TwoPane, PaneHeader, ListPaneSection, ListPaneNavItem, RouteTabs, SkipLink, OfflineIndicator, BuscaGlobalTrigger.
- **`feedback/`:** EmptyState, ErrorState, PageSkeleton, ConfirmDialog (destrutivo, com foco inicial em "Cancelar"), NotFoundState.
- **`data/`:** DataTable, DataTableToolbar, DataTableFacetedFilter, DataTableColumnToggle, DataTablePagination, DataTableColumnHeader (`aria-sort`), DataTableBulkBar.
- **`form/`:** CampoForm (canônico, seção 7), PasswordInput, PasswordStrength, AutosizeTextarea, ComboboxField, MultiComboboxField, DatePicker, DateTimePicker, DateRangePicker, ColorField, FileDropzone, UploadList, MarkdownEditor.
- **`display/`:** ColorBadge, StatusBadge, PrioridadeBadge, SlaBadge (usa `situacaoSla` e `useAgora(60_000)`), UserAvatar, AvatarGroup, PresenceIndicator, UserHoverCard, RelativeTime, Markdown (com tokens de menção), MentionChip, KeyValueGrid, StatCard, ChartCard, KbdShortcut, Pode.
- **`theme/`:** ThemeProvider (`tema`, `temaEfetivo`, `definirTema`), DensityProvider.
- **`command/`:** CommandPalette, AtalhosDialog.

As props seguem `docs/plano/relatorios/design.md` §5.2 (Componentes próprios, props TypeScript), menos o `EntidadeDescritor`, que sai.

### 6.6 Estrutura de `apps/web/src`

```
apps/web/
  index.html  components.json  package.json  vite.config.ts  tsconfig.json  tsconfig.app.json  tsconfig.node.json
  vitest.config.ts  playwright.config.ts
  public/ favicon.svg  icon-192.png  theme-init.js
  e2e/    auth.setup.ts  login.spec.ts  chamado-fluxo.spec.ts  tempo-real.spec.ts  seguranca.spec.ts  a11y.spec.ts
          .auth/ (storageState de cada login, gerado pelo auth.setup.ts; no .gitignore)
  src/
    main.tsx  router.tsx  routeTree.gen.ts (gerado por "pnpm -F @vinimon/web exec tsr generate" e commitado; não editar; ignorado pelo Biome)
    styles/globals.css
    test/   setup.ts  render-rota.tsx  api-falsa.ts  render-rota.test.tsx
    routes/
      __root.tsx  login.tsx  trocar-senha.tsx  configurar-2fa.tsx  _app.tsx
      _app/ index.tsx  sem-permissao.tsx  atividade.tsx  painel.tsx
            chamados/ route.tsx index.tsx novo.tsx  $chamadoId/ route.tsx index.tsx detalhes.tsx anexos.tsx historico.tsx imprimir.tsx
            conhecimento/ route.tsx index.tsx novo.tsx  $artigoId/ index.tsx editar.tsx
            inventario/ route.tsx index.tsx $ativoId.tsx
            relatorios/ route.tsx index.tsx $relatorio.tsx
            admin/ route.tsx index.tsx usuarios.tsx areas.tsx unidades.tsx departamentos.tsx prioridades.tsx status.tsx
                   problemas.tsx canais.tsx tags.tsx jornadas.tsx feriados.tsx tipos-ativo.tsx categorias-artigo.tsx
                   configuracoes.tsx auditoria.tsx
            perfil/ route.tsx index.tsx aparencia.tsx notificacoes.tsx seguranca.tsx sessoes.tsx
    components/ ui/ layout/ feedback/ data/ form/ display/ theme/ command/
    features/   auth/ meta/ chamados/ conversa/ anexos/ historico/ notificacoes/ atividade/ presenca/ busca/ painel/
                conhecimento/ inventario/ relatorios/ admin/ perfil/ areas/ (um queries.ts por feature + components/)
    lib/        api.ts  query-client.ts  socket.ts  form.ts  cores.ts  datas.ts  storage.ts  atalhos.ts  rotulos.ts  utils.ts
    hooks/      use-debounce.ts use-media-query.ts use-mobile.ts use-prefers-reduced-motion.ts use-atalhos.ts use-ocioso.ts
                use-document-title.ts use-copiar.ts use-alteracoes-nao-salvas.ts use-agora.ts use-foco-ao-navegar.ts
                use-socket-evento.ts
```

Regras do front:
- `__root.tsx` usa `createRootRouteWithContext<{ queryClient: QueryClient }>()`.
- O `beforeLoad` de `_app.tsx` faz `ensureQueryData(authConsultas.sessao())` e redireciona conforme o estado: null vai para `/login?redirect=`; TROCA_SENHA para `/trocar-senha`; CADASTRO_MFA para `/configurar-2fa`.
- `exigir(permissao)` no `beforeLoad` dos layouts.
- Search params com Zod direto em `validateSearch`, todos `.optional()`.
- Loader com `ensureQueryData` e componente com `useSuspenseQuery`.
- Datas com date-fns `ptBR` (`formatarCurto`, `formatarRelativo`, `formatarDuracao`).
- Chaves de dados do usuário no `localStorage` levam o id: `vinimon:u<id>:rascunho:novo-chamado`, `vinimon:u<id>:recentes`. `limparDadosDoUsuario()` (`lib/storage.ts`) remove todas as chaves `vinimon:u*`; o logout a chama junto com `queryClient.clear()` (S80).
