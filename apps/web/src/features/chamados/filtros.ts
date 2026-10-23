import {
  type ChamadoFiltros,
  ChamadoFiltrosSchema,
  ORDENS_CHAMADO,
  type Perfil,
  temPermissao,
  VISOES_CHAMADO,
  type VisaoChamado,
  zBusca,
} from '@vinimon/shared'
import { z } from 'zod'

/**
 * Filtros de /chamados na URL (§3.6). Deriva do schema compartilhado, mas sem defaults: o que não está na URL
 * continua ausente, e a URL fica curta. Dois ajustes porque o router já interpreta a query como JSON:
 * `busca` numérica chega como número e `teveRejeicao` chega como booleano.
 */
export const ChamadoBuscaSchema = ChamadoFiltrosSchema.partial().extend({
  pagina: z.coerce.number().int().min(1).max(10_000).optional(),
  porPagina: z.coerce.number().int().min(1).max(100).optional(),
  busca: z.preprocess((v) => (typeof v === 'number' ? String(v) : v), zBusca().optional()),
  teveRejeicao: z.boolean().optional(),
  ordem: z.enum(ORDENS_CHAMADO).optional(),
  direcao: z.enum(['asc', 'desc']).optional(),
})
export type ChamadoBusca = z.output<typeof ChamadoBuscaSchema>

/** Filtros no formato que a API aceita (todos opcionais). */
export type FiltrosChamado = Partial<ChamadoFiltros>

export interface VisaoDef {
  id: VisaoChamado
  rotulo: string
  /** Visão só da equipe (`chamado.atender`). */
  equipe: boolean
}

export const VISOES: readonly VisaoDef[] = [
  { id: 'minha-fila', rotulo: 'Minha fila', equipe: true },
  { id: 'fila-aberta', rotulo: 'Fila aberta', equipe: true },
  { id: 'minha-area', rotulo: 'Minha área', equipe: true },
  { id: 'agendados', rotulo: 'Agendados', equipe: true },
  { id: 'abertos-por-mim', rotulo: 'Abertos por mim', equipe: false },
  { id: 'aguardando-validacao', rotulo: 'Aguardando validação', equipe: false },
  { id: 'encerrados', rotulo: 'Encerrados', equipe: false },
  { id: 'todos', rotulo: 'Todos', equipe: false },
]

/** Visões que o perfil enxerga: a equipe vê todas; o solicitante, só as dele. */
export function visoesDoPerfil(perfil: Perfil): VisaoDef[] {
  const equipe = temPermissao(perfil, 'chamado.atender')
  return VISOES.filter((v) => equipe || !v.equipe)
}

/** Visão em que o perfil cai quando a URL não traz `visao`. */
export function visaoPadrao(perfil: Perfil): VisaoChamado {
  return temPermissao(perfil, 'chamado.atender') ? 'minha-fila' : 'abertos-por-mim'
}

/** `visao` da URL se o perfil puder usá-la; senão, a padrão. */
export function visaoEfetiva(visao: VisaoChamado | undefined, perfil: Perfil): VisaoChamado {
  if (visao !== undefined && visoesDoPerfil(perfil).some((v) => v.id === visao)) return visao
  return visaoPadrao(perfil)
}

export const ehVisao = (v: string): v is VisaoChamado => (VISOES_CHAMADO as readonly string[]).includes(v)

/** Troca a visão preservando os demais filtros; a paginação volta para o começo. */
export function comVisao(busca: ChamadoBusca, visao: VisaoChamado): ChamadoBusca {
  return { ...busca, visao, pagina: undefined }
}

/** Remove todos os filtros (mantém a visão). */
export function limparFiltros(busca: ChamadoBusca): ChamadoBusca {
  return busca.visao === undefined ? {} : { visao: busca.visao }
}
