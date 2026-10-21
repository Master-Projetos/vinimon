#!/usr/bin/env node
// Grafo de tarefas do plano (docs/plano/tarefas/fase-NN.md): parse dos cartões, expansão de
// dependências e normalização da lista de arquivos. Node puro, sem dependências.
//
// Uso:
//   node scripts/plano/grafo.mjs --verificar [--ref origin/v2 | --dir <raiz>]
//   node scripts/plano/grafo.mjs --json [--ref …]          # imprime o grafo
//   node scripts/plano/grafo.mjs --tarefa T-5.4 [--ref …]   # um cartão normalizado
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MODELOS = ['Haiku', 'Sonnet', 'Opus']
export const TRILHAS = ['A', 'W', 'C']
export const DIR_TAREFAS = 'docs/plano/tarefas'

/** Arquivos que várias tarefas editam acrescentando uma linha (conflito = manter as duas). */
export const APPEND_ONLY = ['apps/api/src/app.ts', 'packages/shared/src/index.ts', 'apps/api/src/jobs/index.ts']
/** Arquivos gerados: nunca entram no cruzamento; em conflito, regenerar. */
export const GERADOS = ['pnpm-lock.yaml', 'apps/web/src/routeTree.gen.ts', 'apps/web/src/components/ui/**']
/** Trava de schema: só uma tarefa aberta por vez, em qualquer trilha. */
export const SCHEMA = [
  'apps/api/prisma/schema.prisma',
  'apps/api/prisma/migrations/**',
  'packages/shared/src/enums.ts',
  'apps/api/src/lib/enums-check.ts',
]
const RAIZES = ['apps/', 'packages/', 'docs/', 'scripts/', 'deploy/', 'legado/', '.github/', 'docker/']
const ARQ_RAIZ = /^(?:[A-Za-z0-9_.-]+\.(?:md|json|ya?ml|sql|sh|ts|tsx|mjs|js)|Dockerfile|\.dockerignore|\.nvmrc|\.gitignore|\.gitattributes)$/
/** Caminhos relativos que aparecem abreviados nos cartões. */
const APELIDOS = { 'components/ui/*': 'apps/web/src/components/ui/**' }

// ---------- leitura ----------

