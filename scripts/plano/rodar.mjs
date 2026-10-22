#!/usr/bin/env node
// Runner de uma trilha. Escolhe a tarefa, trava no livro-razão (CAS), prepara uma worktree própria,
// roda o modelo do cartão em modo headless, confere o resultado e abre o PR. O modelo nunca faz
// push, nunca usa gh e nunca cria branch: tudo isso é deste script, que é determinístico.
//
//   node ../vinimon-controle/scripts/plano/rodar.mjs --trilha A            # laço automático
//   node ../vinimon-controle/scripts/plano/rodar.mjs --trilha A --uma      # uma tarefa e sai
//   node ../vinimon-controle/scripts/plano/rodar.mjs --trilha A --interativo
//   node ../vinimon-controle/scripts/plano/rodar.mjs --finalizar T-x.y [--bloqueado "motivo"]
//
// Variáveis: VINIMON_AGENTE (obrigatória), VINIMON_WT (pasta das worktrees), VINIMON_DADOS (~/.vinimon),
// VINIMON_MODELO_{HAIKU,SONNET,OPUS}, VINIMON_ORCAMENTO_{HAIKU,SONNET,OPUS} (USD), VINIMON_ESPERA_S.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as P from './proxima.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const CONTROLE = resolve(AQUI, '../..')
const DADOS = process.env.VINIMON_DADOS ?? join(homedir(), '.vinimon')
const ORIGEM = `${P.REMOTO}/${P.BASE}`
const PORTAS = [3000, 3100, 5173]
const ORDEM_MODELO = ['Haiku', 'Sonnet', 'Opus']
const RESULTADO_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    resultado: { type: 'string', enum: ['PRONTO', 'BLOQUEADO'] },
    motivo: { type: 'string' },
    evidencias: { type: 'array', items: { type: 'string' } },
  },
  required: ['resultado', 'motivo', 'evidencias'],
})

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)

function sh(cmd, args, { cwd = CONTROLE, permitirFalha = true, timeout, env } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 })
  const res = { ok: r.status === 0, code: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? r.error?.message ?? '').trim() }
  if (!res.ok && !permitirFalha) throw new Error(`${cmd} ${args.join(' ')} falhou: ${res.err || res.out}`)
  return res
}
const g = (args, o = {}) => sh('git', args, o)
const ghc = (args, o = {}) => P.gh(args, { cwd: CONTROLE, ...o })
/** git sem trim (conteúdo de arquivo). */
const gBruto = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? ''
const cauda = (s, n = 40) => String(s).split('\n').slice(-n).join('\n')

// ---------- caminhos ----------

function raizDoClone() {
  const comum = g(['rev-parse', '--path-format=absolute', '--git-common-dir'], { permitirFalha: false }).out
  return dirname(comum)
}
const CLONE = raizDoClone()
const GITDIR = join(CLONE, '.git')
const WT_BASE = process.env.VINIMON_WT ?? join(dirname(CLONE), 'vinimon-wt')
const wtDe = (id) => join(WT_BASE, id)

// ---------- preflight ----------

