import type { PapelStatus, TipoStatus } from '@vinimon/shared'
import { seedBase } from '../../prisma/seed'
import { Prisma } from '../../src/generated/prisma/client'
import { prisma, type Tx } from '../../src/lib/prisma'
import type { AnexoCompleto } from './arquivos'
import type { LeituraV1 } from './ler'
import { type ResultadoTransformacao, transformar, uuidLegado } from './transformar'
import type { Normalizado } from './validar'

/** Lançada no fim de um `--dry-run` para desfazer a transação inteira (o banco fica intacto). */
export class DryRunRollback extends Error {
  constructor() {
    super('dry-run: transação desfeita de propósito')
    this.name = 'DryRunRollback'
  }
}

export const MARCADOR = 'legado.migracao'
const TAMANHO_LOTE = 1000

/** Tabelas com `id` serial cujas sequences são reposicionadas (lista FIXA, validada por regex: S60). */
const TABELAS_COM_SEQUENCE = [
  'areas',
  'departamentos',
  'prioridades',
  'status',
  'problemas',
  'usuarios',
  'tipos_ativo',
  'ativos',
  'categorias_artigo',
  'artigos',
  'chamados',
  'assentamentos',
] as const
const RE_TABELA = /^[a-z_][a-z0-9_]*$/

/** Papéis de status do sistema (cópia dos de `seed.ts`, que não os exporta): os que faltarem são criados. */
const STATUS_DO_SISTEMA: ReadonlyArray<{
  nome: string
  tipo: TipoStatus
  papel: PapelStatus
  pausaSla: boolean
  cor: string
  ordem: number
}> = [
  { nome: 'Aguardando atendimento', tipo: 'ABERTO', papel: 'INICIAL', pausaSla: false, cor: '#1565c0', ordem: 100 },
  {
    nome: 'Em atendimento',
    tipo: 'EM_ATENDIMENTO',
    papel: 'EM_ATENDIMENTO',
    pausaSla: false,
    cor: '#6a1b9a',
    ordem: 200,
  },
  {
    nome: 'Encaminhado para operador',
    tipo: 'EM_ATENDIMENTO',
    papel: 'ENCAMINHADO',
    pausaSla: false,
    cor: '#4527a0',
    ordem: 210,
  },
  {
    nome: 'Aguardando retorno do solicitante',
    tipo: 'PENDENTE',
    papel: 'AGUARDANDO_SOLICITANTE',
    pausaSla: true,
    cor: '#d9a400',
    ordem: 300,
  },
  { nome: 'Agendado', tipo: 'AGENDADO', papel: 'AGENDADO', pausaSla: true, cor: '#00838f', ordem: 320 },
  {
    nome: 'Concluído – aguardando validação',
    tipo: 'CONCLUIDO',
    papel: 'CONCLUIDO',
    pausaSla: true,
    cor: '#2e7d32',
    ordem: 400,
  },
  { nome: 'Encerrado', tipo: 'ENCERRADO', papel: 'ENCERRADO', pausaSla: true, cor: '#546e7a', ordem: 500 },
  { nome: 'Cancelado', tipo: 'ENCERRADO', papel: 'CANCELADO', pausaSla: true, cor: '#757575', ordem: 510 },
]

export type RelatorioGravacao = {
  /** Linhas lidas da v1 e linhas realmente inseridas, por tabela do v2. */
  tabelas: Array<{ tabela: string; lidas: number; inseridas: number }>
  avisos: string[]
  loginsSenhaAnulada: string[]
  /** Papéis de status criados por faltarem. */
  statusDoSistemaCriados: number
  dryRun: boolean
}

async function emLotes<T>(itens: readonly T[], inserir: (lote: T[]) => Promise<{ count: number }>): Promise<number> {
  let total = 0
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) total += (await inserir(itens.slice(i, i + TAMANHO_LOTE))).count
  return total
}

/** Reposiciona cada sequence em `max(id) + 1`, com `is_called = false` (o próximo `nextval` devolve exatamente esse valor). */
async function reposicionarSequences(tx: Tx): Promise<void> {
  for (const t of TABELAS_COM_SEQUENCE) {
    if (!RE_TABELA.test(t)) throw new Error(`nome de tabela inválido: ${t}`)
    await tx.$queryRaw`SELECT setval(pg_get_serial_sequence(${t}::text, 'id'), COALESCE((SELECT MAX(id) FROM ${Prisma.raw(`"${t}"`)}), 0) + 1, false)`
  }
}

