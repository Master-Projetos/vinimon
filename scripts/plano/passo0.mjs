#!/usr/bin/env node
// Passo 0 do coordenador: configura o GitHub para a execução multi-conta. Sem --aplicar, só mostra
// o que faria (dry-run). Precisa de uma conta com papel Admin no repositório.
//
//   node scripts/plano/passo0.mjs                       # dry-run
//   node scripts/plano/passo0.mjs --aplicar --origem claude/wizardly-edison-456gom
//   node scripts/plano/passo0.mjs --aplicar --exigir-verificar   # depois do merge da T-1.11
//   node scripts/plano/passo0.mjs --conferir            # mostra o que está configurado
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BASE, LIVRO, REMOTO } from './proxima.mjs'

const o = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : [])).filter((x) => x.length),
)
const APLICAR = Boolean(o.aplicar)

function run(cmd, args, { entrada, permitirFalha = false } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input: entrada, env: { ...process.env, GH_PROMPT_DISABLED: '1' } })
  if (r.status !== 0 && !permitirFalha) throw new Error(`${cmd} ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`)
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}
const gh = (args, op) => run('gh', args, op)
const ghJson = (args) => JSON.parse(gh(args).out || 'null')

function passo(descricao, fazer) {
  console.log(`${APLICAR ? '▶' : '·'} ${descricao}`)
  if (APLICAR) fazer()
}

