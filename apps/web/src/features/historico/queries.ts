import { queryOptions } from '@tanstack/react-query'
import { type Assentamento, assentamentosApi, chamadosApi } from '@vinimon/shared'
import { chamadoChaves } from '@/features/chamados/queries'
import { chamar } from '@/lib/api'

/** Linha do tempo de `ChamadoEvento` (`GET /chamados/:id/historico`). Sem cursor: a API devolve tudo. */
export const historicoConsulta = (id: number) =>
  queryOptions({
    queryKey: [...chamadoChaves.tudo, 'historico', id] as const,
    queryFn: ({ signal }) => chamar(chamadosApi.historico, { params: { id } }, signal),
  })

const TAMANHO_PAGINA = 100

/**
 * Comentários públicos para a impressão (`interno = false`, tipo COMENTARIO). Percorre todas as páginas do
 * cursor, do mais recente para o mais antigo; a impressão mostra na ordem cronológica.
 */
export const comentariosPublicosConsulta = (id: number) =>
  queryOptions({
    queryKey: [...chamadoChaves.tudo, 'comentarios-publicos', id] as const,
    queryFn: async ({ signal }) => {
      const itens: Assentamento[] = []
      let antesDe: number | undefined
      do {
        const pagina = await chamar(
          assentamentosApi.listar,
          { params: { id }, query: { limite: TAMANHO_PAGINA, ...(antesDe === undefined ? {} : { antesDe }) } },
          signal,
        )
        itens.push(...pagina.itens)
        antesDe = pagina.proximoCursor ?? undefined
      } while (antesDe !== undefined)
      return itens
        .filter((a) => !a.interno && a.tipo === 'COMENTARIO')
        .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())
    },
  })