/** Campos desnormalizados do chamado (§4.5, passo 5), por `$executeRaw`: último assentamento (qualquer e público) e atividade. */
async function recalcularDesnormalizados(tx: Tx): Promise<void> {
  await tx.$executeRaw`
    UPDATE chamados c SET ultimo_assentamento_id = a.ultimo
    FROM (SELECT chamado_id, MAX(id) AS ultimo FROM assentamentos GROUP BY chamado_id) a
    WHERE a.chamado_id = c.id`
  await tx.$executeRaw`
    UPDATE chamados c SET ultimo_assentamento_publico_id = a.ultimo, ultima_atividade_em = GREATEST(c.aberto_em, a.quando)
    FROM (SELECT chamado_id, MAX(id) AS ultimo, MAX(criado_em) AS quando FROM assentamentos WHERE NOT interno GROUP BY chamado_id) a
    WHERE a.chamado_id = c.id`
  // ultimaInteracaoEm / ultimaInteracaoAutorId = data e autor do último assentamento público
  await tx.$executeRaw`
    UPDATE chamados c SET ultima_interacao_em = a.criado_em, ultima_interacao_autor_id = a.autor_id
    FROM (SELECT DISTINCT ON (chamado_id) chamado_id, criado_em, autor_id FROM assentamentos WHERE NOT interno ORDER BY chamado_id, id DESC) a
    WHERE a.chamado_id = c.id`
}

/** Papéis de status que faltarem entram como status de sistema (sufixo " (sistema)" se o nome já existir). */
async function completarStatusDoSistema(tx: Tx): Promise<number> {
  const ocupados = new Set(
    (await tx.status.findMany({ where: { papel: { not: null } }, select: { papel: true } })).map((s) => s.papel),
  )
  let criados = 0
  for (const s of STATUS_DO_SISTEMA) {
    if (ocupados.has(s.papel)) continue
    const existe = await tx.status.findUnique({ where: { nome: s.nome }, select: { id: true } })
    await tx.status.create({ data: { ...s, nome: existe ? `${s.nome} (sistema)` : s.nome } })
    criados++
  }
  return criados
}

/**
 * Passo 5 da §4.5: UMA transação (`maxWait` 30 s, `timeout` 30 min). Preflight; `seedBase`; `createMany skipDuplicates`
 * em lotes de 1000 na ordem das FKs; config; sequences; status de sistema que faltarem; desnormalizados; prioridade
 * padrão; marcador. Com `dryRun`, lança `DryRunRollback` no fim e a transação inteira é desfeita.
 */
