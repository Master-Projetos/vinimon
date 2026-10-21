#!/usr/bin/env node
// Estado da execução multi-conta e livro-razão de travas (branch controle/travas).
// Node puro, sem dependências. Toda gravação no livro-razão é um commit vazio enviado SEM force:
// se outro agente gravou antes, o push é recusado e a operação recomeça do zero (compare-and-swap).
//
//   node scripts/plano/proxima.mjs --status
//   node scripts/plano/proxima.mjs --trilha A[,W] [--json]           # próxima tarefa elegível (só leitura)
//   node scripts/plano/proxima.mjs --reivindicar T-x.y --trilha A     # grava a trava (CAS)
//   node scripts/plano/proxima.mjs --cartao T-x.y                     # cartão + arquivos + trechos citados
//   node scripts/plano/proxima.mjs --conferir T-x.y [--repo <dir>] [--base origin/v2]
//   node scripts/plano/proxima.mjs --conferir-pr --repo <pr> --controle <base>   # CI (protocolo.yml)
//   VINIMON_PAPEL=coordenador node scripts/plano/proxima.mjs --liberar T-x.y --motivo "…"
//   VINIMON_PAPEL=coordenador node scripts/plano/proxima.mjs --transferir T-x.y --para <agente>
//   VINIMON_PAPEL=coordenador node scripts/plano/proxima.mjs --desbloquear T-x.y
import { spawnSync } from 'node:child_process'
import { hostname } from 'node:os'
import { fileURLToPath } from 'node:url'
import { compararIds, cruzamento, montarGrafo, permitido } from './grafo.mjs'

export const REMOTO = process.env.VINIMON_REMOTO ?? 'origin'
export const BASE = process.env.VINIMON_BASE ?? 'v2'
export const LIVRO = 'controle/travas'
export const LIMITE_POR_AGENTE = 2
const PROIBIDOS_TAREFA = ['docs/plano/', 'CLAUDE.md', '.claude/', 'scripts/plano/', '.github/']
const PERMITIDOS_PLANO = ['docs/plano/', 'scripts/plano/', 'CLAUDE.md', '.claude/', '.gitattributes', '.github/workflows/protocolo.yml']
const RE_AGENTE = /^[a-z0-9][a-z0-9._-]{2,39}$/
const RE_RECUSA = /rejected|non-fast-forward|fetch first|failed to push|stale info|cannot lock ref/i

// ---------- utilitários ----------

