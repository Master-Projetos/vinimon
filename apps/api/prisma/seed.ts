import { pathToFileURL } from 'node:url'
import { CONFIG_PADRAO } from '@vinimon/shared'
import type { Prisma } from '../src/generated/prisma/client'
import { avaliarSenha } from '../src/lib/forca-senha'
import { prisma, type Tx } from '../src/lib/prisma'
import { hashSenha, senhaAleatoria } from '../src/lib/senha'

const CANAIS_SISTEMA = ['Sistema Web', 'Telefone', 'E-mail', 'Automático: via e-mail', 'API']
const FERIADOS_NACIONAIS: [string, string][] = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Consciência Negra'],
  ['12-25', 'Natal'],
]
const STATUS_PADRAO = [
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
  { nome: 'Aguardando fornecedor', tipo: 'PENDENTE', papel: null, pausaSla: false, cor: '#ef6c00', ordem: 310 },
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
] as const satisfies readonly Prisma.StatusCreateManyInput[]
const PRIORIDADES_PADRAO = [
  { nome: 'Baixa', cor: '#2e8b57', ordem: 1, padrao: false },
  { nome: 'Média', cor: '#d9a400', ordem: 2, padrao: true },
  { nome: 'Alta', cor: '#e67300', ordem: 3, padrao: false },
  { nome: 'Crítica', cor: '#c62828', ordem: 4, padrao: false },
] as const

/** Passos 1–5 da §4.4 (sempre) e 6–7 (status e prioridades, só com `catalogos` e tabela vazia). Idempotente. */
export async function seedBase(tx: Tx, { catalogos }: { catalogos: boolean }): Promise<void> {
  await tx.config.createMany({
    data: Object.entries(CONFIG_PADRAO).map(([chave, valor]) => ({ chave, valor: valor as Prisma.InputJsonValue })),
    skipDuplicates: true,
  })
  await tx.canal.createMany({ data: CANAIS_SISTEMA.map((nome) => ({ nome, sistema: true })), skipDuplicates: true })

  const j24 = await tx.jornada.upsert({
    where: { nome: '24x7' },
    update: {},
    create: { nome: '24x7', ininterrupta: true },
    select: { id: true },
  })
  const comercial = await tx.jornada.upsert({
    where: { nome: 'Comercial' },
    update: {},
    create: { nome: 'Comercial' },
    select: { id: true },
  })
  const horarios = [1, 2, 3, 4, 5].flatMap((diaSemana) => [
    { jornadaId: comercial.id, diaSemana, inicioMin: 480, fimMin: 720 },
    { jornadaId: comercial.id, diaSemana, inicioMin: 780, fimMin: 1080 },
  ])
  await tx.jornadaHorario.createMany({ data: horarios, skipDuplicates: true })
  const cfg = await tx.config.findUnique({ where: { chave: 'sla.jornadaPadraoId' }, select: { valor: true } })
  if (cfg?.valor === null) await tx.config.update({ where: { chave: 'sla.jornadaPadraoId' }, data: { valor: j24.id } })

  for (const [mmdd, nome] of FERIADOS_NACIONAIS) {
    const data = new Date(`2000-${mmdd}T00:00:00.000Z`)
    const existe = await tx.feriado.findFirst({
      where: { data, recorrente: true, jornadaId: null },
      select: { id: true },
    })
    if (!existe) await tx.feriado.create({ data: { data, nome, recorrente: true } })
  }
  await tx.unidade.upsert({ where: { nome: 'Principal' }, update: {}, create: { nome: 'Principal' } })

  if (!catalogos) return
  if ((await tx.status.count()) === 0) await tx.status.createMany({ data: STATUS_PADRAO.map((s) => ({ ...s })) })
  if ((await tx.prioridade.count()) === 0)
    await tx.prioridade.createMany({ data: PRIORIDADES_PADRAO.map((p) => ({ ...p })) })
}

/** Passos 8–9: área TI e admin. Devolve a senha gerada (só quando `SEED_ADMIN_PASSWORD` não foi informada) ou null. */
export async function seedInicial(tx: Tx): Promise<string | null> {
  let area = await tx.area.findFirst({ select: { id: true } })
  if (!area) {
    const jornada = await tx.jornada.findUnique({ where: { nome: '24x7' }, select: { id: true } })
    area = await tx.area.create({
      data: { nome: 'TI', atende: true, jornadaId: jornada?.id ?? null },
      select: { id: true },
    })
  }
  if ((await tx.usuario.count()) > 0) return null

  const organizacao = String(CONFIG_PADRAO['sistema.organizacao'])
  const informada = process.env.SEED_ADMIN_PASSWORD
  const senha = informada ?? senhaAleatoria(20)
  if (informada) {
    const av = await avaliarSenha(senha, { login: 'admin', nome: 'Administrador', email: null, organizacao })
    if (!av.ok) throw new Error(`SEED_ADMIN_PASSWORD é fraca: ${av.dica ?? 'escolha outra senha'}`)
  }
  await tx.usuario.create({
    data: {
      login: 'admin',
      nome: 'Administrador',
      perfil: 'ADMIN',
      areaId: area.id,
      senhaHash: await hashSenha(senha),
      deveTrocarSenha: true,
    },
  })
  return informada ? null : senha
}

async function main(): Promise<void> {
  const senha = await prisma.$transaction(
    async (tx) => {
      await seedBase(tx, { catalogos: true })
      return seedInicial(tx)
    },
    { timeout: 60_000 },
  )
  if (senha) {
    process.stdout.write(
      [
        '',
        '┌──────────────────────────────────────────────────────────────┐',
        '│ Usuário administrador criado                                 │',
        '│   login: admin                                               │',
        `│   senha: ${senha.padEnd(52)}│`,
        '│ Anote agora: ela não será exibida novamente. A troca da      │',
        '│ senha e o cadastro do 2FA são exigidos no primeiro acesso.   │',
        '└──────────────────────────────────────────────────────────────┘',
        '',
      ].join('\n'),
    )
  } else process.stdout.write('Seed concluído.\n')
  await prisma.$disconnect()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(async (e) => {
    console.error(e instanceof Error ? e.message : e)
    await prisma.$disconnect()
    process.exit(1)
  })
}