export async function gravar(opcoes: {
  leitura: LeituraV1
  norm: Normalizado
  anexos: readonly AnexoCompleto[]
  avisosAnteriores: readonly string[]
  dryRun: boolean
  exigirTrocaTodos: boolean
  agora: Date
}): Promise<RelatorioGravacao> {
  let relatorio: RelatorioGravacao | null = null
  try {
    await prisma.$transaction(
      async (tx) => {
        // 1. preflight: banco com usuários e sem o marcador não é um destino de importação
        const marcado = await tx.config.findUnique({ where: { chave: MARCADOR }, select: { chave: true } })
        if (!marcado && (await tx.usuario.count()) > 0) {
          throw new Error(
            'O banco de destino já tem usuários e não é o resultado de uma migração anterior. Use um banco vazio.',
          )
        }
        // 2. base do sistema (canais, jornadas, unidade "Principal", config padrão)
        await seedBase(tx, { catalogos: false })
        const canalWeb = await tx.canal.findUniqueOrThrow({ where: { nome: 'Sistema Web' }, select: { id: true } })
        const j24 = await tx.jornada.findUniqueOrThrow({ where: { nome: '24x7' }, select: { id: true } })
        const unidade = await tx.unidade.findUniqueOrThrow({ where: { nome: 'Principal' }, select: { id: true } })
        const cfg = await tx.config.findUnique({ where: { chave: 'sla.alertaPct' }, select: { valor: true } })

        const t: ResultadoTransformacao = transformar(opcoes.leitura, opcoes.norm, {
          canalWebId: canalWeb.id,
          jornada24x7Id: j24.id,
          unidadePrincipalId: unidade.id,
          agora: opcoes.agora,
          exigirTrocaTodos: opcoes.exigirTrocaTodos,
          ...(typeof cfg?.valor === 'number' ? { alertaPct: cfg.valor } : {}),
        })
        const L = t.lotes
        const lidas = {
          areas: L.areas.length,
          departamentos: L.departamentos.length,
          prioridades: L.prioridades.length,
          status: L.status.length,
          problemas: L.problemas.length,
          problemas_area: L.problemasArea.length,
          usuarios: L.usuarios.length,
          tipos_ativo: L.tiposAtivo.length,
          ativos: L.ativos.length,
          categorias_artigo: L.categoriasArtigo.length,
          artigos: L.artigos.length,
          artigo_problemas: L.artigosProblema.length,
          chamados: L.chamados.length,
          assentamentos: L.assentamentos.length,
          anexos: opcoes.anexos.length,
          chamado_seguidores: L.chamadosSeguidores.length,
          chamado_leituras: L.chamadosLeituras.length,
        }
        const inseridas: Record<keyof typeof lidas, number> = {
          areas: await emLotes(L.areas, (data) => tx.area.createMany({ data, skipDuplicates: true })),
          departamentos: await emLotes(L.departamentos, (data) =>
            tx.departamento.createMany({ data, skipDuplicates: true }),
          ),
          prioridades: await emLotes(L.prioridades, (data) => tx.prioridade.createMany({ data, skipDuplicates: true })),
          status: await emLotes(L.status, (data) => tx.status.createMany({ data, skipDuplicates: true })),
          problemas: await emLotes(L.problemas, (data) => tx.problema.createMany({ data, skipDuplicates: true })),
          problemas_area: await emLotes(L.problemasArea, (data) =>
            tx.problemaArea.createMany({ data, skipDuplicates: true }),
          ),
          usuarios: await emLotes(L.usuarios, (data) => tx.usuario.createMany({ data, skipDuplicates: true })),
          tipos_ativo: await emLotes(L.tiposAtivo, (data) => tx.tipoAtivo.createMany({ data, skipDuplicates: true })),
          ativos: await emLotes(L.ativos, (data) => tx.ativo.createMany({ data, skipDuplicates: true })),
          categorias_artigo: await emLotes(L.categoriasArtigo, (data) =>
            tx.categoriaArtigo.createMany({ data, skipDuplicates: true }),
          ),
          artigos: await emLotes(L.artigos, (data) => tx.artigo.createMany({ data, skipDuplicates: true })),
          artigo_problemas: await emLotes(L.artigosProblema, (data) =>
            tx.artigoProblema.createMany({ data, skipDuplicates: true }),
          ),
          chamados: await emLotes(L.chamados, (data) => tx.chamado.createMany({ data, skipDuplicates: true })),
          assentamentos: await emLotes(L.assentamentos, (data) =>
            tx.assentamento.createMany({ data, skipDuplicates: true }),
          ),
          anexos: await emLotes(opcoes.anexos, (data) => tx.anexo.createMany({ data, skipDuplicates: true })),
          chamado_seguidores: await emLotes(L.chamadosSeguidores, (data) =>
            tx.chamadoSeguidor.createMany({ data, skipDuplicates: true }),
          ),
          chamado_leituras: await emLotes(L.chamadosLeituras, (data) =>
            tx.chamadoLeitura.createMany({ data, skipDuplicates: true }),
          ),
        }

        // config do legado (sobrescreve o padrão do seed, que veio antes)
        for (const c of L.config) {
          await tx.config.upsert({
            where: { chave: c.chave },
            create: { chave: c.chave, valor: c.valor },
            update: { valor: c.valor },
          })
        }
        await reposicionarSequences(tx)
        const statusDoSistemaCriados = await completarStatusDoSistema(tx)
        await recalcularDesnormalizados(tx)
        // exatamente uma prioridade padrão: se nenhuma, a de menor `ordem` (desempate: menor id)
        if ((await tx.prioridade.count({ where: { padrao: true } })) === 0) {
          const menor = await tx.prioridade.findFirst({
            orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
            select: { id: true },
          })
          if (menor) await tx.prioridade.update({ where: { id: menor.id }, data: { padrao: true } })
        }
        // marcador: sinaliza que este banco é resultado de uma migração (permite reexecutar sem recusar)
        await tx.config.upsert({
          where: { chave: MARCADOR },
          create: { chave: MARCADOR, valor: { em: opcoes.agora.toISOString() } },
          update: {},
        })

        relatorio = {
          tabelas: (Object.keys(lidas) as Array<keyof typeof lidas>).map((tabela) => ({
            tabela,
            lidas: lidas[tabela],
            inseridas: inseridas[tabela],
          })),
          avisos: [...opcoes.avisosAnteriores, ...t.avisos],
          loginsSenhaAnulada: t.loginsSenhaAnulada,
          statusDoSistemaCriados,
          dryRun: opcoes.dryRun,
        }
        if (opcoes.dryRun) throw new DryRunRollback()
      },
      { maxWait: 30_000, timeout: 1_800_000 },
    )
  } catch (erro) {
    if (!(erro instanceof DryRunRollback)) throw erro
  }
  if (relatorio === null) throw new Error('a gravação terminou sem relatório')
  return relatorio
}

/** Ids dos anexos da v1 por uuid determinístico (para achar o BLOB de cada linha do lote). */
export function mapaIdsLegado(leitura: LeituraV1): Map<string, number> {
  return new Map(leitura.anexos.map((a) => [uuidLegado(a.id), a.id]))
}
