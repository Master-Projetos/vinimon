#!/usr/bin/env node
// Simulação do protocolo multi-conta num ambiente falso: um repositório bare como "origin",
// três clones (agentes A, W e C) e stubs de `gh` e `claude` no PATH. Prova que as travas não
// colidem, inclusive com processos concorrentes de verdade.
//
//   node scripts/plano/teste/simular.mjs [--repeticoes 30] [--manter]
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(AQUI, '../../..')
const args = process.argv.slice(2)
const REPETICOES = Number(args[args.indexOf('--repeticoes') + 1]) || 30
const MANTER = args.includes('--manter')
const RAIZ = mkdtempSync(join(tmpdir(), 'vinimon-sim-'))
const BIN = join(RAIZ, 'bin')
const ESTADO_GH = join(RAIZ, 'estado-gh.json')
const ORIGEM = join(RAIZ, 'origin.git')
let falhas = 0
let ok = 0

// ---------- utilitários ----------

function run(cmd, a, { cwd = RAIZ, env = {}, permitirFalha = false, entrada } = {}) {
  const r = spawnSync(cmd, a, { cwd, encoding: 'utf8', input: entrada, env: { ...process.env, ...ENV_BASE, ...env }, maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0 && !permitirFalha) throw new Error(`${cmd} ${a.join(' ')} (${cwd}):\n${r.stderr}\n${r.stdout}`)
  return { ok: r.status === 0, code: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}
const git = (cwd, a, o = {}) => run('git', a, { cwd, ...o })
const ENV_BASE = {
  PATH: `${BIN}:${process.env.PATH}`,
  SIM_GH_ESTADO: ESTADO_GH,
  GIT_AUTHOR_NAME: 'sim',
  GIT_AUTHOR_EMAIL: 'sim@x',
  GIT_COMMITTER_NAME: 'sim',
  GIT_COMMITTER_EMAIL: 'sim@x',
  VINIMON_DADOS: join(RAIZ, 'dados'),
  GIT_CONFIG_GLOBAL: join(RAIZ, 'gitconfig'),
}
function checar(nome, cond, detalhe = '') {
  if (cond) {
    ok++
    console.log(`  ✓ ${nome}`)
  } else {
    falhas++
    console.log(`  ✗ ${nome}${detalhe ? `\n      ${detalhe}` : ''}`)
  }
}
const lerGh = () => JSON.parse(readFileSync(ESTADO_GH, 'utf8'))
const gravarGh = (e) => writeFileSync(ESTADO_GH, JSON.stringify(e, null, 2))
const proxima = (clone, a, env = {}) => run('node', [join(SEMENTE, 'scripts/plano/proxima.mjs'), ...a], { cwd: clone, env, permitirFalha: true })

function proximaAsync(clone, agente, a, env = {}) {
  return new Promise((ok) => {
    const p = spawn('node', [join(SEMENTE, 'scripts/plano/proxima.mjs'), ...a], {
      cwd: clone,
      env: { ...process.env, ...ENV_BASE, VINIMON_AGENTE: agente, ...env },
    })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => ok({ code, out: out.trim(), err: err.trim(), agente }))
  })
}

// ---------- stubs ----------

function criarStubs() {
  mkdirSync(BIN, { recursive: true })
  writeFileSync(
    join(BIN, 'gh'),
    `#!/usr/bin/env node
const fs = require('fs')
const f = process.env.SIM_GH_ESTADO
const e = JSON.parse(fs.readFileSync(f, 'utf8'))
const a = process.argv.slice(2)
const salvar = () => fs.writeFileSync(f, JSON.stringify(e, null, 2))
const op = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined }
const s = a.slice(0, 2).join(' ')
if (s === 'auth status') { console.log('Logged in · Token scopes: repo, workflow'); process.exit(0) }
if (s === 'run list') { console.log(JSON.stringify(e.runs ?? [])); process.exit(0) }
if (s === 'pr list') {
  let l = e.prs
  if (op('--head')) l = l.filter((p) => p.headRefName === op('--head'))
  if (op('--state') === 'open') l = l.filter((p) => p.state === 'OPEN')
  console.log(JSON.stringify(l)); process.exit(0)
}
if (s === 'pr create') {
  const n = 100 + e.prs.length
  e.prs.push({ number: n, headRefName: op('--head'), title: op('--title'), state: 'OPEN', labels: [], isDraft: false, mergeStateStatus: 'CLEAN', url: 'https://x/pull/' + n, baseRefName: op('--base') })
  salvar(); console.log('https://x/pull/' + n); process.exit(0)
}
if (s === 'pr view') {
  const alvo = a[2]
  const p = e.prs.find((x) => x.headRefName === alvo || String(x.number) === alvo)
  if (!p) process.exit(1)
  console.log(JSON.stringify({ ...p, comments: [], reviews: [] })); process.exit(0)
}
if (s === 'pr comment' || s === 'pr edit') process.exit(0)
if (s === 'issue create') { e.issues = (e.issues ?? 0) + 1; salvar(); console.log('https://x/issues/' + e.issues); process.exit(0) }
console.error('gh falso: comando não suportado: ' + a.join(' ')); process.exit(1)
`,
  )
  writeFileSync(
    join(BIN, 'claude'),
    `#!/usr/bin/env node
const { execFileSync } = require('child_process')
const fs = require('fs')
const a = process.argv.slice(2)
if (a[0] === '--version') { console.log('9.9.9 (sim)'); process.exit(0) }
if (a[0] === '--help') { console.log('--permission-mode (choices: "dontAsk") --allowedTools --disallowedTools --settings --setting-sources --max-budget-usd --output-format --json-schema --strict-mcp-config'); process.exit(0) }
if (a[0] === 'auth') process.exit(0)
const modo = process.env.SIM_CLAUDE_MODO || 'pronto'
const id = process.env.VINIMON_TAREFA
const permissoes = a.includes('dontAsk') && a.includes('--allowedTools') && a.includes('--disallowedTools')
if (!permissoes) { console.log(JSON.stringify({ type: 'result', is_error: true, subtype: 'error', result: 'sem flags de permissão' })); process.exit(1) }
if (modo === 'pronto' || modo === 'fora') {
  const alvo = modo === 'fora' ? 'arquivo-fora-da-lista.txt' : process.env.SIM_ARQUIVO
  fs.appendFileSync(alvo, 'alterado pela simulação\\n')
  execFileSync('git', ['add', alvo]); execFileSync('git', ['commit', '-m', id + ': simulação'])
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0.01, structured_output: { resultado: 'PRONTO', motivo: '', evidencias: ['simulado'] } }))
} else {
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok', structured_output: { resultado: 'BLOQUEADO', motivo: 'simulação de bloqueio', evidencias: ['x'] } }))
}
`,
  )
  chmodSync(join(BIN, 'gh'), 0o755)
  chmodSync(join(BIN, 'claude'), 0o755)
}

// ---------- ambiente ----------

let SEMENTE
const CLONES = {}

function montar() {
  Object.assign(process.env, ENV_BASE)
  writeFileSync(join(RAIZ, 'gitconfig'), '[init]\n\tdefaultBranch = main\n[advice]\n\tdetachedHead = false\n')
  criarStubs()
  gravarGh({ prs: [], runs: [], issues: 0 })
  git(RAIZ, ['init', '--bare', '-q', ORIGEM])
  SEMENTE = join(RAIZ, 'semente')
  mkdirSync(SEMENTE)
  git(SEMENTE, ['init', '-q', '-b', 'v2'])
  cpSync(join(REPO, 'docs/plano'), join(SEMENTE, 'docs/plano'), { recursive: true })
  cpSync(join(REPO, 'scripts/plano'), join(SEMENTE, 'scripts/plano'), { recursive: true })
  writeFileSync(join(SEMENTE, '.gitignore'), 'node_modules\n')
  git(SEMENTE, ['add', '.'])
  git(SEMENTE, ['commit', '-q', '-m', 'docs: plano (semente da simulação)'])
  git(SEMENTE, ['remote', 'add', 'origin', ORIGEM])
  git(SEMENTE, ['push', '-q', 'origin', 'v2'])
  zerarLivro()
  for (const ag of ['a', 'w', 'c']) {
    const c = join(RAIZ, `clone-${ag}`)
    git(RAIZ, ['clone', '-q', '-b', 'v2', ORIGEM, c])
    git(c, ['fetch', '-q', 'origin', '+refs/heads/controle/travas:refs/remotes/origin/controle/travas'])
    CLONES[ag] = c
  }
}

function zerarLivro() {
  const vazia = git(SEMENTE, ['mktree'], { entrada: '' }).out
  const raiz = git(SEMENTE, ['commit-tree', vazia, '-m', 'travas: início']).out
  git(SEMENTE, ['push', '-q', '-f', 'origin', `${raiz}:refs/heads/controle/travas`])
}

/** "Mergeia" tarefas: commit na v2 com o título do squash + PR MERGED no gh falso. */
function concluir(ids, { semPR = false } = {}) {
  git(SEMENTE, ['fetch', '-q', 'origin', 'v2'])
  git(SEMENTE, ['reset', '-q', '--hard', 'origin/v2'])
  const e = lerGh()
  for (const id of ids) {
    git(SEMENTE, ['commit', '-q', '--allow-empty', '-m', `${id}: concluída na simulação (#${e.prs.length + 1})`])
    if (!semPR) e.prs.push({ number: e.prs.length + 1, headRefName: `tarefa/${id}`, title: `${id}: x`, state: 'MERGED', labels: [] })
  }
  gravarGh(e)
  git(SEMENTE, ['push', '-q', 'origin', 'HEAD:v2'])
}
function commitBase(msg) {
  git(SEMENTE, ['fetch', '-q', 'origin', 'v2'])
  git(SEMENTE, ['reset', '-q', '--hard', 'origin/v2'])
  git(SEMENTE, ['commit', '-q', '--allow-empty', '-m', msg])
  git(SEMENTE, ['push', '-q', 'origin', 'HEAD:v2'])
}
function reiniciarBase() {
  // volta a v2 para a semente e zera o estado do gh e o livro-razão
  const raiz = git(SEMENTE, ['rev-list', '--max-parents=0', 'HEAD']).out.split('\n')[0]
  git(SEMENTE, ['push', '-q', '-f', 'origin', `${raiz}:refs/heads/v2`])
  git(SEMENTE, ['reset', '-q', '--hard', raiz])
  gravarGh({ prs: [], runs: [], issues: 0 })
  zerarLivro()
}

async function estado(clone) {
  const { lerEstado } = await import(join(SEMENTE, 'scripts/plano/proxima.mjs'))
  return lerEstado({ cwd: clone })
}

// ---------- cenários ----------

async function cenarioMesmaTarefa() {
  console.log(`\n1. Mesma tarefa reivindicada ao mesmo tempo por 3 agentes (${REPETICOES} repetições)`)
  let vitoriasErradas = 0
  for (let i = 0; i < REPETICOES; i++) {
    zerarLivro()
    const rs = await Promise.all(['a', 'w', 'c'].map((ag) => proximaAsync(CLONES[ag], `sim-${ag}`, ['--reivindicar', 'T-0.1'])))
    const venceu = rs.filter((r) => r.code === 0).length
    if (venceu !== 1) vitoriasErradas++
  }
  checar('exatamente um vencedor em todas as repetições', vitoriasErradas === 0, `${vitoriasErradas} repetições com ≠ 1 vencedor`)
}

function acharPar(st, filtro) {
  const ts = [...st.tarefas.values()]
  return import(join(SEMENTE, 'scripts/plano/grafo.mjs')).then(({ cruzamento }) => {
    for (const x of ts)
      for (const y of ts) {
        if (x.id >= y.id || !filtro(x, y)) continue
        if (cruzamento(x, y).length) return [x, y]
      }
    return null
  })
}

async function cenarioParesConflitantes() {
  console.log(`\n2. Pares de tarefas com arquivo ou schema em comum, ambas elegíveis, reivindicadas ao mesmo tempo por agentes diferentes (${REPETICOES} repetições)`)
  reiniciarBase()
  const st0 = await estado(CLONES.a)
  const mvp = [...st0.tarefas.values()].filter((t) => t.fase <= 11).map((t) => t.id)
  concluir(mvp)
  commitBase('portão: MVP (simulação)')
  const st = await estado(CLONES.a)
  const elegivel = (t) => !st.concluidas.has(t.id) && t.deps.every((d) => st.concluidas.has(d)) && t.portoes.every((p) => st.portoes.has(p))
  const parSchema = await acharPar(st, (x, y) => x.tocaSchema && y.tocaSchema && elegivel(x) && elegivel(y))
  const parArq = await acharPar(st, (x, y) => !(x.tocaSchema && y.tocaSchema) && elegivel(x) && elegivel(y))
  checar('existe par concorrente com trava de schema', Boolean(parSchema), '')
  checar('existe par concorrente com arquivo em comum (sem schema)', Boolean(parArq), '')
  for (const par of [parSchema, parArq].filter(Boolean)) {
    const [x, y] = par
    let erradas = 0
    for (let i = 0; i < REPETICOES; i++) {
      zerarLivro()
      const rs = await Promise.all([
        proximaAsync(CLONES.a, 'sim-a', ['--reivindicar', x.id]),
        proximaAsync(CLONES.c, 'sim-c', ['--reivindicar', y.id]),
      ])
      if (rs.filter((r) => r.code === 0).length !== 1) erradas++
    }
    checar(`${x.id} (${x.trilha}) × ${y.id} (${y.trilha}): só um trava por vez`, erradas === 0, `${erradas} repetições com 0 ou 2 vencedores`)
  }
  return { parSchema }
}

async function cenarioAtrasoAssimetrico(par) {
  console.log('\n3. Atraso assimétrico: o primeiro a ler é o último a gravar')
  if (!par) return checar('par disponível', false)
  const [x, y] = par
  zerarLivro()
  const lento = proximaAsync(CLONES.a, 'sim-a', ['--reivindicar', x.id], { VINIMON_SIM_ATRASO_MS: '2500' })
  await new Promise((r) => setTimeout(r, 400))
  const rapido = await proximaAsync(CLONES.c, 'sim-c', ['--reivindicar', y.id])
  const rl = await lento
  checar('o rápido vence', rapido.code === 0, rapido.out + rapido.err)
  checar('o lento perde ao revalidar (push recusado → relê → conflito)', rl.code === 3 && /travados|schema/.test(rl.out), rl.out + rl.err)
}

async function cenarioDependencias() {
  console.log('\n4. Dependências, portão MVP, revert e falha fechada')
  reiniciarBase()
  let r = proxima(CLONES.a, ['--trilha', 'A', '--json'], { VINIMON_AGENTE: 'sim-a' })
  const j = JSON.parse(r.out)
  checar('com nada concluído, a única elegível da trilha A é T-0.1', j.id === 'T-0.1', r.out)
  const st = await estado(CLONES.a)
  const { elegiveis } = await import(join(SEMENTE, 'scripts/plano/proxima.mjs'))
  for (const tr of ['A', 'W', 'C']) {
    const { lista } = elegiveis(st, 'sim-x', [tr])
    checar(`trilha ${tr}: toda elegível tem as dependências concluídas`, lista.every((t) => t.deps.every((d) => st.concluidas.has(d))))
  }
  const mvp = [...st.tarefas.values()].filter((t) => t.fase <= 11).map((t) => t.id)
  concluir(mvp)
  let st2 = await estado(CLONES.a)
  const f2 = elegiveis(st2, 'sim-x', ['A']).lista.filter((t) => t.fase >= 12)
  checar('sem "portão: MVP", nenhuma tarefa da Fase 2 é elegível', f2.length === 0, f2.map((t) => t.id).join(' '))
  commitBase('portão: MVP (simulação)')
  st2 = await estado(CLONES.a)
  checar('com o portão, a Fase 2 abre', elegiveis(st2, 'sim-x', ['A']).lista.some((t) => t.fase >= 12))
  commitBase('Revert "T-11.12: concluída na simulação (#147)"')
  st2 = await estado(CLONES.a)
  checar('revert desfaz a conclusão (T-11.12 volta a pendente)', !st2.concluidas.has('T-11.12'))
  checar('…e as tarefas que dependem de "MVP" voltam a esperar', elegiveis(st2, 'sim-x', ['A']).lista.every((t) => t.fase < 12))
  reiniciarBase()
  concluir(['T-0.1'], { semPR: true })
  st2 = await estado(CLONES.a)
  checar('commit "T-0.1:" sem PR mergeado de tarefa/T-0.1 não conta (falha fechada)', !st2.concluidas.has('T-0.1') && st2.anomalias.some((a) => /T-0.1/.test(a)))
}

async function cenarioBloqueioELimite(par) {
  console.log('\n5. Bloqueio libera os arquivos; retomada revalida; limite de 2 por agente')
  reiniciarBase()
  const st0 = await estado(CLONES.a)
  concluir([...st0.tarefas.values()].filter((t) => t.fase <= 11).map((t) => t.id))
  commitBase('portão: MVP (simulação)')
  const [x, y] = par
  let r = await proximaAsync(CLONES.a, 'sim-a', ['--reivindicar', x.id])
  checar(`A trava ${x.id}`, r.code === 0, r.out + r.err)
  r = await proximaAsync(CLONES.c, 'sim-c', ['--reivindicar', y.id])
  checar(`C não consegue ${y.id} enquanto ${x.id} está ativa`, r.code === 3, r.out)
  const { bloquear } = await import(join(SEMENTE, 'scripts/plano/proxima.mjs'))
  process.env.VINIMON_AGENTE = 'sim-a'
  const b = bloquear(x.id, '#1', { cwd: CLONES.a })
  checar(`A registra o bloqueio de ${x.id}`, b.ok, b.motivo)
  r = await proximaAsync(CLONES.c, 'sim-c', ['--reivindicar', y.id])
  checar(`com ${x.id} bloqueada, C consegue ${y.id}`, r.code === 0, r.out + r.err)
  r = await proximaAsync(CLONES.c, 'sim-coord', ['--desbloquear', x.id], { VINIMON_PAPEL: 'coordenador' })
  checar('coordenador desbloqueia', r.code === 0, r.out + r.err)
  const { retomar } = await import(join(SEMENTE, 'scripts/plano/proxima.mjs'))
  const rt = retomar(x.id, { cwd: CLONES.a })
  checar(`A não retoma ${x.id} enquanto ${y.id} segura os arquivos`, !rt.ok && /travados|schema/.test(rt.motivo), JSON.stringify(rt))
  concluir([y.id])
  const rt2 = retomar(x.id, { cwd: CLONES.a })
  checar(`depois do merge de ${y.id}, A retoma ${x.id}`, rt2.ok, JSON.stringify(rt2))
  // limite por agente
  zerarLivro()
  const st = await estado(CLONES.a)
  const { elegiveis } = await import(join(SEMENTE, 'scripts/plano/proxima.mjs'))
  const livres = []
  const { cruzamento } = await import(join(SEMENTE, 'scripts/plano/grafo.mjs'))
  for (const t of elegiveis(st, 'sim-a', ['A', 'W', 'C']).lista) if (livres.every((u) => !cruzamento(t, u).length)) livres.push(t)
  for (const t of livres.slice(0, 2)) await proximaAsync(CLONES.a, 'sim-a', ['--reivindicar', t.id])
  r = await proximaAsync(CLONES.a, 'sim-a', ['--reivindicar', livres[2].id])
  checar('a 3ª trava ativa do mesmo agente é recusada', r.code === 3 && /limite/.test(r.out), r.out)
  r = await proximaAsync(CLONES.w, 'sim-w', ['--reivindicar', livres[2].id])
  checar('…mas outro agente pega a mesma tarefa', r.code === 0, r.out)
}

async function cenarioConferir() {
  console.log('\n6. Conferência do diff (a mesma do check "protocolo")')
  reiniciarBase()
  const c = CLONES.a
  git(c, ['fetch', '-q', 'origin'])
  const testar = (nome, mexer, esperaViolacao) => {
    git(c, ['checkout', '-q', '-B', 'tarefa/T-0.1', 'origin/v2'])
    mexer()
    git(c, ['add', '-A'])
    git(c, ['commit', '-q', '-m', 'T-0.1: teste'])
    const r = proxima(c, ['--conferir', 'T-0.1', '--repo', c])
    checar(nome, esperaViolacao ? r.code === 1 : r.code === 0, r.out + r.err)
  }
  testar('arquivo da lista passa', () => writeFileSync(join(c, '.gitignore'), 'node_modules\ndata/\n'), false)
  testar('arquivo fora da lista reprova', () => writeFileSync(join(c, 'qualquer.txt'), 'x\n'), true)
  testar('PR de tarefa mexendo em docs/plano reprova', () => writeFileSync(join(c, 'docs/plano/README.md'), 'x\n'), true)
  testar('PR de tarefa mexendo em scripts/plano reprova', () => writeFileSync(join(c, 'scripts/plano/x.mjs'), 'x\n'), true)
  testar('CRLF reprova', () => writeFileSync(join(c, '.gitignore'), 'node_modules\r\ndata/\r\n'), true)
  // check do PR (protocolo.yml)
  git(c, ['checkout', '-q', '-B', 'tarefa/T-0.1', 'origin/v2'])
  writeFileSync(join(c, '.gitignore'), 'node_modules\ndata/\n')
  git(c, ['commit', '-q', '-am', 'T-0.1: ok'])
  const pr = (env) => run('node', [join(SEMENTE, 'scripts/plano/proxima.mjs'), '--conferir-pr', '--repo', c, '--controle', SEMENTE], { cwd: c, env, permitirFalha: true })
  checar('check do PR: título e head certos passam', pr({ TITULO: 'T-0.1: mover v1', HEAD_REF: 'tarefa/T-0.1', BASE_REF: 'v2' }).code === 0)
  checar('check do PR: título de outra tarefa reprova', pr({ TITULO: 'T-0.2: x', HEAD_REF: 'tarefa/T-0.1', BASE_REF: 'v2' }).code === 1)
  checar('check do PR: head fora do padrão reprova', pr({ TITULO: 'T-0.1: x', HEAD_REF: 'feature/x', BASE_REF: 'v2' }).code === 1)
  checar('check do PR: PR de fork reprova', pr({ TITULO: 'T-0.1: x', HEAD_REF: 'tarefa/T-0.1', BASE_REF: 'v2', MESMO_REPO: 'false' }).code === 1)
  checar('check do PR: plano/* tocando código reprova', pr({ TITULO: 'plano: x', HEAD_REF: 'plano/x', BASE_REF: 'v2' }).code === 1)
  checar('check do PR: main só a partir da v2', pr({ TITULO: 'x', HEAD_REF: 'tarefa/T-0.1', BASE_REF: 'main' }).code === 1)
  checar('check do PR: main aceita release/v2-em-main no corte', pr({ TITULO: 'x', HEAD_REF: 'release/v2-em-main', BASE_REF: 'main' }).code === 0)
}

async function cenarioRunner() {
  console.log('\n7. Runner ponta a ponta com claude e gh falsos')
  reiniciarBase()
  const c = CLONES.a
  git(c, ['fetch', '-q', 'origin'])
  git(c, ['checkout', '-q', '--detach', 'origin/v2'])
  const ctl = join(RAIZ, 'controle-a')
  rmSync(ctl, { recursive: true, force: true })
  git(c, ['worktree', 'add', '-q', '--detach', ctl, 'origin/v2'])
  const env = { VINIMON_AGENTE: 'sim-a', VINIMON_WT: join(RAIZ, 'wt-a'), SIM_ARQUIVO: '.gitignore', VINIMON_ESPERA_S: '1' }
  let r = run('node', [join(ctl, 'scripts/plano/rodar.mjs'), '--trilha', 'A', '--uma'], { cwd: c, env, permitirFalha: true })
  const e = lerGh()
  const pr = e.prs.find((p) => p.headRefName === 'tarefa/T-0.1' && p.state === 'OPEN')
  checar('runner abre o PR da T-0.1 com o título do cartão', Boolean(pr) && /^T-0\.1: /.test(pr.title), `${r.out}\n${r.err}`)
  checar('branch remota tarefa/T-0.1 tem o commit do modelo', git(c, ['ls-remote', 'origin', 'refs/heads/tarefa/T-0.1']).out.length > 0)
  checar('worktree removida depois do PR', !run('test', ['-d', join(RAIZ, 'wt-a', 'T-0.1')], { permitirFalha: true }).ok)
  // o modelo mexe fora da lista: runner reprova, dá uma chance de correção e registra BLOQUEADO
  concluir(['T-0.1'])
  r = run('node', [join(ctl, 'scripts/plano/rodar.mjs'), '--trilha', 'A', '--uma'], { cwd: c, env: { ...env, SIM_CLAUDE_MODO: 'fora' }, permitirFalha: true })
  const st = await estado(c)
  const bloqueadas = [...st.travas.values()].filter((t) => t.estado === 'bloqueada')
  checar('entrega fora do escopo vira BLOQUEADO com issue (nada é publicado)', bloqueadas.length === 1 && lerGh().issues === 1, `${r.out}\n${r.err}`)
  r = run('node', [join(ctl, 'scripts/plano/rodar.mjs'), '--trilha', 'A', '--uma'], { cwd: c, env: { ...env, SIM_CLAUDE_MODO: 'bloqueado' }, permitirFalha: true })
  checar('BLOQUEADO do modelo registra issue e evento no livro-razão', lerGh().issues === 2, `${r.out}\n${r.err}`)
}

// ---------- principal ----------

try {
  console.log(`Simulação em ${RAIZ}`)
  montar()
  await cenarioMesmaTarefa()
  const { parSchema } = await cenarioParesConflitantes()
  await cenarioAtrasoAssimetrico(parSchema)
  await cenarioDependencias()
  await cenarioBloqueioELimite(parSchema)
  await cenarioConferir()
  await cenarioRunner()
} catch (e) {
  falhas++
  console.error(`\nerro na simulação: ${e.stack}`)
} finally {
  console.log(`\n${ok} ok, ${falhas} falha(s)`)
  if (!MANTER) rmSync(RAIZ, { recursive: true, force: true })
  process.exit(falhas ? 1 : 0)
}