function api(metodo, caminho, corpo) {
  const dir = mkdtempSync(join(tmpdir(), 'vinimon-passo0-'))
  try {
    const args = ['api', '-X', metodo, caminho, '-H', 'Accept: application/vnd.github+json']
    if (corpo) {
      const f = join(dir, 'corpo.json')
      writeFileSync(f, JSON.stringify(corpo))
      args.push('--input', f)
    }
    return gh(args).out
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const repo = ghJson(['repo', 'view', '--json', 'nameWithOwner,isInOrganization,visibility,defaultBranchRef'])
const coord = gh(['api', 'user', '-q', '.login']).out
const R = repo.nameWithOwner
console.log(`Repositório ${R} (${repo.visibility}, organização: ${repo.isInOrganization}) · coordenador: ${coord} · ${APLICAR ? 'APLICANDO' : 'dry-run (use --aplicar)'}`)

if (o.conferir) {
  for (const b of [BASE, 'main']) {
    const p = gh(['api', `repos/${R}/branches/${b}/protection`], { permitirFalha: true })
    console.log(`\nproteção de ${b}:`, p.ok ? p.out : '(nenhuma)')
  }
  console.log('\nrulesets:', gh(['api', `repos/${R}/rulesets`]).out)
  console.log('\nconfig de merge:', gh(['api', `repos/${R}`, '-q', '{squash: .allow_squash_merge, merge: .allow_merge_commit, rebase: .allow_rebase_merge, titulo: .squash_merge_commit_title, apagar: .delete_branch_on_merge, auto: .allow_auto_merge}']).out)
  process.exit(0)
}

// 1. merge só por squash, com título do PR
passo('repositório: só squash (título = título do PR), apagar branch após merge, auto-merge ligado', () =>
  api('PATCH', `repos/${R}`, {
    allow_squash_merge: true,
    allow_merge_commit: false,
    allow_rebase_merge: false,
    squash_merge_commit_title: 'PR_TITLE',
    squash_merge_commit_message: 'PR_BODY',
    delete_branch_on_merge: true,
    allow_auto_merge: true,
  }),
)

// 2. labels
for (const [nome, cor, desc] of [
  ['bloqueado', 'b60205', 'Tarefa parada: o coordenador precisa decidir (prompts/desbloqueio.md)'],
  ['ajustes', 'fbca04', 'O coordenador pediu correções no PR'],
  ['escopo-aprovado', '0e8a16', 'O coordenador aceitou arquivo fora da lista do cartão'],
]) {
  passo(`label "${nome}"`, () => gh(['label', 'create', nome, '--color', cor, '--description', desc, '--force']))
}

// 3. branch de integração e livro-razão
const existe = (b) => run('git', ['ls-remote', '--exit-code', REMOTO, `refs/heads/${b}`], { permitirFalha: true }).ok
if (!existe(BASE)) {
  const origem = o.origem
  if (!origem && APLICAR) throw new Error(`a branch ${BASE} não existe: informe --origem <branch com o plano>`)
  passo(`criar ${BASE} a partir de ${origem ?? '<--origem>'}`, () => {
    run('git', ['fetch', REMOTO, origem])
    run('git', ['push', REMOTO, `${REMOTO}/${origem}:refs/heads/${BASE}`])
  })
} else console.log(`· ${BASE} já existe`)
if (!existe(LIVRO)) {
  passo(`criar o livro-razão ${LIVRO} (commit raiz vazio)`, () => {
    const vazia = run('git', ['mktree'], { entrada: '' }).out
    const env = { GIT_AUTHOR_NAME: `vinimon-${coord}`, GIT_AUTHOR_EMAIL: `${coord}@vinimon.invalid`, GIT_COMMITTER_NAME: `vinimon-${coord}`, GIT_COMMITTER_EMAIL: `${coord}@vinimon.invalid` }
    const r = spawnSync('git', ['commit-tree', vazia, '-m', 'travas: início'], { encoding: 'utf8', env: { ...process.env, ...env } })
    if (r.status !== 0) throw new Error(r.stderr)
    run('git', ['push', REMOTO, `${r.stdout.trim()}:refs/heads/${LIVRO}`])
  })
} else console.log(`· ${LIVRO} já existe`)

// 4. proteção clássica da base e da main (merge por qualquer conta com Write, sempre por PR e com os checks obrigatórios)
const checks = ['protocolo', ...(o['exigir-verificar'] ? ['verificar'] : [])]
for (const b of [BASE, 'main']) {
  passo(`proteger ${b}: PR obrigatório (0 aprovações), checks [${checks.join(', ')}] com branch atualizada, sem force push nem deleção, merge por quem tem Write`, () =>
    api('PUT', `repos/${R}/branches/${b}/protection`, {
      required_status_checks: { strict: true, contexts: checks },
      enforce_admins: false,
      required_pull_request_reviews: { required_approving_review_count: 0, dismiss_stale_reviews: false, require_code_owner_reviews: false },
      restrictions: null,
      allow_force_pushes: false,
      allow_deletions: false,
      required_conversation_resolution: false,
    }),
  )
}

// 5. rulesets para tarefa/** e para o livro-razão
const existentes = ghJson(['api', `repos/${R}/rulesets`]) ?? []
for (const [nome, padrao, regras] of [
  ['vinimon-tarefas', 'refs/heads/tarefa/**', [{ type: 'non_fast_forward' }]],
  ['vinimon-livro-razao', `refs/heads/${LIVRO}`, [{ type: 'non_fast_forward' }, { type: 'deletion' }]],
]) {
  const atual = existentes.find((x) => x.name === nome)
  const corpo = { name: nome, target: 'branch', enforcement: 'active', conditions: { ref_name: { include: [padrao], exclude: [] } }, rules: regras }
  passo(`ruleset "${nome}" em ${padrao}: ${regras.map((r) => r.type).join(' + ')}`, () =>
    atual ? api('PUT', `repos/${R}/rulesets/${atual.id}`, corpo) : api('POST', `repos/${R}/rulesets`, corpo),
  )
}

console.log(`
${APLICAR ? 'Feito.' : 'Nada foi alterado.'} Próximos passos do coordenador:
- Conferir: node scripts/plano/passo0.mjs --conferir
- Dar papel Write (não Admin) às contas executoras; cada uma faz o merge dos próprios PRs (auto-merge squash) quando o CI fica verde.
- Depois do merge da T-1.11 (CI existe): node scripts/plano/passo0.mjs --aplicar --exigir-verificar
- Gitleaks: a action exige o secret GITLEAKS_LICENSE em repositório de organização (ver T-1.11).`)
