// Carga e revisão de performance (T-11.12).
//   popular  (padrão): esvazia o banco e cria 200 usuários, 50.000 chamados e 300.000 assentamentos (+ seguidores,
//                      menções, leituras, eventos e notificações), de forma determinística (tudo derivado do índice).
//   explicar         : chama os services reais, captura o SQL emitido pelo Prisma e roda
//                      EXPLAIN (ANALYZE, BUFFERS) de cada consulta; imprime JSON com p95, índices e seq scans.
//   sessao           : cria uma sessão ATIVA por operador da carga (--quantas, padrão 20) e imprime os cookies.
// Só roda em banco cujo nome termina em `_test`, porque apaga todas as tabelas.
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { ChamadoFiltrosSchema, ListarNotificacoesQuerySchema, PainelQuerySchema } from '@vinimon/shared'
import { seedBase, seedInicial } from '../prisma/seed'
import { Prisma } from '../src/generated/prisma/client'
import { prisma, type Tx } from '../src/lib/prisma'
import { criarSessao, csrfDaSessao, NOME_COOKIE, type UsuarioSessao } from '../src/lib/sessao'
import { listarAssentamentos } from '../src/modules/assentamentos/service'
import { buscar } from '../src/modules/busca/service'
import { contagens, listar } from '../src/modules/chamados/consultas'
import { exportarChamados } from '../src/modules/chamados/exportar'
import { listarMencionaveis } from '../src/modules/mencoes/service'
import { processarEvento } from '../src/modules/notificacoes/fanout'
import { contarNaoLidas, listarNotificacoes } from '../src/modules/notificacoes/service'
import { obterPainel } from '../src/modules/painel/service'
import { gerarRelatorio } from '../src/modules/relatorios/service'

const CHAMADOS = 50_000
const ASSENTAMENTOS_POR_CHAMADO = 6
const OPERADORES = 40
const USUARIOS_COMUNS = 159 // + admin do seed + 40 operadores = 200
const LOGIN_OPERADOR = 'carga.op.01'

function exigirBancoTeste(): void {
  const url = process.env.DATABASE_URL ?? ''
  const nome = url.split('?')[0]?.split('/').pop() ?? ''
  if (!nome.endsWith('_test')) throw new Error('DATABASE_URL precisa terminar em _test: a carga apaga o banco.')
}

async function esvaziar(tx: Tx): Promise<void> {
  const tabelas = await tx.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  const nomes = tabelas.map((t) => t.tablename).filter((n) => /^[a-z_][a-z0-9_]*$/.test(n))
  if (nomes.length > 0) {
    const lista = nomes.map((n) => `"public"."${n}"`).join(', ')
    await tx.$executeRaw`TRUNCATE TABLE ${Prisma.raw(lista)} RESTART IDENTITY CASCADE`
  }
}

const passo = async (nome: string, f: () => Promise<unknown>) => {
  const t0 = performance.now()
  await f()
  process.stdout.write(`${nome}: ${Math.round(performance.now() - t0)} ms\n`)
}

