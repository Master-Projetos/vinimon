import { type CalendarioQuery, type EventoCalendario, MAX_EVENTOS_CALENDARIO } from '@vinimon/shared'
import { escopoChamados } from '../../autorizacao/chamados'
import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'

const selectEvento = {
  id: true,
  assunto: true,
  abertoEm: true,
  concluidoEm: true,
  agendadoPara: true,
  operador: { select: { id: true, nome: true, corCalendario: true } },
} satisfies Prisma.ChamadoSelect

/**
 * `GET /calendario`: aberturas, conclusões e agendamentos do período, sempre dentro do escopo (S44). Uma consulta
 * por tipo, cada uma com `take`; o corte final de 2000 eventos vale para a lista já ordenada por data.
 */
export async function listarCalendario(u: UsuarioSessao, q: CalendarioQuery): Promise<EventoCalendario[]> {
  const base: Prisma.ChamadoWhereInput = {
    AND: [
      escopoChamados(u),
      q.areaIds === undefined ? {} : { areaId: { in: q.areaIds } },
      q.operadorIds === undefined ? {} : { operadorId: { in: q.operadorIds } },
    ],
  }
  const periodo = { gte: q.de, lte: q.ate }
  const buscar = (campo: 'abertoEm' | 'concluidoEm' | 'agendadoPara') =>
    prisma.chamado.findMany({
      where: { AND: [base, { [campo]: periodo }] },
      select: selectEvento,
      orderBy: [{ [campo]: 'asc' }, { id: 'asc' }],
      take: MAX_EVENTOS_CALENDARIO,
    })
  const [abertos, concluidos, agendados] = await Promise.all([
    buscar('abertoEm'),
    buscar('concluidoEm'),
    buscar('agendadoPara'),
  ])

  const evento = (
    tipo: EventoCalendario['tipo'],
    c: (typeof abertos)[number],
    data: Date | null,
  ): EventoCalendario[] =>
    data === null
      ? []
      : [
          {
            tipo,
            chamadoId: c.id,
            assunto: c.assunto,
            data,
            operador: c.operador ? { id: c.operador.id, nome: c.operador.nome, cor: c.operador.corCalendario } : null,
          },
        ]
  return [
    ...abertos.flatMap((c) => evento('abertura', c, c.abertoEm)),
    ...concluidos.flatMap((c) => evento('conclusao', c, c.concluidoEm)),
    ...agendados.flatMap((c) => evento('agendamento', c, c.agendadoPara)),
  ]
    .sort((a, b) => a.data.getTime() - b.data.getTime() || a.chamadoId - b.chamadoId)
    .slice(0, MAX_EVENTOS_CALENDARIO)
}