function preflight({ interativo }) {
  const erros = []
  const avisos = []
  if (!['linux', 'darwin'].includes(process.platform)) erros.push('use Linux, macOS ou WSL2 (os cartões assumem POSIX)')
  if (Number(process.versions.node.split('.')[0]) < 22) erros.push('Node 22 ou mais novo')
  try {
    P.agenteAtual()
  } catch (e) {
    erros.push(e.message)
  }
  for (const v of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_PROFILE']) {
    if (process.env[v] && process.env.VINIMON_PERMITIR_CHAVE !== '1') erros.push(`${v} definida: ela tem precedência sobre o /login da conta (unset, ou VINIMON_PERMITIR_CHAVE=1 se for intencional)`)
  }
  const ghs = sh('gh', ['auth', 'status'])
  if (!ghs.ok) erros.push('gh não autenticado: gh auth login')
  else if (!/workflow/.test(`${ghs.out}\n${ghs.err}`)) avisos.push('token do gh sem o escopo "workflow": tarefas que mexem em .github/workflows falharão no push (gh auth refresh -s workflow)')
  if (g(['rev-parse', '--abbrev-ref', 'HEAD']).out !== 'HEAD') erros.push(`${CONTROLE} não é a worktree de controle (deve estar em HEAD destacado em ${ORIGEM}): git worktree add --detach ../vinimon-controle ${ORIGEM}`)
  if (!g(['rev-parse', '--verify', '--quiet', `refs/remotes/${P.REMOTO}/${P.LIVRO}`]).ok && !g(['ls-remote', '--exit-code', P.REMOTO, `refs/heads/${P.LIVRO}`]).ok) {
    erros.push(`o livro-razão ${P.LIVRO} não existe no remoto: o coordenador precisa rodar o passo 0`)
  }
  if (!interativo) {
    const v = sh('claude', ['--version'])
    if (!v.ok) erros.push('claude CLI não encontrado no PATH')
    else {
      const ajuda = sh('claude', ['--help']).out
      for (const f of ['--permission-mode', '--allowedTools', '--disallowedTools', '--settings', '--setting-sources', '--max-budget-usd', '--output-format', '--json-schema', '--strict-mcp-config']) {
        if (!ajuda.includes(f)) erros.push(`claude CLI sem a flag ${f}: atualize o Claude Code`)
      }
      if (!ajuda.includes('dontAsk')) erros.push('claude CLI sem --permission-mode dontAsk: atualize o Claude Code')
      if (!sh('claude', ['auth', 'status']).ok) erros.push('claude não autenticado: rode claude e /login')
    }
    try {
      JSON.parse(readFileSync(join(AQUI, 'executor-settings.json'), 'utf8'))
    } catch (e) {
      erros.push(`executor-settings.json inválido: ${e.message}`)
    }
  }
  if (!sh('docker', ['compose', 'version']).ok) avisos.push('docker compose indisponível: tarefas com banco vão falhar')
  return { erros, avisos }
}

// ---------- trava local (um runner por clone) ----------

function travarLocal() {
  const dir = join(GITDIR, 'vinimon-laco.lock')
  try {
    mkdirSync(dir)
  } catch {
    const pid = Number(readFileSafe(join(dir, 'pid')))
    if (pid && !vivo(pid)) {
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir)
    } else throw new Error(`já existe um runner neste clone (pid ${pid || '?'}); se não existir, apague ${dir}`)
  }
  writeFileSync(join(dir, 'pid'), String(process.pid))
  const soltar = () => rmSync(dir, { recursive: true, force: true })
  process.on('exit', soltar)
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(130))
}
const readFileSafe = (f) => {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    return ''
  }
}
const vivo = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// ---------- controle sempre na base ----------

function hashScripts() {
  const h = createHash('sha256')
  for (const f of readdirSync(AQUI).sort()) if (/\.(mjs|json)$/.test(f)) h.update(readFileSync(join(AQUI, f)))
  return h.digest('hex')
}

/** Atualiza a worktree de controle para a base. Se o protocolo mudou, reinicia o runner. */
function atualizarControle() {
  const antes = hashScripts()
  P.buscar(CONTROLE)
  g(['checkout', '--detach', '--quiet', ORIGEM], { permitirFalha: false })
  if (hashScripts() !== antes) {
    log('protocolo (scripts/plano) mudou na base: reiniciando o runner')
    const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, VINIMON_REINICIO: '1' } })
    process.exit(r.status ?? 1)
  }
}

// ---------- escolha ----------

function escolher(st, agente, trilhas) {
  const meus = [...st.travas.values()].filter((t) => t.agente === agente)
  const prAberto = (id) => st.prs.find((p) => p.state === 'OPEN' && p.headRefName === `tarefa/${id}`)
  for (const tv of meus) {
    const pr = prAberto(tv.id)
    if (pr && (pr.labels ?? []).some((l) => l.name === 'ajustes')) return { modo: 'ajustes', id: tv.id, pr }
  }
  for (const tv of meus.filter((t) => t.estado === 'desbloqueada')) {
    const r = P.retomar(tv.id, { cwd: CONTROLE })
    if (r.ok) return { modo: 'retomada', id: tv.id, base: r.base }
    log(`não deu para retomar ${tv.id} ainda: ${r.motivo}`)
  }
  for (const tv of meus.filter((t) => t.estado === 'ativa')) if (!prAberto(tv.id)) return { modo: 'retomada', id: tv.id, base: tv.base }
  for (let i = 0; i < 4; i++) {
    const { lista, motivos } = P.elegiveis(st, agente, trilhas)
    if (!lista.length) return { espera: [...motivos].slice(0, 6).map(([id, m]) => `${id}: ${m}`) }
    const r = P.reivindicar(lista[0].id, { cwd: CONTROLE, trilhas })
    if (r.ok) return { modo: 'nova', id: r.id, base: r.base }
    log(`${lista[0].id}: ${r.motivo} — escolhendo de novo`)
    st = P.lerEstado({ cwd: CONTROLE })
  }
  return { espera: ['concorrência alta no livro-razão'] }
}