/** Catálogos, 200 usuários, chamados, assentamentos e derivados. Todo INSERT é um INSERT … SELECT em lote. */
async function popular(): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await esvaziar(tx)
      await seedBase(tx, { catalogos: true })
      await seedInicial(tx)
    },
    { timeout: 120_000 },
  )
  const t = (sql: Prisma.Sql) => prisma.$executeRaw(sql)

  await passo('catálogos', async () => {
    await t(Prisma.sql`INSERT INTO areas (nome, jornada_id)
      SELECT 'Área ' || lpad(g::text, 2, '0'), (SELECT id FROM jornadas WHERE nome = '24x7')
      FROM generate_series(2, 8) g`)
    await t(Prisma.sql`INSERT INTO departamentos (unidade_id, nome)
      SELECT (SELECT id FROM unidades WHERE nome = 'Principal'), 'Departamento ' || lpad(g::text, 2, '0')
      FROM generate_series(1, 20) g`)
    await t(Prisma.sql`INSERT INTO problemas (nome, area_padrao_id, sla_solucao_min)
      SELECT 'Problema ' || lpad(g::text, 2, '0'), a.ids[1 + g % 8], 480
      FROM generate_series(1, 40) g, (SELECT array_agg(id ORDER BY id) ids FROM areas) a`)
    await t(Prisma.sql`INSERT INTO problema_areas (problema_id, area_id) SELECT id, area_padrao_id FROM problemas`)
  })

  await passo('usuários', async () => {
    const nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Heitor', 'Isabela', 'João']
    const sobrenomes = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Lima', 'Costa', 'Ribeiro', 'Almeida']
    await t(Prisma.sql`INSERT INTO usuarios (login, nome, email, perfil, area_id, mfa_ativado_em)
      SELECT 'carga.op.' || lpad(g::text, 2, '0'),
             ((${nomes})::text[])[1 + g % 10] || ' ' || ((${sobrenomes})::text[])[1 + g % 9] || ' Op' || g,
             'carga.op.' || g || '@carga.test', 'OPERADOR', a.ids[1 + (g - 1) % 8], now()
      FROM generate_series(1, ${OPERADORES}) g, (SELECT array_agg(id ORDER BY id) ids FROM areas) a`)
    await t(Prisma.sql`INSERT INTO usuario_areas (usuario_id, area_id)
      SELECT u.id, a.ids[1 + (u.id % 8)] FROM usuarios u, (SELECT array_agg(id ORDER BY id) ids FROM areas) a
      WHERE u.perfil = 'OPERADOR' AND u.id % 5 = 0 AND u.area_id <> a.ids[1 + (u.id % 8)]`)
    await t(Prisma.sql`INSERT INTO usuarios (login, nome, email, perfil, departamento_id)
      SELECT 'carga.u.' || lpad(g::text, 3, '0'),
             ((${nomes})::text[])[1 + g % 10] || ' ' || ((${sobrenomes})::text[])[1 + (g / 10) % 9] || ' ' || g,
             'carga.u.' || g || '@carga.test', 'USUARIO', d.ids[1 + g % 20]
      FROM generate_series(1, ${USUARIOS_COMUNS}) g, (SELECT array_agg(id ORDER BY id) ids FROM departamentos) d`)
  })

  await passo('chamados', async () => {
    const assuntos = [
      'Impressora não imprime',
      'Sem acesso à rede',
      'Computador lento',
      'Erro ao abrir o sistema',
      'Troca de mouse',
      'Senha do e-mail expirada',
      'Monitor piscando',
      'Instalação de software',
      'Telefone sem linha',
      'Pasta compartilhada inacessível',
    ]
    // Os 6.000 mais recentes ficam em aberto (10 perfis de status); os demais estão encerrados (5% cancelados).
    await t(Prisma.sql`
      WITH ref AS (
        SELECT (SELECT array_agg(id ORDER BY id) FROM areas) areas,
               (SELECT array_agg(id ORDER BY id) FROM usuarios WHERE perfil = 'OPERADOR') ops,
               (SELECT array_agg(id ORDER BY id) FROM usuarios WHERE perfil = 'USUARIO') usus,
               (SELECT array_agg(id ORDER BY ordem) FROM prioridades) prios,
               (SELECT array_agg(id ORDER BY id) FROM problemas) probs,
               (SELECT array_agg(id ORDER BY id) FROM departamentos) deps,
               (SELECT id FROM canais WHERE nome = 'Sistema Web') canal,
               (SELECT id FROM jornadas WHERE nome = '24x7') jornada
      ), base AS (
        SELECT g AS i,
               now() - ((${CHAMADOS} - g) * interval '11 minutes') - ((g * 37) % 600) * interval '1 second' AS aberto,
               CASE WHEN g > ${CHAMADOS} - 6000 THEN
                 (ARRAY['INICIAL','INICIAL','INICIAL','EM_ATENDIMENTO','EM_ATENDIMENTO','EM_ATENDIMENTO',
                        'AGUARDANDO_SOLICITANTE','AGENDADO','CONCLUIDO','ENCAMINHADO'])[1 + (g / 7) % 10]
                 WHEN g % 20 = 0 THEN 'CANCELADO' ELSE 'ENCERRADO' END AS papel
        FROM generate_series(1, ${CHAMADOS}) g
      ), c AS (
        SELECT b.*, s.id AS status_id, s.tipo AS status_tipo,
               r.areas[1 + b.i % 8] AS area_id,
               CASE WHEN b.papel = 'INICIAL' THEN NULL ELSE r.ops[1 + (b.i % 8) + 8 * ((b.i / 8) % 5)] END AS operador_id,
               r.usus[1 + (b.i * 7) % ${USUARIOS_COMUNS}] AS solicitante_id,
               CASE WHEN s.tipo IN ('CONCLUIDO', 'ENCERRADO')
                 THEN b.aberto + interval '1 hour' + (b.i % 2880) * interval '1 minute' END AS concluido
        FROM base b JOIN status s ON s.papel::text = b.papel, ref r
      )
      INSERT INTO chamados (assunto, descricao, solucao, solicitante_id, aberto_por_id, operador_id, area_id,
        problema_id, prioridade_id, canal_id, status_id, status_tipo, status_desde, departamento_id, aberto_em,
        agendado_para, primeira_resposta_em, concluido_em, encerrado_em, validacao_limite_em, cancelado, jornada_id,
        sla_resposta_min, sla_solucao_min, prazo_resposta_em, alerta_resposta_em, prazo_solucao_em, alerta_solucao_em,
        sla_resposta_cumprido, sla_solucao_cumprido, tempo_resposta_util_min, tempo_solucao_util_min,
        ultima_atividade_em, atualizado_em)
      SELECT ((${assuntos})::text[])[1 + c.i % 10] || ' #' || c.i,
             'Descrição do chamado ' || c.i || ': ' || ((${assuntos})::text[])[1 + (c.i / 10) % 10] || ' no setor.',
             CASE WHEN c.status_tipo IN ('CONCLUIDO', 'ENCERRADO') AND c.papel <> 'CANCELADO' THEN 'Resolvido.' END,
             c.solicitante_id, c.solicitante_id, c.operador_id, c.area_id,
             r.probs[1 + c.i % 40], r.prios[1 + c.i % 4], r.canal, c.status_id, c.status_tipo,
             coalesce(c.concluido, c.aberto), r.deps[1 + c.i % 20], c.aberto,
             CASE WHEN c.status_tipo = 'AGENDADO' THEN now() + interval '2 days' END,
             CASE WHEN c.papel <> 'INICIAL' THEN c.aberto + interval '30 minutes' END,
             c.concluido,
             CASE WHEN c.status_tipo = 'ENCERRADO' THEN c.concluido + interval '1 day' END,
             CASE WHEN c.status_tipo = 'CONCLUIDO' THEN c.concluido + interval '3 days' END,
             c.papel = 'CANCELADO', r.jornada,
             60, 480 * (1 + c.i % 3),
             c.aberto + interval '1 hour', c.aberto + interval '48 minutes',
             CASE WHEN c.status_tipo IN ('ABERTO', 'EM_ATENDIMENTO')
               THEN c.aberto + 480 * (1 + c.i % 3) * interval '1 minute' END,
             CASE WHEN c.status_tipo IN ('ABERTO', 'EM_ATENDIMENTO')
               THEN c.aberto + 384 * (1 + c.i % 3) * interval '1 minute' END,
             CASE WHEN c.papel <> 'INICIAL' THEN true END,
             CASE WHEN c.concluido IS NOT NULL THEN c.i % 7 <> 0 END,
             CASE WHEN c.papel <> 'INICIAL' THEN 30 END,
             CASE WHEN c.concluido IS NOT NULL THEN 60 + c.i % 2880 END,
             c.aberto, c.aberto
      FROM c, ref r
      ORDER BY c.i`)
  })

  await passo('assentamentos', async () => {
    // 6 por chamado, autor alternando solicitante/operador; o 4º é nota interna; o 5º de 1 em 3 menciona o operador.
    await t(Prisma.sql`
      INSERT INTO assentamentos (chamado_id, autor_id, tipo, interno, texto, criado_em)
      SELECT c.id,
             CASE WHEN j % 2 = 1 THEN c.solicitante_id ELSE coalesce(c.operador_id, c.solicitante_id) END,
             'COMENTARIO', j = 4 AND c.operador_id IS NOT NULL,
             CASE WHEN j = 5 AND c.id % 3 = 0 AND c.operador_id IS NOT NULL
               THEN 'Pode verificar, @[' || o.nome || '](usuario:' || o.id || ')? Comentário ' || j
               ELSE 'Comentário ' || j || ' do chamado ' || c.id END,
             least(now(), c.aberto_em + j * interval '7 minutes')
      FROM chamados c CROSS JOIN generate_series(1, ${ASSENTAMENTOS_POR_CHAMADO}) j
      LEFT JOIN usuarios o ON o.id = c.operador_id
      ORDER BY c.id, j`)
    await t(Prisma.sql`
      UPDATE chamados c SET ultimo_assentamento_id = x.ultimo, ultimo_assentamento_publico_id = x.publico,
        ultima_interacao_em = x.em, ultima_interacao_autor_id = c.solicitante_id, ultima_atividade_em = x.em
      FROM (SELECT chamado_id, max(id) ultimo, max(id) FILTER (WHERE NOT interno) publico, max(criado_em) em
            FROM assentamentos GROUP BY chamado_id) x
      WHERE x.chamado_id = c.id`)
  })

  await passo('menções, seguidores, leituras, eventos e notificações', async () => {
    await t(Prisma.sql`INSERT INTO mencoes (assentamento_id, usuario_id, chamado_id, criado_em)
      SELECT a.id, c.operador_id, c.id, a.criado_em FROM assentamentos a JOIN chamados c ON c.id = a.chamado_id
      WHERE a.texto LIKE 'Pode verificar, @[%'`)
    await t(Prisma.sql`INSERT INTO chamado_seguidores (chamado_id, usuario_id, motivo, criado_em)
      SELECT id, solicitante_id, 'SOLICITANTE'::motivo_seguir, aberto_em FROM chamados
      UNION ALL SELECT id, operador_id, 'ATRIBUIDO', aberto_em FROM chamados WHERE operador_id IS NOT NULL`)
    await t(Prisma.sql`INSERT INTO chamado_leituras (chamado_id, usuario_id, ultimo_assentamento_lido_id, lido_em)
      SELECT id, solicitante_id, ultimo_assentamento_publico_id, ultima_atividade_em FROM chamados WHERE id % 4 <> 0
      UNION ALL SELECT id, operador_id, ultimo_assentamento_id, ultima_atividade_em FROM chamados
      WHERE operador_id IS NOT NULL`)
    await t(Prisma.sql`INSERT INTO chamado_eventos (chamado_id, tipo, ator_id, criado_em, processado_em)
      SELECT id, 'CRIADO', solicitante_id, aberto_em, aberto_em FROM chamados ORDER BY id`)
    await t(Prisma.sql`INSERT INTO notificacoes (usuario_id, chamado_id, tipo, grupo_chave, assentamento_id, ator_ids,
        criado_em, atualizado_em, lida_em)
      SELECT solicitante_id, id, 'COMENTARIO'::tipo_notificacao, 'comentario:' || id, ultimo_assentamento_publico_id,
             ARRAY[coalesce(operador_id, solicitante_id)], ultima_atividade_em, ultima_atividade_em,
             CASE WHEN id <= ${CHAMADOS - 1000} THEN ultima_atividade_em + interval '1 hour' END
      FROM chamados
      UNION ALL
      SELECT operador_id, id, 'ATRIBUIDO', 'atribuido:' || id, NULL, ARRAY[solicitante_id], aberto_em, aberto_em,
             CASE WHEN id <= ${CHAMADOS - 3000} THEN aberto_em + interval '1 hour' END
      FROM chamados WHERE operador_id IS NOT NULL`)
  })

  await passo('evento com 200 seguidores', async () => {
    // Chamado em atendimento mais recente: todos os 200 usuários o seguem; evento COMENTARIO pendente.
    await t(Prisma.sql`
      WITH alvo AS (SELECT id FROM chamados WHERE status_tipo = 'EM_ATENDIMENTO' ORDER BY id DESC LIMIT 1)
      INSERT INTO chamado_seguidores (chamado_id, usuario_id, motivo)
      SELECT alvo.id, u.id, 'MANUAL' FROM alvo, usuarios u ON CONFLICT DO NOTHING`)
    await t(Prisma.sql`
      INSERT INTO chamado_eventos (chamado_id, tipo, ator_id, assentamento_id)
      SELECT c.id, 'COMENTARIO', c.solicitante_id, c.ultimo_assentamento_publico_id
      FROM chamados c WHERE c.id = (SELECT id FROM chamados WHERE status_tipo = 'EM_ATENDIMENTO' ORDER BY id DESC LIMIT 1)`)
  })

  await passo('ANALYZE', () => t(Prisma.sql`ANALYZE`))
  const [u, c, a] = await Promise.all([prisma.usuario.count(), prisma.chamado.count(), prisma.assentamento.count()])
  process.stdout.write(`Carga pronta: ${u} usuários, ${c} chamados, ${a} assentamentos.\n`)
}