export function git(args, { cwd = process.cwd(), env, permitirFalha = false } = {}) {
  const r = spawnSync('git', args, { cwd, env: env ?? process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const res = { ok: r.status === 0, code: r.status, out: (r.stdout ?? '').trimEnd(), err: (r.stderr ?? '').trim() }
  if (!res.ok && !permitirFalha) throw new Error(`git ${args.join(' ')} falhou (${r.status}): ${res.err}`)
  return res
}

export function gh(args, { cwd = process.cwd(), json = false, permitirFalha = false } = {}) {
  const r = spawnSync('gh', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) {
    if (permitirFalha) return null
    throw new Error(`gh ${args.join(' ')} falhou (${r.status}): ${(r.stderr ?? r.error?.message ?? '').trim()}`)
  }
  return json ? JSON.parse(r.stdout || 'null') : (r.stdout ?? '').trim()
}

export const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

export function agenteAtual() {
  const a = process.env.VINIMON_AGENTE
  if (!a || !RE_AGENTE.test(a)) throw new Error('defina VINIMON_AGENTE (ex.: conta2-notebook): só [a-z0-9._-], de 3 a 40 caracteres')
  return a
}

export const trilhasDe = (s) =>
  String(s ?? '')
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)

const exigirCoordenador = () => {
  if (process.env.VINIMON_PAPEL !== 'coordenador') throw new Error('operação só do coordenador (VINIMON_PAPEL=coordenador)')
}

// ---------- leitura do estado ----------

export function buscar(cwd) {
  git(['fetch', '--prune', REMOTO, `+refs/heads/${BASE}:refs/remotes/${REMOTO}/${BASE}`, `+refs/heads/${LIVRO}:refs/remotes/${REMOTO}/${LIVRO}`], { cwd })
}

/** Tarefas concluídas e portões, pelo replay de `git log --first-parent` da base. */
export function lerConcluidas(cwd, ref = `${REMOTO}/${BASE}`) {
  const concluidas = new Set()
  const portoes = new Set()
  const log = git(['log', '--first-parent', '--reverse', '--format=%s', ref], { cwd }).out
  for (const s of log.split('\n')) {
    let m
    if ((m = s.match(/^T-(\d+\.\d+): /))) concluidas.add(`T-${m[1]}`)
    else if ((m = s.match(/^Revert "T-(\d+\.\d+): /))) concluidas.delete(`T-${m[1]}`)
    else if ((m = s.match(/^Reapply "T-(\d+\.\d+): /))) concluidas.add(`T-${m[1]}`)
    else if ((m = s.match(/^port[ãa]o: (P\d\d|MVP)\b/))) portoes.add(m[1])
  }
  return { concluidas, portoes }
}

/** Replay do livro-razão. Map id → {id, estado: ativa|bloqueada|desbloqueada, agente, trilha, base, desde, issue}. */
export function lerLivro(cwd) {
  const travas = new Map()
  const anomalias = []
  const log = git(['log', '--reverse', '--format=%H%x09%ct%x09%s', `${REMOTO}/${LIVRO}`], { cwd }).out
  for (const linha of log.split('\n').filter(Boolean)) {
    const [sha, ct, s = ''] = linha.split('\t')
    const quando = Number(ct) * 1000
    const t = (id) => travas.get(id)
    let m
    if ((m = s.match(/^trava (T-\d+\.\d+) trilha=(\S+) agente=(\S+) base=([0-9a-f]+)/))) {
      if (travas.has(m[1])) anomalias.push(`trava dupla de ${m[1]} em ${sha.slice(0, 8)} (ignorada)`)
      else travas.set(m[1], { id: m[1], estado: 'ativa', trilha: m[2], agente: m[3], base: m[4], desde: quando })
    } else if ((m = s.match(/^bloqueia (T-\d+\.\d+) issue=(\S+)/))) {
      if (t(m[1])) Object.assign(t(m[1]), { estado: 'bloqueada', issue: m[2], desde: quando })
    } else if ((m = s.match(/^desbloqueia (T-\d+\.\d+)/))) {
      if (t(m[1])) Object.assign(t(m[1]), { estado: 'desbloqueada', desde: quando })
    } else if ((m = s.match(/^retoma (T-\d+\.\d+) agente=(\S+) base=([0-9a-f]+)/))) {
      if (t(m[1])) Object.assign(t(m[1]), { estado: 'ativa', agente: m[2], base: m[3], desde: quando })
    } else if ((m = s.match(/^libera (T-\d+\.\d+)/))) travas.delete(m[1])
    else if ((m = s.match(/^transfere (T-\d+\.\d+) para=(\S+)/))) {
      if (t(m[1])) t(m[1]).agente = m[2]
    } else if (!/^travas: início/.test(s)) anomalias.push(`evento desconhecido no livro-razão: "${s}"`)
  }
  return { travas, anomalias }
}

function ciDaBase(cwd, topo) {
  const runs = gh(['run', 'list', '--branch', BASE, '--limit', '30', '--json', 'conclusion,status,workflowName,headSha'], { cwd, json: true, permitirFalha: true })
  if (!runs) return { estado: 'desconhecido', topo }
  const doTopo = runs.filter((r) => r.headSha === topo && r.workflowName === 'CI')
  if (!doTopo.length) return { estado: 'sem-ci', topo }
  if (doTopo.some((r) => r.status === 'completed' && r.conclusion && r.conclusion !== 'success')) return { estado: 'vermelho', topo }
  if (doTopo.every((r) => r.status === 'completed')) return { estado: 'verde', topo }
  return { estado: 'rodando', topo }
}

/**
 * Estado completo. `semGh` (só --status offline) pula PRs e CI; o runner nunca usa.
 * Falha fechada: tarefa no log da base sem PR mergeado de `tarefa/<id>` não conta como concluída.
 */
export function lerEstado({ cwd = process.cwd(), semGh = false, semFetch = false } = {}) {
  if (!semFetch) buscar(cwd)
  const topoBase = git(['rev-parse', `${REMOTO}/${BASE}`], { cwd }).out
  const { tarefas, erros } = montarGrafo({ ref: `${REMOTO}/${BASE}`, cwd })
  const { concluidas, portoes } = lerConcluidas(cwd)
  const { travas, anomalias } = lerLivro(cwd)
  anomalias.push(...erros.map((e) => `grafo: ${e}`))
  let prs = []
  let ci = { estado: 'desconhecido', topo: topoBase }
  if (!semGh) {
    prs = gh(
      ['pr', 'list', '--base', BASE, '--state', 'all', '--limit', '1000', '--json', 'number,headRefName,title,state,labels,isDraft,mergeStateStatus,updatedAt,url'],
      { cwd, json: true },
    )
    const mergeados = new Set(prs.filter((p) => p.state === 'MERGED' && p.headRefName.startsWith('tarefa/')).map((p) => p.headRefName.slice(7)))
    for (const id of [...concluidas]) {
      if (!mergeados.has(id)) {
        concluidas.delete(id)
        anomalias.push(`${id} está no log da ${BASE} sem PR mergeado de tarefa/${id}: não conta como concluída`)
      }
    }
    ci = ciDaBase(cwd, topoBase)
  }
  for (const id of concluidas) travas.delete(id)
  return { tarefas, concluidas, portoes, travas, prs, ci, anomalias, topoBase }
}

// ---------- elegibilidade ----------

export const ativas = (st) => [...st.travas.values()].filter((t) => t.estado === 'ativa')

/** Por que `agente` não pode pegar (ou retomar) `id` agora? null = pode. */
export function impedimento(st, id, agente, { retomando = false } = {}) {
  const t = st.tarefas.get(id)
  if (!t) return `${id} não existe no plano da ${BASE}`
  if (st.concluidas.has(id)) return `${id} já está concluída`
  const tv = st.travas.get(id)
  if (tv && !(retomando && tv.agente === agente && tv.estado === 'desbloqueada')) return `${id} já está com ${tv.agente} (${tv.estado})`
  const faltam = t.deps.filter((d) => !st.concluidas.has(d))
  if (faltam.length) return `dependências pendentes: ${faltam.slice(0, 5).join(', ')}${faltam.length > 5 ? ` (+${faltam.length - 5})` : ''}`
  const portoes = t.portoes.filter((p) => !st.portoes.has(p))
  if (portoes.length) return `aguardando o commit "portão: ${portoes.join(', ')}"`
  if (st.ci.estado === 'vermelho') return `CI da ${BASE} vermelho no topo ${String(st.ci.topo).slice(0, 8)}`
  const minhas = ativas(st).filter((x) => x.agente === agente && x.id !== id)
  if (minhas.length >= LIMITE_POR_AGENTE) return `limite de ${LIMITE_POR_AGENTE} tarefas abertas por agente (${minhas.map((x) => x.id).join(', ')})`
  for (const outra of ativas(st)) {
    if (outra.id === id) continue
    const c = cruzamento(t, st.tarefas.get(outra.id) ?? { arquivos: [], tocaSchema: false })
    if (c.length) return `arquivos travados por ${outra.id} (${outra.agente}): ${c.slice(0, 3).join(', ')}`
  }
  return null
}

const daTrilha = (t, trilhas) => trilhas.includes(t.trilha) || (trilhas.includes('W') && t.apoioW)

/** Elegíveis para as trilhas: nativas antes do apoio, depois mais descendentes (caminho crítico). */
export function elegiveis(st, agente, trilhas) {
  const lista = []
  const motivos = new Map()
  for (const t of st.tarefas.values()) {
    if (!daTrilha(t, trilhas) || st.concluidas.has(t.id) || st.travas.has(t.id)) continue
    const imp = impedimento(st, t.id, agente)
    if (imp) motivos.set(t.id, imp)
    else lista.push(t)
  }
  const nativa = (t) => Number(trilhas.includes(t.trilha))
  lista.sort((a, b) => nativa(b) - nativa(a) || b.descendentes - a.descendentes || compararIds(a.id, b.id))
  return { lista, motivos }
}

// ---------- livro-razão (compare-and-swap) ----------

function envAutor() {
  const a = process.env.VINIMON_AGENTE ?? 'desconhecido'
  return {
    ...process.env,
    GIT_AUTHOR_NAME: `vinimon-${a}`,
    GIT_AUTHOR_EMAIL: `${a}@vinimon.invalid`,
    GIT_COMMITTER_NAME: `vinimon-${a}`,
    GIT_COMMITTER_EMAIL: `${a}@vinimon.invalid`,
  }
}

/**
 * CAS genérico. A cada tentativa: fetch, lê o estado, `construir(st)` devolve {motivo} (desiste)
 * ou {mensagem, ...extra}; cria o commit vazio sobre o topo lido e faz push sem force. Push aceito
 * = vitória. Recusado = outro agente gravou antes: espera aleatória e recomeça.
 */
export function cas(construir, { cwd = process.cwd(), tentativas = 6 } = {}) {
  for (let i = 1; i <= tentativas; i++) {
    const st = lerEstado({ cwd })
    const r = construir(st)
    if (r.motivo) return { ok: false, motivo: r.motivo }
    const topo = git(['rev-parse', `${REMOTO}/${LIVRO}`], { cwd }).out
    if (process.env.VINIMON_SIM_ATRASO_MS && i === 1) dormir(Number(process.env.VINIMON_SIM_ATRASO_MS)) // só na simulação
    const corpo = `host=${hostname()} pid=${process.pid} em=${new Date().toISOString()}`
    const novo = git(['commit-tree', `${topo}^{tree}`, '-p', topo, '-m', r.mensagem, '-m', corpo], { cwd, env: envAutor() }).out
    const p = git(['push', '--porcelain', REMOTO, `${novo}:refs/heads/${LIVRO}`], { cwd, permitirFalha: true })
    if (p.ok) return { ok: true, sha: novo, tentativas: i, ...r }
    if (!RE_RECUSA.test(`${p.out}\n${p.err}`)) throw new Error(`push do livro-razão falhou: ${p.err || p.out}`)
    dormir(500 + Math.floor(Math.random() * 3000))
  }
  return { ok: false, motivo: `concorrência: ${tentativas} tentativas sem conseguir gravar no livro-razão` }
}

export function reivindicar(id, { cwd, trilhas = [] } = {}) {
  const agente = agenteAtual()
  return cas(
    (st) => {
      const t = st.tarefas.get(id)
      const imp = impedimento(st, id, agente)
      if (imp) return { motivo: imp }
      if (trilhas.length && !daTrilha(t, trilhas)) return { motivo: `${id} é da trilha ${t.trilha}${t.apoioW ? ' (apoio W)' : ''}` }
      return { mensagem: `trava ${id} trilha=${t.trilha} agente=${agente} base=${st.topoBase}`, id, base: st.topoBase }
    },
    { cwd },
  )
}

/** O dono retoma uma tarefa desbloqueada: refaz a checagem de arquivos e schema. */
export function retomar(id, { cwd } = {}) {
  const agente = agenteAtual()
  return cas(
    (st) => {
      const tv = st.travas.get(id)
      if (!tv || tv.agente !== agente) return { motivo: `${id} não é uma trava de ${agente}` }
      if (tv.estado !== 'desbloqueada') return { motivo: `${id} está ${tv.estado}, não desbloqueada` }
      const imp = impedimento(st, id, agente, { retomando: true })
      if (imp) return { motivo: imp }
      return { mensagem: `retoma ${id} agente=${agente} base=${st.topoBase}`, id, base: st.topoBase }
    },
    { cwd },
  )
}

export function bloquear(id, issue, { cwd } = {}) {
  const agente = agenteAtual()
  return cas(
    (st) => {
      const tv = st.travas.get(id)
      if (!tv || tv.agente !== agente || tv.estado !== 'ativa') return { motivo: `${id} não é uma trava ativa de ${agente}` }
      return { mensagem: `bloqueia ${id} issue=${issue}` }
    },
    { cwd },
  )
}

export function desbloquear(id, { cwd } = {}) {
  exigirCoordenador()
  return cas((st) => (st.travas.get(id)?.estado === 'bloqueada' ? { mensagem: `desbloqueia ${id}` } : { motivo: `${id} não está bloqueada` }), { cwd })
}

export function liberar(id, motivo, { cwd } = {}) {
  exigirCoordenador()
  const m = String(motivo ?? '').replace(/\s+/g, ' ').trim()
  if (!m) throw new Error('informe --motivo')
  const r = cas((st) => (st.travas.has(id) ? { mensagem: `libera ${id} motivo=${m}` } : { motivo: `${id} não tem trava aberta` }), { cwd })
  if (r.ok) {
    // branch remota órfã (sem PR aberto) atrapalharia uma nova tentativa: apaga
    const aberto = gh(['pr', 'list', '--head', `tarefa/${id}`, '--state', 'open', '--json', 'number'], { cwd, json: true, permitirFalha: true })
    if (aberto && !aberto.length) git(['push', REMOTO, '--delete', `tarefa/${id}`], { cwd, permitirFalha: true })
  }
  return r
}

export function transferir(id, para, { cwd } = {}) {
  exigirCoordenador()
  if (!RE_AGENTE.test(String(para))) throw new Error('--para inválido')
  return cas((st) => (st.travas.has(id) ? { mensagem: `transfere ${id} para=${para}` } : { motivo: `${id} não tem trava aberta` }), { cwd })
}

// ---------- cartão e trechos citados ----------

const ARQ_SECAO = {
  1: '01-escopo.md',
  2: '02-decisoes-libs.md',
  3: '03-arquitetura.md',
  4: '04-dados.md',
  5: '05-seguranca.md',
  6: '06-design.md',
  7: '07-codigo-canonico.md',
}

function lerArquivoPlano(caminho, { cwd, ref }) {
  const r = git(['show', `${ref}:${caminho}`], { cwd, permitirFalha: true })
  return r.ok ? r.out.split('\n') : null
}

/** Intervalos de linha (1-based) dos trechos §N.M, S# e T## citados no texto do cartão. */
export function trechosCitados(t, { cwd = process.cwd(), ref = `${REMOTO}/${BASE}` } = {}) {
  const saida = []
  const secoes = new Set(t.texto.match(/§\d+(?:\.\d+)*/g) ?? [])
  for (const s of secoes) {
    const num = s.slice(1)
    const n = Number(num.split('.')[0])
    if (n >= 9) {
      saida.push({ ref: s, arquivo: 'docs/plano/tarefas/corte-verificacao-riscos.md' })
      continue
    }
    if (!ARQ_SECAO[n]) continue
    const arquivo = `docs/plano/fundamentos/${ARQ_SECAO[n]}`
    const linhas = lerArquivoPlano(arquivo, { cwd, ref })
    if (!linhas) continue
    const nivelAlvo = num.includes('.') ? 3 : 2
    const re = num.includes('.') ? new RegExp(`^### ${num.replace(/\./g, '\\.')}\\b`) : new RegExp(`^## ${num}\\.`)
    const ini = linhas.findIndex((l) => re.test(l))
    if (ini < 0) {
      saida.push({ ref: s, arquivo })
      continue
    }
    let fim = linhas.length
    for (let i = ini + 1; i < linhas.length; i++) {
      const h = linhas[i].match(/^(#{2,3}) /)
      if (h && h[1].length <= nivelAlvo) {
        fim = i
        break
      }
    }
    saida.push({ ref: s, arquivo, de: ini + 1, ate: fim })
  }
  const seg = lerArquivoPlano('docs/plano/fundamentos/05-seguranca.md', { cwd, ref })
  const itens = (prefixo) => [...new Set(t.texto.match(new RegExp(`\\b${prefixo}\\d+\\b`, 'g')) ?? [])]
  for (const [p, re] of [
    ['S', (x) => new RegExp(`^- \\*\\*${x}\\*\\*`)],
    ['T', (x) => new RegExp(`^- \\*\\*${x} `)],
  ]) {
    for (const x of itens(p)) {
      if (p === 'T' && !/^T\d\d$/.test(x)) continue
      const ini = seg?.findIndex((l) => re(x).test(l)) ?? -1
      if (ini < 0) continue
      let fim = ini + 1
      while (fim < seg.length && !/^- \*\*[ST]\d/.test(seg[fim]) && !/^#{2,4} |^\*\*/.test(seg[fim])) fim++
      saida.push({ ref: x, arquivo: 'docs/plano/fundamentos/05-seguranca.md', de: ini + 1, ate: fim })
    }
  }
  return saida
}

// ---------- conferência do diff ----------

/** Confere o diff `base...HEAD` de `repo` contra o cartão `id`. Devolve lista de violações. */
export function conferir(t, { repo = process.cwd(), base = `${REMOTO}/${BASE}`, ignorarEscopo = false } = {}) {
  const v = []
  const nomes = git(['diff', '--name-only', '--no-renames', `${base}...HEAD`], { cwd: repo }).out.split('\n').filter(Boolean)
  for (const f of nomes) {
    const exato = t.arquivos.includes(f)
    if (PROIBIDOS_TAREFA.some((p) => f === p || f.startsWith(p)) && !exato) v.push(`${f}: caminho proibido para PR de tarefa`)
    else if (!ignorarEscopo && !permitido(t, f)) v.push(`${f}: fora da lista de arquivos do cartão ${t.id}`)
  }
  const status = git(['diff', '--name-status', '--no-renames', `${base}...HEAD`, '--', 'apps/api/prisma/migrations'], { cwd: repo }).out
  const novas = new Set()
  for (const l of status.split('\n').filter(Boolean)) {
    const [st, f] = l.split('\t')
    // o Prisma cria o migration_lock.toml no primeiro migrate dev (T-1.5); não é uma pasta de migração
    if (st === 'A' && f === 'apps/api/prisma/migrations/migration_lock.toml') continue
    if (st !== 'A') v.push(`${f}: migração existente alterada ou removida (proibido)`)
    else {
      const d = f.split('/')[4]
      if (d) novas.add(d)
    }
  }
  if (novas.size) {
    const naBase = git(['ls-tree', '--name-only', `${base}:apps/api/prisma/migrations`], { cwd: repo, permitirFalha: true })
    const existentes = (naBase.ok ? naBase.out.split('\n') : []).filter((d) => /^\d{14}_/.test(d)).sort()
    const ultima = existentes.at(-1)
    for (const d of novas) {
      if (!/^\d{14}_[a-z0-9_]+$/.test(d)) v.push(`migração "${d}": nome fora do padrão <14 dígitos>_<nome_snake>`)
      else if (ultima && d <= ultima) v.push(`migração "${d}" ordena antes da última da base (${ultima}): renomeie com timestamp maior`)
    }
  }
  if (nomes.length) {
    const eol = git(['ls-files', '--eol', '--', ...nomes], { cwd: repo, permitirFalha: true }).out
    for (const l of eol.split('\n').filter(Boolean)) {
      const f = l.split('\t').at(-1)
      if (/^i\/crlf/.test(l) && !/\.bat$/i.test(f)) v.push(`${f}: fim de linha CRLF (use LF)`)
    }
  }
  return v
}

/** Conferência do PR no CI. Lê título/branches de variáveis de ambiente (nunca interpoladas no shell). */
export function conferirPR({ repo, controle }) {
  const titulo = process.env.TITULO ?? ''
  const head = process.env.HEAD_REF ?? ''
  const base = process.env.BASE_REF ?? ''
  const rotulos = JSON.parse(process.env.ROTULOS || '[]')
  const mesmoRepo = process.env.MESMO_REPO !== 'false'
  const v = []
  if (!mesmoRepo) return [`PR de fork não é aceito: as branches precisam estar neste repositório`]
  if (base === 'main') {
    if (head !== BASE) v.push(`PR para main só a partir de ${BASE} (corte); head = ${head}`)
    return v
  }
  if (base !== BASE) return v
  const baseRef = `origin/${BASE}`
  if (head.startsWith('tarefa/')) {
    const id = head.slice(7)
    if (!new RegExp(`^${id.replace(/\./g, '\\.')}: \\S`).test(titulo)) v.push(`título deve começar com "${id}: " (está "${titulo}")`)
    const { tarefas } = montarGrafo({ dir: controle })
    const t = tarefas.get(id)
    if (!t) v.push(`${id} não existe no plano da base`)
    else v.push(...conferir(t, { repo, base: baseRef, ignorarEscopo: rotulos.includes('escopo-aprovado') }))
  } else if (head.startsWith('plano/')) {
    if (!/^(plano|port[ãa]o): \S/.test(titulo)) v.push(`PR plano/* deve ter título "plano: …" ou "portão: …"`)
    if (/^T-\d/.test(titulo)) v.push('PR plano/* não pode usar título de tarefa')
    const nomes = git(['diff', '--name-only', '--no-renames', `${baseRef}...HEAD`], { cwd: repo }).out.split('\n').filter(Boolean)
    for (const f of nomes) if (!PERMITIDOS_PLANO.some((p) => f === p || f.startsWith(p))) v.push(`${f}: PR plano/* só toca ${PERMITIDOS_PLANO.join(', ')}`)
  } else {
    v.push(`para a ${BASE} só entram PRs de tarefa/T-x.y ou plano/<assunto> (head = ${head})`)
  }
  return v
}

// ---------- quadro ----------

const horas = (ms) => `${(ms / 3_600_000).toFixed(1)} h`

export function quadro(st) {
  const linhas = []
  const total = st.tarefas.size
  linhas.push(`Base ${BASE} @ ${st.topoBase.slice(0, 8)} · CI: ${st.ci.estado} · concluídas ${st.concluidas.size}/${total} · portões: ${[...st.portoes].join(', ') || '—'}`)
  for (const fase of [...new Set([...st.tarefas.values()].map((t) => t.fase))].sort((a, b) => a - b)) {
    const ts = [...st.tarefas.values()].filter((t) => t.fase === fase)
    const c = ts.filter((t) => st.concluidas.has(t.id)).length
    if (c < ts.length) linhas.push(`  Fase ${String(fase).padStart(2)}: ${c}/${ts.length}`)
  }
  const agora = Date.now()
  const prPorHead = new Map(st.prs.filter((p) => p.state === 'OPEN').map((p) => [p.headRefName, p]))
  linhas.push('', 'Travas abertas:')
  for (const tv of [...st.travas.values()].sort((a, b) => compararIds(a.id, b.id))) {
    const pr = prPorHead.get(`tarefa/${tv.id}`)
    const rot = pr ? (pr.labels ?? []).map((l) => l.name).join(',') : ''
    const alerta = !pr && tv.estado === 'ativa' && agora - tv.desde > 3 * 3_600_000 ? '  ⚠ sem PR há mais de 3 h' : ''
    linhas.push(`  ${tv.id} [${tv.trilha}] ${tv.estado} · ${tv.agente} · há ${horas(agora - tv.desde)}${pr ? ` · PR #${pr.number} ${pr.mergeStateStatus ?? ''} ${rot}` : ' · sem PR'}${tv.issue ? ` · issue ${tv.issue}` : ''}${alerta}`)
  }
  if (!st.travas.size) linhas.push('  (nenhuma)')
  const fechados = st.prs.filter((p) => p.state === 'CLOSED' && p.headRefName.startsWith('tarefa/') && st.travas.has(p.headRefName.slice(7)))
  if (fechados.length) {
    linhas.push('', 'PRs fechados sem merge com trava aberta (decidir: reabrir ou --liberar):')
    for (const p of fechados) linhas.push(`  #${p.number} ${p.headRefName}`)
  }
  linhas.push('', 'Elegíveis agora (topo de cada trilha, ignorando o limite por agente):')
  for (const tr of ['C', 'A', 'W']) {
    const { lista } = elegiveis(st, '__quadro__', [tr])
    linhas.push(`  ${tr}: ${lista.slice(0, 6).map((t) => `${t.id}(${t.modelo[0]})`).join(' ') || '—'}`)
  }
  if (st.anomalias.length) {
    linhas.push('', 'Anomalias:')
    for (const a of st.anomalias.slice(0, 30)) linhas.push(`  ! ${a}`)
  }
  return linhas.join('\n')
}

// ---------- CLI ----------

function lerArgs(argv) {
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

function sair(res, json) {
  if (json) console.log(JSON.stringify(res, null, 2))
  else console.log(res.ok ? `ok${res.sha ? ` (${res.sha.slice(0, 8)})` : ''}` : `não: ${res.motivo}`)
  process.exit(res.ok ? 0 : 3)
}

function principal() {
  const o = lerArgs(process.argv.slice(2))
  const cwd = o.repo && !o['conferir-pr'] ? o.repo : process.cwd()
  if (o['conferir-pr']) {
    const v = conferirPR({ repo: o.repo ?? '.', controle: o.controle ?? '.' })
    if (v.length) {
      console.error(`protocolo: ${v.length} problema(s):\n${v.map((x) => `- ${x}`).join('\n')}`)
      process.exit(1)
    }
    console.log('protocolo: ok')
    return
  }
  if (o.status) {
    console.log(quadro(lerEstado({ cwd, semGh: Boolean(o['sem-gh']) })))
    return
  }
  if (o.cartao) {
    const st = lerEstado({ cwd, semGh: true })
    const t = st.tarefas.get(o.cartao)
    if (!t) throw new Error(`${o.cartao} não existe`)
    const trechos = trechosCitados(t, { cwd })
    if (o.json) console.log(JSON.stringify({ id: t.id, titulo: t.titulo, modelo: t.modelo, trilha: t.trilha, arquivo: t.arquivo, linhas: t.linhas, arquivos: t.arquivos, trechos, texto: t.texto }, null, 2))
    else {
      console.log(t.texto)
      console.log(`\nArquivos permitidos (${t.arquivos.length}):\n${t.arquivos.map((a) => `- ${a}`).join('\n')}`)
      console.log(`\nTrechos citados (leia só estes intervalos):\n${trechos.map((x) => `- ${x.ref}: ${x.arquivo}${x.de ? ` linhas ${x.de}–${x.ate}` : ''}`).join('\n')}`)
    }
    return
  }
  if (o.conferir) {
    const st = lerEstado({ cwd, semGh: true, semFetch: Boolean(o['sem-fetch']) })
    const t = st.tarefas.get(o.conferir)
    if (!t) throw new Error(`${o.conferir} não existe`)
    const v = conferir(t, { repo: o.repo ?? process.cwd(), base: o.base ?? `${REMOTO}/${BASE}` })
    if (v.length) {
      console.error(v.map((x) => `- ${x}`).join('\n'))
      process.exit(1)
    }
    console.log('conferir: ok')
    return
  }
  if (o.reivindicar) sair(reivindicar(o.reivindicar, { cwd, trilhas: trilhasDe(o.trilha) }), o.json)
  if (o.liberar) sair(liberar(o.liberar, o.motivo, { cwd }), o.json)
  if (o.transferir) sair(transferir(o.transferir, o.para, { cwd }), o.json)
  if (o.desbloquear) sair(desbloquear(o.desbloquear, { cwd }), o.json)
  if (o.trilha) {
    const agente = agenteAtual()
    const st = lerEstado({ cwd })
    const { lista, motivos } = elegiveis(st, agente, trilhasDe(o.trilha))
    const t = lista[0]
    const res = t
      ? { ok: true, id: t.id, titulo: t.titulo, modelo: t.modelo, trilha: t.trilha, apoio: !trilhasDe(o.trilha).includes(t.trilha), arquivo: t.arquivo }
      : { ok: false, motivo: 'nenhuma tarefa elegível', esperas: [...motivos].slice(0, 8).map(([id, m]) => `${id}: ${m}`) }
    if (o.json) console.log(JSON.stringify(res, null, 2))
    else console.log(t ? `${t.id} (${t.modelo}, trilha ${t.trilha}) — ${t.titulo}` : `nenhuma elegível:\n${res.esperas.join('\n')}`)
    process.exit(t ? 0 : 3)
  }
  console.log('uso: veja o cabeçalho de scripts/plano/proxima.mjs')
  process.exit(2)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    principal()
  } catch (e) {
    console.error(`erro: ${e.message}`)
    process.exit(2)
  }
}