// ---------- worktree ----------

function existeBranchLocal(b) {
  return g(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], { cwd: CLONE }).ok
}

function guardarBranchLocal(b) {
  if (existeBranchLocal(b)) g(['branch', '-m', b, `backup/${b.replace('/', '-')}-${Date.now()}`], { cwd: CLONE, permitirFalha: false })
}

function prepararWorktree(esc, t) {
  const wt = wtDe(esc.id)
  const branch = `tarefa/${esc.id}`
  if (existsSync(wt)) {
    if (g(['status', '--porcelain'], { cwd: wt }).out) throw new Error(`${wt} tem alterações não commitadas: inspecione e remova à mão (git worktree remove --force)`)
    g(['worktree', 'remove', '--force', wt], { cwd: CLONE, permitirFalha: false })
  }
  g(['worktree', 'prune'], { cwd: CLONE })
  mkdirSync(WT_BASE, { recursive: true })
  const remota = g(['fetch', P.REMOTO, `+refs/heads/${branch}:refs/remotes/${P.REMOTO}/${branch}`], { cwd: CLONE }).ok
  if (remota && esc.modo === 'nova') {
    throw new Error(`a branch remota ${branch} já existe (resto de uma tentativa anterior): o coordenador deve conferir e rodar --liberar ${esc.id}, que a apaga`)
  }
  if (remota) {
    guardarBranchLocal(branch)
    g(['worktree', 'add', '-b', branch, wt, `${P.REMOTO}/${branch}`], { cwd: CLONE, permitirFalha: false })
  } else if (esc.modo !== 'nova' && existeBranchLocal(branch)) {
    g(['worktree', 'add', wt, branch], { cwd: CLONE, permitirFalha: false })
  } else {
    guardarBranchLocal(branch)
    g(['worktree', 'add', '-b', branch, wt, esc.base ?? ORIGEM], { cwd: CLONE, permitirFalha: false })
  }
  const conflitos = atualizarComBase(wt)
  for (const f of ['apps/api/.env', 'apps/web/.env']) if (existsSync(join(CLONE, f)) && !existsSync(join(wt, f)) && existsSync(dirname(join(wt, f)))) copyFileSync(join(CLONE, f), join(wt, f))
  if (existsSync(join(wt, 'package.json')) && existsSync(join(wt, 'pnpm-workspace.yaml'))) {
    const r = sh('pnpm', ['install'], { cwd: wt, timeout: 20 * 60_000 })
    if (!r.ok) throw new Error(`pnpm install falhou na worktree:\n${cauda(r.err || r.out)}`)
  }
  prepararBanco(wt, t)
  return { wt, conflitos }
}

/** `git merge origin/v2` na branch da tarefa. Resolve sozinho lockfile, rotas geradas e append-only. */
function atualizarComBase(wt) {
  const m = g(['merge', '--no-edit', ORIGEM], { cwd: wt, env: { GIT_EDITOR: 'true' } })
  if (m.ok) return []
  const conflitados = g(['diff', '--name-only', '--diff-filter=U'], { cwd: wt }).out.split('\n').filter(Boolean)
  if (!conflitados.length) throw new Error(`merge da base falhou: ${m.err || m.out}`)
  const restantes = []
  for (const f of conflitados) {
    if (f === 'pnpm-lock.yaml' || f === 'apps/web/src/routeTree.gen.ts') {
      g(['checkout', ORIGEM, '--', f], { cwd: wt, permitirFalha: false })
      g(['add', f], { cwd: wt, permitirFalha: false })
    } else if (['apps/api/src/app.ts', 'packages/shared/src/index.ts', 'apps/api/src/jobs/index.ts'].includes(f)) {
      const tmp = (n) => {
        const p = join(wt, `.git-merge-${n}`)
        writeFileSync(p, gBruto(['show', `:${n}:${f}`], wt))
        return p
      }
      const [b, o, th] = [tmp(1), tmp(2), tmp(3)]
      writeFileSync(join(wt, f), gBruto(['merge-file', '--union', '-p', o, b, th], wt))
      for (const x of [b, o, th]) rmSync(x, { force: true })
      g(['add', f], { cwd: wt, permitirFalha: false })
    } else restantes.push(f)
  }
  if (!restantes.length) g(['commit', '--no-edit', '-m', 'merge da base (conflitos gerados resolvidos pelo runner)'], { cwd: wt, permitirFalha: false, env: { GIT_EDITOR: 'true' } })
  return restantes
}

