import type { Assentamento } from '@vinimon/shared'

/** Estado de uma mensagem que ainda não foi confirmada pelo servidor. */
export type EstadoMensagem = 'enviando' | 'falhou'

/**
 * Item da conversa no cache. Mensagem pendente tem `estado`, `clienteId` (a chave de idempotência do POST) e id
 * negativo, até o servidor confirmar com o assentamento de verdade.
 */
export interface ItemConversa extends Assentamento {
  estado?: EstadoMensagem | undefined
  /** Progresso (0 a 100) do envio dos anexos do comentário. */
  progresso?: number | undefined
  erro?: string | undefined
  /** Arquivos a enviar depois do comentário; guardados para o "Tentar novamente". */
  arquivos?: File[] | undefined
}

export interface PaginaConversa {
  itens: ItemConversa[]
  proximoCursor: number | null
}

const pendente = (i: ItemConversa) => i.estado !== undefined

/** Confirmados por id crescente; pendentes depois, na ordem em que foram enviados. */
export function ordenar(itens: ItemConversa[]): ItemConversa[] {
  const confirmados = itens.filter((i) => !pendente(i)).sort((a, b) => a.id - b.id)
  return [...confirmados, ...itens.filter(pendente)]
}

/**
 * Junta um assentamento ao cache (páginas da mais recente para a mais antiga):
 * 1. se o id já existe, substitui;
 * 2. se o `clienteId` é de uma mensagem pendente, substitui a pendente;
 * 3. senão, insere na página mais recente.
 */
export function mesclarAssentamento(paginas: PaginaConversa[], dto: ItemConversa): PaginaConversa[] {
  const trocar = (alvo: (i: ItemConversa) => boolean): PaginaConversa[] | null => {
    const indice = paginas.findIndex((p) => p.itens.some(alvo))
    if (indice < 0) return null
    return paginas.map((p, n) => (n === indice ? { ...p, itens: ordenar(p.itens.map((i) => (alvo(i) ? dto : i))) } : p))
  }
  const porId = trocar((i) => !pendente(i) && i.id === dto.id)
  if (porId) return porId
  if (dto.clienteId) {
    const porCliente = trocar((i) => pendente(i) && i.clienteId === dto.clienteId)
    if (porCliente) return porCliente
  }
  const [recente, ...resto] = paginas
  if (!recente) return [{ itens: [dto], proximoCursor: null }]
  return [{ ...recente, itens: ordenar([...recente.itens, dto]) }, ...resto]
}

/** Atualiza campos de uma mensagem pendente (estado, progresso, erro). */
export function atualizarItem(
  paginas: PaginaConversa[],
  alvo: (i: ItemConversa) => boolean,
  parcial: Partial<ItemConversa>,
): PaginaConversa[] {
  return paginas.map((p) => ({ ...p, itens: p.itens.map((i) => (alvo(i) ? { ...i, ...parcial } : i)) }))
}

/** Tira do cache a mensagem pendente (descartar). */
export function removerPendente(paginas: PaginaConversa[], clienteId: string): PaginaConversa[] {
  return paginas.map((p) => ({ ...p, itens: p.itens.filter((i) => !(pendente(i) && i.clienteId === clienteId)) }))
}

export const temPendente = (paginas: PaginaConversa[], clienteId: string): boolean =>
  paginas.some((p) => p.itens.some((i) => pendente(i) && i.clienteId === clienteId))
