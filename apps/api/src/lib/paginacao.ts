import type { PaginacaoQuery } from '@vinimon/shared'
export const paginar = ({ pagina, porPagina }: PaginacaoQuery) => ({ skip: (pagina - 1) * porPagina, take: porPagina })