function scriptsDe(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts ?? {}
  } catch {
    return {}
  }
}

function prepararBanco(wt, t) {
  if (!existsSync(join(wt, 'docker-compose.yml'))) return
  const up = sh('docker', ['compose', 'up', '-d', '--wait'], { cwd: wt, timeout: 5 * 60_000, env: { COMPOSE_PROJECT_NAME: 'vinimon' } })
  if (!up.ok) throw new Error(`docker compose up falhou: ${cauda(up.err)}`)
  const api = scriptsDe(join(wt, 'apps/api'))
  for (const s of ['db:teste:recriar', ...(t.tocaSchema ? ['db:dev:recriar'] : [])]) {
    if (!api[s]) continue
    const r = sh('pnpm', ['-F', '@vinimon/api', s], { cwd: wt, timeout: 10 * 60_000, env: { COMPOSE_PROJECT_NAME: 'vinimon' } })
    if (!r.ok) throw new Error(`${s} falhou: ${cauda(r.err || r.out)}`)
  }
}

// ---------- prompt e modelo ----------

function montarPrompt(t, modo, extras = {}) {
  const tpl = readFileSync(join(CONTROLE, 'docs/plano/execucao/prompts/executor.md'), 'utf8')
  const corpo = tpl.split('<!-- PROMPT -->')[1] ?? tpl
  const trechos = P.trechosCitados(t, { cwd: CONTROLE })
  const vals = {
    ID: t.id,
    FASE: String(t.fase).padStart(2, '0'),
    TITULO: t.titulo,
    MODO: modo,
    ARQUIVO_CARTAO: `${t.arquivo} (linhas ${t.linhas[0]}–${t.linhas[1]})`,
    CARTAO: t.texto,
    ARQUIVOS: t.arquivos.map((a) => `- ${a}`).join('\n'),
    TRECHOS: trechos.map((x) => `- ${x.ref}: ${x.arquivo}${x.de ? ` (linhas ${x.de}–${x.ate})` : ''}`).join('\n') || '- (nenhum)',
    EXTRA: extras.texto ?? '(nenhum)',
  }
  return corpo.replace(/\{\{(\w+)\}\}/g, (_, k) => vals[k] ?? `{{${k}}}`).trim()
}

const modeloCli = (m) => process.env[`VINIMON_MODELO_${m.toUpperCase()}`] ?? m.toLowerCase()
const orcamento = (m) => process.env[`VINIMON_ORCAMENTO_${m.toUpperCase()}`] ?? { Haiku: '3', Sonnet: '10', Opus: '30' }[m]
const noMinimo = (m, min) => ORDEM_MODELO[Math.max(ORDEM_MODELO.indexOf(m), ORDEM_MODELO.indexOf(min))]

/** Allow/deny do executor. Um deny de pasta (ex.: Write(docs/plano/**)) cai se o próprio cartão lista arquivo nela. */
function lerSettings(t) {
  const s = JSON.parse(readFileSync(join(AQUI, 'executor-settings.json'), 'utf8'))
  const deny = (s.permissions?.deny ?? []).filter((r) => {
    const m = r.match(/^(?:Edit|Write)\((.+)\/\*\*\)$/)
    return !(m && t.arquivos.some((a) => a.startsWith(`${m[1]}/`)))
  })
  return { allow: s.permissions?.allow ?? [], deny }
}

