type Oklch = { l: number; c: number; h: number }
export type ModoTema = 'claro' | 'escuro'
export interface CoresBadge {
  fundo: string
  texto: string
  borda: string
  ponto: string
}
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
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
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
  return modo === 'claro'
    ? ajustar(base, SUPERFICIE_CLARA_MAIS_ESCURA, 3, -1)
    : ajustar(base, SUPERFICIE_ESCURA_MAIS_CLARA, 3, 1)
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