async function sessaoDe(login: string): Promise<UsuarioSessao> {
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { login },
    select: { id: true, nome: true, login: true, perfil: true, areaId: true, areasSecundarias: true },
  })
  const secundarias = u.areasSecundarias.map((x) => x.areaId)
  return {
    id: u.id,
    nome: u.nome,
    login: u.login,
    perfil: u.perfil,
    areaId: u.areaId,
    areaIds: u.areaId === null ? secundarias : [u.areaId, ...secundarias],
    sessaoId: '',
    estado: 'ATIVA',
    mfaAtivo: true,
  }
}

interface Capturada {
  sql: string
  params: unknown[]
}
let captura: Capturada[] | null = null
prisma.$on('query', (e) => {
  if (captura === null) return
  if (!/^\s*(SELECT|WITH|UPDATE|INSERT|DELETE)\b/i.test(e.query)) return
  const params: unknown = JSON.parse(e.params)
  captura.push({ sql: e.query, params: Array.isArray(params) ? params : [] })
})

/** Reconstrói a consulta como `Prisma.Sql` parametrizada (os `$n` viram valores; nada é interpolado como texto). */
function comoSql(prefixo: string, q: Capturada): Prisma.Sql {
  const partes: string[] = []
  const valores: unknown[] = []
  let resto = q.sql
  let m = /\$(\d+)/.exec(resto)
  partes.push(prefixo)
  while (m !== null) {
    partes[partes.length - 1] += resto.slice(0, m.index)
    valores.push(q.params[Number(m[1]) - 1])
    partes.push('')
    resto = resto.slice(m.index + m[0].length)
    m = /\$(\d+)/.exec(resto)
  }
  partes[partes.length - 1] += resto
  return Prisma.sql(partes, ...valores)
}