/** Roda `claude -p` num grupo de processos próprio, com teto de tempo; mata o grupo ao fim. */
function rodarModelo({ wt, prompt, modelo, t }) {
  const id = t.id
  const { allow, deny } = lerSettings(t)
  const arqSettings = join(DADOS, 'tmp', `${id}-settings.json`)
  mkdirSync(dirname(arqSettings), { recursive: true })
  writeFileSync(arqSettings, JSON.stringify({ permissions: { allow, deny } }, null, 2))
  const args = [
    '-p',
    prompt,
    '--model',
    modeloCli(modelo),
    '--permission-mode',
    'dontAsk',
    '--setting-sources',
    'project',
    '--settings',
    arqSettings,
    '--strict-mcp-config',
    '--max-budget-usd',
    String(orcamento(modelo)),
    '--output-format',
    'json',
    '--json-schema',
    RESULTADO_SCHEMA,
    '--allowedTools',
    ...allow,
    '--disallowedTools',
    ...deny,
  ]
  const env = {
    ...process.env,
    GH_PROMPT_DISABLED: '1',
    GIT_EDITOR: 'true',
    GIT_TERMINAL_PROMPT: '0',
    COMPOSE_PROJECT_NAME: 'vinimon',
    VINIMON_TAREFA: id,
  }
  const limiteMs = Number(process.env.VINIMON_TEMPO_MAX_MIN ?? 120) * 60_000
  return new Promise((ok) => {
    const filho = spawn(process.env.VINIMON_CLAUDE ?? 'claude', args, { cwd: wt, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    filho.stdout.on('data', (d) => (out += d))
    filho.stderr.on('data', (d) => (err += d))
    const relogio = setTimeout(() => {
      err += '\n[runner] tempo máximo atingido'
      matarGrupo(filho.pid)
    }, limiteMs)
    filho.on('close', (code) => {
      clearTimeout(relogio)
      matarGrupo(filho.pid)
      liberarPortas(wt)
      ok({ code, out, err })
    })
  })
}

function matarGrupo(pid) {
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {}
}

/** Mata processos ouvindo nas portas do projeto cujo diretório atual está dentro da worktree. */
function liberarPortas(wt) {
  for (const porta of PORTAS) {
    const r = sh('lsof', ['-t', `-iTCP:${porta}`, '-sTCP:LISTEN'])
    for (const pid of r.out.split('\n').filter(Boolean).map(Number)) {
      let cwd = ''
      try {
        cwd = readlinkSync(`/proc/${pid}/cwd`)
      } catch {
        cwd = sh('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']).out.split('\n').find((l) => l.startsWith('n'))?.slice(1) ?? ''
      }
      if (cwd.startsWith(wt)) {
        try {
          process.kill(pid, 'SIGTERM')
        } catch {}
      }
    }
  }
}

function interpretar(saida) {
  let j
  try {
    j = JSON.parse(saida.out)
  } catch {
    return { erro: `saída do claude não é JSON (código ${saida.code}): ${cauda(saida.err || saida.out, 15)}` }
  }
  if (/budget|max_turns/i.test(String(j.subtype ?? ''))) {
    return { resultado: 'BLOQUEADO', motivo: `limite de ${/budget/i.test(j.subtype) ? 'orçamento' : 'turnos'} atingido (${j.subtype}): escalar o modelo ou dividir o cartão`, evidencias: [], custo: j.total_cost_usd, bruto: j }
  }
  if (saida.code !== 0 || j.is_error) return { erro: `claude terminou com erro (${j.subtype ?? saida.code}): ${cauda(j.result ?? saida.err, 15)}`, bruto: j }
  let r = j.structured_output
  if (!r && typeof j.result === 'string') {
    try {
      r = JSON.parse(j.result)
    } catch {
      const m = j.result.match(/\b(PRONTO|BLOQUEADO)\b[:\s-]*(.*)$/m)
      if (m) r = { resultado: m[1], motivo: m[2] ?? '', evidencias: [] }
    }
  }
  if (!r || !['PRONTO', 'BLOQUEADO'].includes(r.resultado)) return { erro: 'resultado ausente ou fora do formato', bruto: j }
  return { ...r, custo: j.total_cost_usd, sessao: j.session_id, bruto: j }
}

// ---------- verificação do runner ----------

function verificar(t, wt) {
  const falhas = []
  const meus = g(['log', '--format=%s', `${ORIGEM}..HEAD`], { cwd: wt }).out.split('\n')
  if (!meus.some((s) => s.startsWith(`${t.id}: `))) falhas.push(`nenhum commit "${t.id}: …" na branch`)
  const sujo = g(['status', '--porcelain'], { cwd: wt }).out
  if (sujo) falhas.push(`alterações não commitadas:\n${cauda(sujo, 20)}`)
  if (scriptsDe(wt).verificar) {
    const r = sh('pnpm', ['verificar'], { cwd: wt, timeout: 45 * 60_000, env: { COMPOSE_PROJECT_NAME: 'vinimon' } })
    if (!r.ok) falhas.push(`pnpm verificar vermelho:\n${cauda(`${r.out}\n${r.err}`, 40)}`)
  }
  falhas.push(...P.conferir(t, { repo: wt, base: ORIGEM }).map((v) => `escopo: ${v}`))
  return falhas
}

// ---------- publicação ----------

function corpoPR(t, res, falhas = []) {
  return [
    `Tarefa **${t.id} — ${t.titulo}** (${t.arquivo}, linhas ${t.linhas[0]}–${t.linhas[1]}).`,
    `Trilha ${t.trilha} · Modelo ${res.modelo ?? t.modelo} · agente \`${process.env.VINIMON_AGENTE}\``,
    '',
    '### Evidências do executor',
    ...(res.evidencias?.length ? res.evidencias.map((e) => `- ${e}`) : ['- (nenhuma informada)']),
    '',
    '### Conferência do runner',
    falhas.length ? falhas.map((f) => `- ${f}`).join('\n') : '- commit presente, árvore limpa, `pnpm verificar` verde (quando existe) e diff dentro dos arquivos do cartão.',
    '',
    `Revisão: \`docs/plano/execucao/prompts/revisao-pr.md\`.`,
  ].join('\n')
}

function publicar(t, wt, res, esc) {
  const branch = `tarefa/${t.id}`
  let p = g(['push', P.REMOTO, `HEAD:refs/heads/${branch}`], { cwd: wt })
  if (!p.ok) {
    const pull = g(['pull', '--no-rebase', '--no-edit', P.REMOTO, branch], { cwd: wt, env: { GIT_EDITOR: 'true' } })
    if (!pull.ok) throw new Error(`push recusado e pull falhou: ${pull.err}`)
    p = g(['push', P.REMOTO, `HEAD:refs/heads/${branch}`], { cwd: wt })
    if (!p.ok) throw new Error(`push falhou: ${p.err}`)
  }
  const corpo = join(DADOS, 'tmp', `${t.id}-pr.md`)
  mkdirSync(dirname(corpo), { recursive: true })
  writeFileSync(corpo, corpoPR(t, res))
  const aberto = ghc(['pr', 'list', '--head', branch, '--base', P.BASE, '--state', 'open', '--json', 'number'], { json: true })
  if (aberto?.length) {
    const n = String(aberto[0].number)
    ghc(['pr', 'comment', n, '--body-file', corpo])
    if (esc.modo === 'ajustes') ghc(['pr', 'edit', n, '--remove-label', 'ajustes'], { permitirFalha: true })
  } else {
    ghc(['pr', 'create', '--base', P.BASE, '--head', branch, '--title', `${t.id}: ${t.titulo}`, '--body-file', corpo])
  }
  const v = ghc(['pr', 'view', branch, '--json', 'state,baseRefName,headRefName,title,url'], { json: true })
  if (v.state !== 'OPEN' || v.baseRefName !== P.BASE || !v.title.startsWith(`${t.id}: `)) throw new Error(`PR não confere com o esperado: ${JSON.stringify(v)}`)
  // O próprio executor faz o merge: auto-merge por squash, que só entra quando os checks obrigatórios (protocolo, verificar) passam.
  const m = ghc(['pr', 'merge', branch, '--squash', '--auto'], { permitirFalha: true })
  if (m === null) log(`aviso: não consegui ligar o auto-merge de ${branch}; faça o merge pelo GitHub quando o CI ficar verde`)
  return v.url
}

function registrarBloqueio(t, wt, motivo, evidencias = []) {
  const quando = new Date().toISOString().replace(/[:.]/g, '-')
  mkdirSync(join(DADOS, 'wip'), { recursive: true })
  const patch = join(DADOS, 'wip', `${t.id}-${quando}.patch`)
  if (existsSync(wt)) {
    const diff = g(['diff', ORIGEM], { cwd: wt }).out
    const novos = g(['ls-files', '--others', '--exclude-standard'], { cwd: wt }).out
    writeFileSync(patch, `${diff}\n\n# arquivos novos não rastreados:\n${novos}\n`)
  }
  const corpo = join(DADOS, 'tmp', `${t.id}-issue.md`)
  mkdirSync(dirname(corpo), { recursive: true })
  writeFileSync(
    corpo,
    [
      `**${t.id} — ${t.titulo}** (${t.arquivo}) · Modelo ${t.modelo} · agente \`${process.env.VINIMON_AGENTE}\``,
      '',
      `**Motivo:** ${motivo}`,
      '',
      '**Evidências:**',
      ...(evidencias.length ? evidencias.map((e) => `- ${e}`) : ['- (nenhuma)']),
      '',
      `Patch do trabalho parcial na máquina do executor: \`${patch}\`.`,
      'Coordenador: siga `docs/plano/execucao/prompts/desbloqueio.md`.',
    ].join('\n'),
  )
  const url = ghc(['issue', 'create', '--title', `BLOQUEADO ${t.id}: ${motivo.replace(/\s+/g, ' ').slice(0, 90)}`, '--label', 'bloqueado', '--body-file', corpo])
  const num = url.match(/\/issues\/(\d+)/)?.[1] ?? url
  const r = P.bloquear(t.id, `#${num}`, { cwd: CONTROLE })
  if (!r.ok) throw new Error(`não consegui registrar o bloqueio: ${r.motivo}`)
  return url
}

function limparWorktree(id) {
  const wt = wtDe(id)
  if (existsSync(wt)) g(['worktree', 'remove', '--force', wt], { cwd: CLONE })
  g(['worktree', 'prune'], { cwd: CLONE })
  if (existeBranchLocal(`tarefa/${id}`)) g(['branch', '-D', `tarefa/${id}`], { cwd: CLONE })
}

// ---------- execução de uma tarefa ----------

async function executar(esc, st) {
  const t = st.tarefas.get(esc.id)
  log(`${t.id} (${esc.modo}) — ${t.titulo} · modelo ${t.modelo}`)
  const { wt, conflitos } = prepararWorktree(esc, t)
  let extra = ''
  let modo = esc.modo
  let modelo = t.modelo
  if (esc.modo === 'ajustes') {
    const c = ghc(['pr', 'view', String(esc.pr.number), '--json', 'comments,reviews'], { json: true })
    const textos = [...(c.reviews ?? []), ...(c.comments ?? [])].map((x) => `- ${x.author?.login ?? '?'}: ${x.body}`).slice(-15)
    extra = `Pedidos de ajuste no PR #${esc.pr.number} (corrija só os itens numerados do coordenador):\n${textos.join('\n')}`
  }
  if (conflitos.length) {
    modo = 'conflito'
    modelo = noMinimo(modelo, 'Sonnet')
    extra += `\nO merge da ${ORIGEM} na sua branch deixou conflitos em:\n${conflitos.map((f) => `- ${f}`).join('\n')}\nResolva os marcadores <<<<<<< ======= >>>>>>> preservando o trabalho da base E o da tarefa, depois \`git add\` desses arquivos e \`git commit -m "${t.id}: resolve conflito com a base"\`.`
  }
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const prompt = montarPrompt(t, modo, { texto: extra })
    const saida = await rodarModelo({ wt, prompt, modelo, t })
    const quando = new Date().toISOString().replace(/[:.]/g, '-')
    mkdirSync(join(DADOS, 'logs'), { recursive: true })
    writeFileSync(join(DADOS, 'logs', `${t.id}-${quando}.json`), JSON.stringify({ modo, modelo, code: saida.code, stdout: saida.out, stderr: cauda(saida.err, 200) }, null, 2))
    const r = interpretar(saida)
    if (r.erro) return { tipo: 'erro', motivo: r.erro, wt }
    log(`${t.id}: modelo respondeu ${r.resultado}${r.custo ? ` (US$ ${Number(r.custo).toFixed(2)})` : ''}`)
    if (r.resultado === 'BLOQUEADO') {
      const url = registrarBloqueio(t, wt, r.motivo, r.evidencias)
      limparWorktree(t.id)
      return { tipo: 'bloqueado', motivo: r.motivo, url }
    }
    const falhas = verificar(t, wt)
    if (!falhas.length) {
      const url = publicar(t, wt, { ...r, modelo }, esc)
      limparWorktree(t.id)
      return { tipo: 'pr', url }
    }
    log(`${t.id}: conferência do runner reprovou (${falhas.length}); ${tentativa === 0 ? 'uma tentativa de correção' : 'desistindo'}`)
    modo = 'correcao'
    extra = `O runner reprovou a entrega. Corrija SÓ isto (sem sair da lista de arquivos) e faça commit "${t.id}: …":\n${falhas.map((f) => `- ${f}`).join('\n')}`
    if (tentativa === 1) {
      const url = registrarBloqueio(t, wt, 'conferência do runner reprovou após PRONTO', falhas)
      limparWorktree(t.id)
      return { tipo: 'bloqueado', motivo: 'conferência do runner reprovou', url }
    }
  }
  return { tipo: 'erro', motivo: 'inalcançável' }
}

