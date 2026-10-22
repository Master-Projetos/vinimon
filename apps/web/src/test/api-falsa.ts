export type RespostaFalsa = unknown | ((req: Request) => Response)

export interface ChamadaFalsa {
  metodo: string
  url: string
  corpo: unknown
}

export interface ApiFalsa {
  readonly chamadas: ChamadaFalsa[]
  restaurar: () => void
}

const CHAVE_NAO_MAPEADA = 'NAO_ENCONTRADO'

function respostaJson(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

function lerCorpo(texto: BodyInit | null | undefined): unknown {
  if (typeof texto !== 'string') return texto ?? null
  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

/**
 * Substitui `globalThis.fetch` por um falso que responde pelas chaves `'METODO /caminho'`
 * (caminho relativo a /api/v1, sem query). Valor função recebe o Request; outro valor vira JSON 200.
 * Rota não mapeada responde 404. Cada chamada fica registrada em `chamadas`.
 */
export function apiFalsa(respostas: Record<'GET /areas' | string, RespostaFalsa>): ApiFalsa {
  const original = globalThis.fetch
  const chamadas: ChamadaFalsa[] = []

  const falso = (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requisicao = new Request(
      new URL(entrada instanceof Request ? entrada.url : String(entrada), 'http://localhost'),
      init,
    )
    const url = new URL(requisicao.url)
    const caminho = url.pathname.replace(/^\/api\/v1/, '')
    const metodo = requisicao.method.toUpperCase()
    const corpo = lerCorpo(init?.body)
    chamadas.push({ metodo, url: `${url.pathname}${url.search}`, corpo })

    const chave = `${metodo} ${caminho}`
    if (!Object.hasOwn(respostas, chave)) {
      return Promise.resolve(
        respostaJson({ erro: { codigo: CHAVE_NAO_MAPEADA, mensagem: `Rota não mapeada: ${chave}` } }, 404),
      )
    }
    const resposta = respostas[chave]
    if (typeof resposta === 'function') return Promise.resolve((resposta as (req: Request) => Response)(requisicao))
    return Promise.resolve(respostaJson(resposta, 200))
  }

  globalThis.fetch = falso as typeof globalThis.fetch
  return {
    chamadas,
    restaurar: () => {
      globalThis.fetch = original
    },
  }
}