class Desfazer extends Error {
  readonly linhas: unknown
  constructor(linhas: unknown) {
    super('rollback')
    this.linhas = linhas
  }
}

/** EXPLAIN ANALYZE; escrita roda numa transação desfeita. */
async function explicar(q: Capturada, formato: 'JSON' | 'TEXT'): Promise<unknown> {
  const prefixo = `EXPLAIN (ANALYZE, BUFFERS, FORMAT ${formato}) `
  const sql = comoSql(prefixo, q)
  if (/^\s*(SELECT|WITH)\b/i.test(q.sql)) return prisma.$queryRaw(sql)
  try {
    await prisma.$transaction(async (tx) => {
      throw new Desfazer(await tx.$queryRaw(sql))
    })
  } catch (e) {
    if (e instanceof Desfazer) return e.linhas
    throw e
  }
  return null
}

interface NoPlano {
  'Node Type'?: string
  'Relation Name'?: string
  'Index Name'?: string
  Plans?: NoPlano[]
}
function percorrer(n: NoPlano, indices: Set<string>, seq: Set<string>): void {
  if (n['Index Name']) indices.add(n['Index Name'])
  if (n['Node Type'] === 'Seq Scan' && n['Relation Name']) seq.add(n['Relation Name'])
  for (const f of n.Plans ?? []) percorrer(f, indices, seq)
}

