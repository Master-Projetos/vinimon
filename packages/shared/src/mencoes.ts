/** Menção no texto: `@[Nome](usuario:ID)`. Nome de 1 a 80 caracteres, sem colchete nem quebra de linha. */
export const criarMencaoRe = () => /@\[([^\][\n]{1,80})\]\(usuario:(\d{1,10})\)/g

export type Mencao = { id: number; nome: string }

export type Segmento =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'mencao'; id: number; nome: string }
  | { tipo: 'link'; href: string }

/** Devolve as menções do texto, sem repetir o mesmo id, na ordem em que aparecem. */
export const extrairMencoes = (texto: string): Mencao[] => {
  const vistos = new Set<number>()
  const mencoes: Mencao[] = []
  for (const m of texto.matchAll(criarMencaoRe())) {
    const id = Number(m[2])
    if (vistos.has(id)) continue
    vistos.add(id)
    mencoes.push({ id, nome: m[1] ?? '' })
  }
  return mencoes
}

/** Monta o token da menção. Remove `[]()` e quebras de linha do nome e corta em 80 caracteres. */
export const serializarMencao = ({ id, nome }: Mencao): string => {
  const nomeLimpo = nome.replace(/[[\]()\n]/g, '').slice(0, 80)
  return `@[${nomeLimpo}](usuario:${id})`
}

/** Troca cada token pelo `@Nome`, para uso em texto puro (e-mail, notificação). */
export const textoPlano = (texto: string): string => texto.replace(criarMencaoRe(), (_, nome: string) => `@${nome}`)

/** Quebra o texto em trechos de texto, menções e links. Só http(s) vira link, e pontuação final fica de fora. */
export const segmentarTexto = (texto: string): Segmento[] => {
  const re = new RegExp(`${criarMencaoRe().source}|(https?://[^\\s<>[\\]]*[^\\s<>[\\].,;:!?)])`, 'g')
  const segmentos: Segmento[] = []
  let ultimo = 0
  for (const m of texto.matchAll(re)) {
    const inicio = m.index
    if (inicio > ultimo) segmentos.push({ tipo: 'texto', valor: texto.slice(ultimo, inicio) })
    const href = m[3]
    if (href !== undefined) segmentos.push({ tipo: 'link', href })
    else segmentos.push({ tipo: 'mencao', id: Number(m[2]), nome: m[1] ?? '' })
    ultimo = inicio + m[0].length
  }
  if (ultimo < texto.length) segmentos.push({ tipo: 'texto', valor: texto.slice(ultimo) })
  return segmentos
}

/** Troca, em ordem, o primeiro `@Nome` de cada menção selecionada pelo token. Menção apagada do texto é ignorada. */
export const serializarComposer = (visivel: string, selecionadas: Mencao[]): string => {
  let saida = visivel
  for (const mencao of selecionadas) {
    saida = saida.replace(`@${mencao.nome}`, () => serializarMencao(mencao))
  }
  return saida
}