/** Lê os cartões de uma ref git (padrão) ou de um diretório. Devolve [{nome, texto}]. */
export function lerFontes({ ref, dir, cwd = process.cwd() } = {}) {
  if (dir) {
    const base = join(dir, DIR_TAREFAS)
    return readdirSync(base)
      .filter((n) => /^fase-\d\d\.md$/.test(n))
      .sort()
      .map((n) => ({ nome: `${DIR_TAREFAS}/${n}`, texto: readFileSync(join(base, n), 'utf8') }))
  }
  const r = ref ?? 'origin/v2'
  const lista = git(['ls-tree', '--name-only', `${r}:${DIR_TAREFAS}`], cwd)
    .split('\n')
    .filter((n) => /^fase-\d\d\.md$/.test(n))
    .sort()
  return lista.map((n) => ({ nome: `${DIR_TAREFAS}/${n}`, texto: git(['show', `${r}:${DIR_TAREFAS}/${n}`], cwd) }))
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

// ---------- parse ----------

const idNum = (id) => id.slice(2).split('.').map(Number)
export const compararIds = (a, b) => {
  const [fa, na] = idNum(a)
  const [fb, nb] = idNum(b)
  return fa - fb || na - nb
}

function campo(corpo, nome) {
  const m = corpo.match(new RegExp(`^- \\*\\*${nome}:\\*\\*(.*)$`, 'm'))
  return m ? m[1].trim() : null
}

/** Faz o parse de todos os cartões. Erros de formato vão para `erros` (o --verificar falha). */
export function parseCartoes(fontes) {
  const tarefas = new Map()
  const erros = []
  for (const { nome, texto } of fontes) {
    const linhas = texto.split('\n')
    const inicios = []
    linhas.forEach((l, i) => {
      if (/^### T-\d+\.\d+ /.test(l)) inicios.push(i)
    })
    inicios.forEach((ini, k) => {
      const fim = k + 1 < inicios.length ? inicios[k + 1] : proximoCabecalho(linhas, ini)
      const corpo = linhas.slice(ini, fim).join('\n')
      const m = linhas[ini].match(/^### (T-\d+\.\d+) — (.+)$/)
      if (!m) {
        erros.push(`${nome}:${ini + 1}: cabeçalho fora do formato "### T-x.y — título"`)
        return
      }
      const [, id, titulo] = m
      if (tarefas.has(id)) erros.push(`${id}: ID repetido (${nome})`)
      const t = {
        id,
        fase: idNum(id)[0],
        titulo: titulo.trim(),
        arquivo: nome,
        linhas: [ini + 1, fim],
        texto: corpo,
        dependeTexto: (campo(corpo, 'Depende de') ?? '').split('**Paralelo com:**')[0].replace(/·\s*$/, '').trim(),
        arquivosTexto: campo(corpo, 'Arquivos') ?? '',
        trilhaTexto: campo(corpo, 'Trilha') ?? '',
        modelo: campo(corpo, 'Modelo') ?? '',
      }
      for (const c of ['Depende de', 'Arquivos', 'Pronto quando', 'Trilha', 'Modelo', 'Tamanho']) {
        if (campo(corpo, c) === null) erros.push(`${id}: falta o campo "${c}"`)
      }
      if (!MODELOS.includes(t.modelo)) erros.push(`${id}: Modelo inválido "${t.modelo}"`)
      const tr = t.trilhaTexto.match(/^([AWC])(?: \(apoio W\))?$/)
      if (!tr) erros.push(`${id}: Trilha inválida "${t.trilhaTexto}"`)
      t.trilha = tr ? tr[1] : '?'
      t.apoioW = /\(apoio W\)/.test(t.trilhaTexto)
      tarefas.set(id, t)
    })
  }
  return { tarefas, erros }
}

function proximoCabecalho(linhas, ini) {
  for (let i = ini + 1; i < linhas.length; i++) if (/^#{1,3} /.test(linhas[i])) return i
  return linhas.length
}

// ---------- dependências ----------

/** Expande "Depende de" em ids explícitos + portões. Texto não reconhecido vira erro. */
export function expandirDependencias(tarefas, erros) {
  const ids = [...tarefas.keys()].sort(compararIds)
  const daFase = (f) => ids.filter((x) => idNum(x)[0] === f)
  for (const t of tarefas.values()) {
    const deps = new Set()
    const portoes = new Set()
    let resto = t.dependeTexto
    const tirar = (re, fn) => {
      resto = resto.replace(re, (...g) => {
        fn(...g)
        return ' '
      })
    }
    tirar(/todas as T-(\d+)\.x a (T-\d+\.\d+)/g, (_, f, ate) => {
      for (const x of ids) if (idNum(x)[0] >= Number(f) && compararIds(x, ate) <= 0) deps.add(x)
    })
    tirar(/todas as T-(\d+)\.x/g, (_, f) => {
      for (const x of daFase(Number(f))) deps.add(x)
    })
    tirar(/(T-\d+\.\d+)\s*[–-]\s*(T-\d+\.\d+)/g, (_, a, b) => {
      const [fa] = idNum(a)
      const [fb] = idNum(b)
      if (fa !== fb) erros.push(`${t.id}: intervalo entre fases diferentes (${a}–${b})`)
      for (const x of daFase(fa)) if (compararIds(x, a) >= 0 && compararIds(x, b) <= 0) deps.add(x)
    })
    tirar(/\bMVP\b/g, () => {
      for (const x of ids) if (idNum(x)[0] <= 11) deps.add(x)
      portoes.add('MVP')
    })
    tirar(/\bFase 2\b/g, () => {
      for (const x of ids) if (idNum(x)[0] >= 12 && idNum(x)[0] <= 17) deps.add(x)
    })
    tirar(/T-\d+\.\d+/g, (x) => deps.add(x))
    const sobra = resto.replace(/[,\s—e]/g, '')
    if (sobra) erros.push(`${t.id}: texto não reconhecido em "Depende de": "${resto.trim()}"`)
    deps.delete(t.id)
    for (const d of deps) if (!tarefas.has(d)) erros.push(`${t.id}: depende de ${d}, que não existe`)
    t.deps = [...deps].filter((d) => tarefas.has(d)).sort(compararIds)
    t.portoes = [...portoes]
  }
  // ciclo
  const estado = new Map()
  const visitar = (id, pilha) => {
    if (estado.get(id) === 2) return
    if (estado.get(id) === 1) {
      erros.push(`ciclo: ${[...pilha, id].join(' → ')}`)
      return
    }
    estado.set(id, 1)
    for (const d of tarefas.get(id).deps) visitar(d, [...pilha, id])
    estado.set(id, 2)
  }
  for (const id of tarefas.keys()) visitar(id, [])
}

// ---------- arquivos ----------

function expandirChaves(p) {
  const m = p.match(/^(.*?)\{([^{}]*)\}(.*)$/)
  if (!m) return [p]
  return m[2].split(',').flatMap((x) => expandirChaves(`${m[1]}${x.trim()}${m[3]}`))
}

function cadastro(m) {
  return [
    `packages/shared/src/modulos/${m}.ts`,
    'packages/shared/src/index.ts',
    `apps/api/src/modules/${m}/schemas.ts`,
    `apps/api/src/modules/${m}/service.ts`,
    `apps/api/src/modules/${m}/routes.ts`,
    `apps/api/src/modules/${m}/${m}.test.ts`,
    'apps/api/src/app.ts',
  ]
}

const RE_INSTALA = /\bInstalar\b|dependency direta|nas dependencies|às devDependencies|add -E /

/** Normaliza a lista de arquivos do cartão em caminhos/globs a partir da raiz do repositório. */
export function normalizarArquivos(tarefas, erros) {
  for (const t of tarefas.values()) {
    const arqs = new Set()
    const txt = t.arquivosTexto
    for (const tok of txt.match(/`[^`]*`/g) ?? []) {
      const s = tok.slice(1, -1).trim()
      const cad = s.match(/^<m>=([a-z-]+)$/)
      if (cad) {
        for (const a of cadastro(cad[1])) arqs.add(a)
        continue
      }
      if (/\s/.test(s) || (!s.includes('/') && !ARQ_RAIZ.test(s))) continue // identificador, enum, comando
      for (let p of expandirChaves(s)) {
        p = APELIDOS[p] ?? p
        p = p.replace(/<[^>]+>/g, '*')
        if (p.endsWith('/')) p += '**'
        if (p.includes('/') && !RAIZES.some((r) => p.startsWith(r))) {
          erros.push(`${t.id}: caminho fora das raízes conhecidas: "${p}"`)
          continue
        }
        arqs.add(p)
      }
    }
    if (/\bmigração\b/.test(txt) || [...arqs].some((a) => a.startsWith('apps/api/prisma/schema.prisma'))) {
      arqs.add('apps/api/prisma/schema.prisma')
      arqs.add('apps/api/prisma/migrations/**')
    }
    if (/\benums?\b/.test(txt) || [...arqs].includes('apps/api/prisma/schema.prisma')) {
      arqs.add('packages/shared/src/enums.ts')
      arqs.add('apps/api/src/lib/enums-check.ts')
    }
    if (RE_INSTALA.test(t.texto)) {
      const conta = { 'apps/api': 0, 'apps/web': 0, 'packages/shared': 0 }
      for (const a of arqs) for (const k of Object.keys(conta)) if (a.startsWith(`${k}/`)) conta[k]++
      const alvo = Object.entries(conta).sort((a, b) => b[1] - a[1])[0]
      if (alvo && alvo[1] > 0) arqs.add(`${alvo[0]}/package.json`)
      arqs.add('pnpm-lock.yaml')
    }
    if ([...arqs].some((a) => a.startsWith('apps/web/src/routes/'))) arqs.add('apps/web/src/routeTree.gen.ts')
    // sobra de prosa: tudo fora das crases, sem os comentários entre parênteses e as expressões conhecidas
    const sobra = txt
      .replace(/`[^`]*`/g, ' ')
      .replace(/\([^()]*\)/g, ' ')
      .replace(/Exceção registrada ao limite de 8 arquivos:[^.]*\.?/g, ' ')
      .replace(/\+ migração|padrão de cadastro com|\b(e|em)\b/g, ' ')
      .replace(/[,;:\s.]/g, '')
    if (sobra) erros.push(`${t.id}: prosa não reconhecida em "Arquivos": "${sobra}"`)
    if (arqs.size === 0) erros.push(`${t.id}: nenhum arquivo reconhecido`)
    t.arquivos = [...arqs].sort()
    t.tocaSchema = t.arquivos.some((a) => SCHEMA.some((s) => conflita(a, s)))
  }
}

// ---------- globs e cruzamento ----------

const reGlob = new Map()
export function globParaRegex(g) {
  if (!reGlob.has(g)) {
    let s = ''
    for (let i = 0; i < g.length; i++) {
      const c = g[i]
      if (c === '*' && g[i + 1] === '*') {
        s += '.*'
        i++
      } else if (c === '*') s += '[^/]*'
      else s += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    }
    reGlob.set(g, new RegExp(`^${s}$`))
  }
  return reGlob.get(g)
}
const prefixoLiteral = (g) => g.split('*')[0]

/** Dois caminhos/globs podem se referir ao mesmo arquivo? (aproximação conservadora) */
export function conflita(a, b) {
  if (a === b) return true
  const ga = a.includes('*')
  const gb = b.includes('*')
  if (!ga && !gb) return false
  if (ga && !gb) return globParaRegex(a).test(b)
  if (!ga && gb) return globParaRegex(b).test(a)
  const pa = prefixoLiteral(a)
  const pb = prefixoLiteral(b)
  return pa.startsWith(pb) || pb.startsWith(pa)
}

const isento = (a) => APPEND_ONLY.includes(a) || GERADOS.some((g) => conflita(a, g) && (g.includes('*') ? true : a === g))

/** Arquivos (não isentos) que as duas tarefas têm em comum, mais a trava de schema. */
export function cruzamento(t1, t2) {
  const comuns = []
  for (const a of t1.arquivos) {
    if (isento(a)) continue
    for (const b of t2.arquivos) if (!isento(b) && conflita(a, b)) comuns.push(a === b ? a : `${a} × ${b}`)
  }
  if (t1.tocaSchema && t2.tocaSchema) comuns.push('(trava de schema)')
  return comuns
}

/** Arquivos permitidos no diff de uma tarefa: os do cartão + gerados + package.json se instalar. */
export function permitido(t, caminho) {
  return t.arquivos.some((a) => conflita(a, caminho)) || GERADOS.some((g) => conflita(g, caminho))
}

// ---------- montagem ----------

export function montarGrafo(fontesOuOpcoes) {
  const fontes = Array.isArray(fontesOuOpcoes) ? fontesOuOpcoes : lerFontes(fontesOuOpcoes)
  const { tarefas, erros } = parseCartoes(fontes)
  expandirDependencias(tarefas, erros)
  normalizarArquivos(tarefas, erros)
  // descendentes (prioridade do caminho crítico)
  const filhos = new Map([...tarefas.keys()].map((k) => [k, []]))
  for (const t of tarefas.values()) for (const d of t.deps) filhos.get(d)?.push(t.id)
  const memo = new Map()
  const desc = (id) => {
    if (memo.has(id)) return memo.get(id)
    const s = new Set()
    for (const f of filhos.get(id)) {
      s.add(f)
      for (const x of desc(f)) s.add(x)
    }
    memo.set(id, s)
    return s
  }
  for (const t of tarefas.values()) t.descendentes = desc(t.id).size
  return { tarefas, erros }
}

// ---------- verificação (regressão) ----------

/** Asserções de regressão do parser (contra o plano conhecido). Devolve lista de falhas. */
export function assercoes(tarefas) {
  const f = []
  const deps = (id) => tarefas.get(id)?.deps ?? []
  const tem = (id, ...ds) => {
    for (const d of ds) if (!deps(id).includes(d)) f.push(`${id} deveria depender de ${d}`)
  }
  if (tarefas.size < 213) f.push(`esperado ≥ 213 cartões, há ${tarefas.size}`)
  tem('T-3.15', 'T-3.3', 'T-3.9')
  tem('T-10.9', 'T-3.9')
  tem('T-11.7', 'T-11.4', 'T-10.0', 'T-10.37')
  tem('T-11.11', 'T-1.1', 'T-10.37', 'T-11.10')
  tem('T-12.5', 'T-12.3')
  tem('T-18.1', 'T-12.1', 'T-17.8')
  for (const id of ['T-12.1', 'T-13.1', 'T-14.1']) {
    if (!(tarefas.get(id)?.portoes ?? []).includes('MVP')) f.push(`${id} deveria exigir o portão MVP`)
    tem(id, 'T-11.12')
  }
  if (!tarefas.get('T-3.2')?.arquivos.includes('apps/api/src/modules/unidades/routes.ts')) f.push('T-3.2: padrão de cadastro não expandido')
  if (!tarefas.get('T-12.1')?.tocaSchema) f.push('T-12.1 deveria tocar o schema')
  if (!tarefas.get('T-12.1')?.arquivos.includes('apps/api/package.json')) f.push('T-12.1 deveria incluir apps/api/package.json (instala dependência)')
  if (!tarefas.get('T-10.0')?.arquivos.includes('apps/web/src/routeTree.gen.ts')) f.push('T-10.0 deveria incluir routeTree.gen.ts')
  return f
}

// ---------- CLI ----------

function args(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const prox = argv[i + 1]
    if (prox !== undefined && !prox.startsWith('--')) {
      o[a.slice(2)] = prox
      i++
    } else o[a.slice(2)] = true
  }
  return o
}

function principal() {
  const o = args(process.argv.slice(2))
  const fonte = o.dir ? { dir: o.dir } : { ref: o.ref ?? (existeRef('origin/v2') ? 'origin/v2' : 'HEAD') }
  const { tarefas, erros } = montarGrafo(fonte)
  if (o.tarefa) {
    const t = tarefas.get(o.tarefa)
    if (!t) {
      console.error(`tarefa ${o.tarefa} não encontrada`)
      process.exit(1)
    }
    const { texto, ...resto } = t
    console.log(JSON.stringify(resto, null, 2))
    return
  }
  if (o.json) {
    console.log(JSON.stringify([...tarefas.values()].map(({ texto, ...r }) => r), null, 2))
    return
  }
  const falhas = [...erros, ...(o.verificar ? assercoes(tarefas) : [])]
  const por = (k) => [...tarefas.values()].reduce((m, t) => m.set(t[k], (m.get(t[k]) ?? 0) + 1), new Map())
  console.log(`cartões: ${tarefas.size} (fonte: ${fonte.dir ?? fonte.ref})`)
  console.log(`por modelo: ${[...por('modelo')].map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log(`por trilha: ${[...por('trilha')].map(([k, v]) => `${k} ${v}`).join(', ')} (apoio W: ${[...tarefas.values()].filter((t) => t.apoioW).length})`)
  console.log(`tocam o schema: ${[...tarefas.values()].filter((t) => t.tocaSchema).length}`)
  if (falhas.length) {
    console.error(`\n${falhas.length} problema(s):`)
    for (const x of falhas) console.error(`- ${x}`)
    process.exit(1)
  }
  console.log('ok')
}

function existeRef(r) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', r], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal()