const p95 = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b)
  return o[Math.min(o.length - 1, Math.ceil(o.length * 0.95) - 1)] ?? 0
}
const r2 = (x: number) => Math.round(x * 100) / 100

async function explicarTudo(saida: string, repeticoes: number): Promise<void> {
  const op = await sessaoDe(LOGIN_OPERADOR)
  const admin = await sessaoDe('admin')
  const usuario = await sessaoDe('carga.u.007')
  const ctxAdmin = { usuario: admin, ip: '127.0.0.1', userAgent: 'carga', requestId: null }
  const alvo = await prisma.chamado.findFirstOrThrow({
    where: { operadorId: op.id, concluidoEm: null },
    orderBy: { id: 'desc' },
    select: { id: true },
  })
  const evento = await prisma.chamadoEvento.findFirstOrThrow({
    where: { tipo: 'COMENTARIO' },
    orderBy: { id: 'desc' },
    select: { id: true, chamadoId: true },
  })
  const hoje = new Date()
  const dia = (d: Date) => d.toISOString().slice(0, 10)
  const de366 = dia(new Date(hoje.getTime() - 365 * 86_400_000))
  const filtros = (q: Record<string, unknown>) => ChamadoFiltrosSchema.parse(q)

  const casos: [string, () => Promise<unknown>][] = [
    ['lista do operador (todos, 1ª página)', () => listar(op, filtros({}))],
    ['lista do operador (minha-fila)', () => listar(op, filtros({ visao: 'minha-fila' }))],
    ['fila aberta', () => listar(op, filtros({ visao: 'fila-aberta' }))],
    ['SLA estourado', () => listar(op, filtros({ sla: 'ESTOURADO' }))],
    ['lista do usuário (abertos-por-mim)', () => listar(usuario, filtros({ visao: 'abertos-por-mim' }))],
    ['busca na lista (q=impressora)', () => listar(op, filtros({ busca: 'impressora' }))],
    ['timeline (assentamentos)', () => listarAssentamentos(alvo.id, { limite: 50 }, op)],
    ['feed de notificações', () => listarNotificacoes(op, ListarNotificacoesQuerySchema.parse({}))],
    ['contagem de não lidas', () => contarNaoLidas(op)],
    ['menção (trigram usuários)', () => listarMencionaveis(op, alvo.id, 'silva', false)],
    ['busca global (q=impressora)', () => buscar({ q: 'impressora', limite: 5 }, op)],
    ['contagens das visões (operador)', () => contagens(op)],
    ['contagens das visões (admin)', () => contagens(admin)],
    ['painel (operador, 90 dias)', () => obterPainel(op, PainelQuerySchema.parse({ periodo: 90 }))],
    ['painel (admin, 90 dias)', () => obterPainel(admin, PainelQuerySchema.parse({ periodo: 90 }))],
    ['relatório por-area (366 dias)', () => gerarRelatorio(admin, 'por-area', { de: de366, ate: dia(hoje) })],
    ['relatório sla (366 dias)', () => gerarRelatorio(admin, 'sla', { de: de366, ate: dia(hoje) })],
    [
      'exportação de 5000 linhas',
      async () => {
        const { fluxo } = await exportarChamados(ctxAdmin, filtros({ visao: 'todos' }), hoje, { limite: 5000 })
        let bytes = 0
        for await (const parte of fluxo) bytes += String(parte).length
        return bytes
      },
    ],
    [
      'processarEvento (200 seguidores)',
      async () => {
        await prisma.chamadoEvento.update({ where: { id: evento.id }, data: { processadoEm: null } })
        return processarEvento(evento.id)
      },
    ],
  ]

  const relatorio: unknown[] = []
  for (const [nome, f] of casos) {
    await f() // aquece cache de config e buffers
    const tempos: number[] = []
    for (let i = 0; i < repeticoes; i++) {
      const t0 = performance.now()
      await f()
      tempos.push(performance.now() - t0)
    }
    captura = []
    await f()
    const capturadas: Capturada[] = captura
    captura = null
    const consultas: unknown[] = []
    for (const q of capturadas) {
      if (/^\s*UPDATE "public"."chamado_eventos" SET "processado_em"/.test(q.sql)) continue
      const exec: number[] = []
      const indices = new Set<string>()
      const seq = new Set<string>()
      for (let i = 0; i < Math.max(3, Math.min(repeticoes, 10)); i++) {
        const linhas = await explicar(q, 'JSON')
        const plano = Array.isArray(linhas) ? (linhas[0] as Record<string, unknown>)['QUERY PLAN'] : null
        const raiz = Array.isArray(plano) ? (plano[0] as { Plan: NoPlano; 'Execution Time': number }) : null
        if (!raiz) continue
        exec.push(raiz['Execution Time'])
        percorrer(raiz.Plan, indices, seq)
      }
      const texto = await explicar(q, 'TEXT')
      consultas.push({
        sql: q.sql.length > 600 ? `${q.sql.slice(0, 600)}…` : q.sql,
        p95ms: r2(p95(exec)),
        indices: [...indices],
        seqScans: [...seq],
        plano: Array.isArray(texto) ? texto.map((l) => Object.values(l as object)[0]).join('\n') : '',
      })
    }
    const item = { nome, servicoP95ms: r2(p95(tempos)), consultas }
    relatorio.push(item)
    const maior = Math.max(0, ...consultas.map((c) => (c as { p95ms: number }).p95ms))
    process.stdout.write(`${nome}: serviço p95 ${r2(p95(tempos))} ms; maior consulta p95 ${maior} ms\n`)
  }
  writeFileSync(saida, JSON.stringify(relatorio, null, 2))
  process.stdout.write(`Relatório: ${saida}\n`)
}