// ---------- modos ----------

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

async function laco(o) {
  const trilhas = P.trilhasDe(o.trilha)
  if (!trilhas.length || trilhas.some((x) => !['A', 'W', 'C'].includes(x))) throw new Error('--trilha A, W, C ou A,W')
  const agente = P.agenteAtual()
  const esperaS = Number(process.env.VINIMON_ESPERA_S ?? 600)
  const limiteEspera = Date.now() + Number(o['espera-max-h'] ?? 8) * 3_600_000
  let bloqueiosSeguidos = 0
  for (;;) {
    atualizarControle()
    const st = P.lerEstado({ cwd: CONTROLE })
    for (const a of st.anomalias.slice(0, 5)) log(`! ${a}`)
    const esc = escolher(st, agente, trilhas)
    if (esc.espera) {
      log(`nada elegível para ${trilhas.join(',')}:\n  ${esc.espera.join('\n  ')}`)
      if (o.uma || Date.now() > limiteEspera) return 3
      await new Promise((r) => setTimeout(r, esperaS * 1000))
      continue
    }
    if (o.interativo) return interativo(esc, st)
    const r = await executar(esc, P.lerEstado({ cwd: CONTROLE, semFetch: true }))
    if (r.tipo === 'pr') {
      bloqueiosSeguidos = 0
      log(`PR: ${r.url}`)
    } else if (r.tipo === 'bloqueado') {
      bloqueiosSeguidos++
      log(`BLOQUEADO: ${r.motivo} (${r.url})`)
      if (bloqueiosSeguidos >= 2) {
        log('dois BLOQUEADO seguidos: parando para revisão humana')
        return 4
      }
    } else {
      log(`ERRO: ${r.motivo}\nA trava continua; a worktree ficou em ${r.wt ?? '?'} para inspeção. Parando.`)
      return 5
    }
    if (o.uma) return 0
  }
}