/**
 * Uma sessão ATIVA por operador (o rate limit é por usuário: 300/min), uma linha JSON cada. O autocannon roda uma
 * instância de 1 conexão por linha, somando `-c 20`.
 */
async function imprimirSessoes(quantas: number): Promise<void> {
  const ops = await prisma.usuario.findMany({
    where: { perfil: 'OPERADOR', login: { startsWith: 'carga.op.' } },
    orderBy: { id: 'asc' },
    take: quantas,
    select: { id: true, login: true },
  })
  for (const u of ops) {
    const { sessaoId, token } = await criarSessao({
      usuarioId: u.id,
      estado: 'ATIVA',
      ip: '127.0.0.1',
      userAgent: 'carga',
    })
    const linha = { login: u.login, cookie: `${NOME_COOKIE}=${token}`, csrf: csrfDaSessao(sessaoId) }
    process.stdout.write(`${JSON.stringify(linha)}\n`)
  }
}

async function main(): Promise<void> {
  exigirBancoTeste()
  const args = process.argv.slice(2).filter((a) => a !== '--')
  const { positionals, values } = parseArgs({
    args,
    options: {
      saida: { type: 'string', default: 'revisao-performance.json' },
      repeticoes: { type: 'string', default: '20' },
      quantas: { type: 'string', default: '20' },
    },
    allowPositionals: true,
  })
  const modo = positionals[0] ?? 'popular'
  if (modo === 'popular') await popular()
  else if (modo === 'explicar') await explicarTudo(values.saida, Number(values.repeticoes))
  else if (modo === 'sessao') await imprimirSessoes(Number(values.quantas))
  else throw new Error(`Modo desconhecido: ${modo} (use popular, explicar ou sessao).`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`)
  await prisma.$disconnect()
  process.exit(1)
})