function interativo(esc, st) {
  const t = st.tarefas.get(esc.id)
  const { wt, conflitos } = prepararWorktree(esc, t)
  const extra = conflitos.length ? `Conflitos de merge com a base em: ${conflitos.join(', ')} — resolva e faça commit "${t.id}: resolve conflito com a base".` : ''
  const arq = join(DADOS, 'prompts', `${t.id}.md`)
  mkdirSync(dirname(arq), { recursive: true })
  writeFileSync(arq, montarPrompt(t, esc.modo, { texto: extra }))
  console.log(`
Tarefa ${t.id} travada para ${process.env.VINIMON_AGENTE} (${esc.modo}). Worktree pronta.

  cd ${wt}
  claude --model ${modeloCli(t.modelo)}

Na sessão, digite:  Leia ${arq} e execute exatamente o que ele pede.

Quando o modelo terminar:
  node ${join(AQUI, 'rodar.mjs')} --finalizar ${t.id}
  node ${join(AQUI, 'rodar.mjs')} --finalizar ${t.id} --bloqueado "<motivo>"   (se ele responder BLOQUEADO)
`)
  return 0
}

function finalizar(o) {
  const id = o.finalizar
  P.agenteAtual()
  P.buscar(CONTROLE)
  const st = P.lerEstado({ cwd: CONTROLE })
  const t = st.tarefas.get(id)
  const tv = st.travas.get(id)
  if (!t || !tv || tv.agente !== process.env.VINIMON_AGENTE) throw new Error(`${id} não é uma trava sua`)
  const wt = wtDe(id)
  if (!existsSync(wt)) throw new Error(`worktree ${wt} não existe`)
  if (o.bloqueado) {
    const url = registrarBloqueio(t, wt, String(o.bloqueado))
    limparWorktree(id)
    console.log(`bloqueio registrado: ${url}`)
    return 0
  }
  const falhas = verificar(t, wt)
  if (falhas.length) {
    console.error(`conferência reprovou; corrija na sessão e rode --finalizar de novo:\n${falhas.map((f) => `- ${f}`).join('\n')}`)
    return 1
  }
  const pr = st.prs.find((p) => p.state === 'OPEN' && p.headRefName === `tarefa/${id}`)
  const url = publicar(t, wt, { evidencias: ['execução interativa acompanhada por humano'] }, { modo: pr && (pr.labels ?? []).some((l) => l.name === 'ajustes') ? 'ajustes' : 'nova' })
  limparWorktree(id)
  console.log(`PR: ${url}`)
  return 0
}

async function principal() {
  const o = lerArgs(process.argv.slice(2))
  if (o.finalizar) return finalizar(o)
  const { erros, avisos } = preflight({ interativo: Boolean(o.interativo) })
  for (const a of avisos) log(`aviso: ${a}`)
  if (erros.length) {
    console.error(`preflight reprovado:\n${erros.map((e) => `- ${e}`).join('\n')}`)
    return 2
  }
  if (!process.env.VINIMON_REINICIO) travarLocal()
  return laco(o)
}

principal().then(
  (c) => process.exit(c ?? 0),
  (e) => {
    console.error(`erro: ${e.message}`)
    process.exit(2)
  },
)
