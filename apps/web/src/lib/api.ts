import { type Contrato, CSRF_HEADER, type ErroResposta } from '@vinimon/shared'
import type { z } from 'zod'

type Entrada<C extends Contrato> = (C extends { params: infer P extends z.ZodType }
  ? { params: z.output<P> }
  : unknown) &
  (C extends { query: infer Q extends z.ZodType } ? { query?: Partial<z.output<Q>> } : unknown) &
  (C extends { body: infer B extends z.ZodType } ? { body: z.input<B> } : unknown)
type EntradaBruta = { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown }

let tokenCsrf: string | null = null
let renovarCsrf: (() => Promise<void>) | null = null
/** O token CSRF vive só em memória (S80). */
export const definirCsrf = (token: string | null): void => {
  tokenCsrf = token
}
export const definirRenovadorCsrf = (fn: () => Promise<void>): void => {
  renovarCsrf = fn
}

export class ErroApi extends Error {
  readonly status: number
  readonly codigo: string
  readonly detalhes: { campo: string; mensagem: string }[]
  readonly requestId: string | undefined
  /** Segundos até nova tentativa, vindos do header `Retry-After` (só quando válido). */
  readonly retryAfter?: number
  constructor(
    status: number,
    corpo: ErroResposta | null,
    mensagemPadrao = 'Falha de comunicação com o servidor.',
    retryAfter?: number,
  ) {
    super(corpo?.erro.mensagem ?? mensagemPadrao)
    this.name = 'ErroApi'
    this.status = status
    this.codigo = corpo?.erro.codigo ?? (status === 0 ? 'REDE' : 'INTERNO')
    this.detalhes = corpo?.erro.detalhes ?? []
    this.requestId = corpo?.erro.requestId
    if (retryAfter !== undefined) this.retryAfter = retryAfter
  }
}

/** Lê `Retry-After` como inteiro de segundos; valor ausente ou inválido vira undefined. */
function lerRetryAfter(resposta: Response): number | undefined {
  const valor = resposta.headers.get('retry-after')?.trim()
  if (valor === undefined || !/^\d+$/.test(valor)) return undefined
  return Number(valor)
}

function montarUrl(c: Contrato, params?: Record<string, unknown>, query?: Record<string, unknown>): string {
  let caminho: string = c.caminho
  for (const [k, v] of Object.entries(params ?? {})) caminho = caminho.replace(`:${k}`, encodeURIComponent(String(v)))
  const busca = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) for (const item of v) busca.append(k, String(item))
    else busca.set(k, String(v))
  }
  const qs = busca.toString()
  return `/api/v1${caminho}${qs ? `?${qs}` : ''}`
}

async function requisitar(c: Contrato, e: EntradaBruta, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {}
  if (e.body !== undefined) headers['content-type'] = 'application/json'
  if (c.metodo !== 'GET' && tokenCsrf) headers[CSRF_HEADER] = tokenCsrf
  try {
    return await fetch(montarUrl(c, e.params, e.query), {
      method: c.metodo,
      headers,
      body: e.body === undefined ? undefined : JSON.stringify(e.body),
      credentials: 'same-origin',
      signal,
    })
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'AbortError') throw erro
    throw new ErroApi(0, null, 'Sem conexão com o servidor.')
  }
}

export async function chamar<C extends Contrato>(
  c: C,
  entrada: Entrada<C> & EntradaBruta,
  signal?: AbortSignal,
): Promise<z.output<C['resposta']>> {
  let resposta = await requisitar(c, entrada, signal)
  if (resposta.status === 403 && c.metodo !== 'GET' && renovarCsrf) {
    const corpo = (await resposta
      .clone()
      .json()
      .catch(() => null)) as ErroResposta | null
    if (corpo?.erro.codigo === 'CSRF_INVALIDO') {
      await renovarCsrf()
      resposta = await requisitar(c, entrada, signal) // repete UMA vez
    }
  }
  if (resposta.status === 204) return undefined as z.output<C['resposta']>
  const json: unknown = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new ErroApi(resposta.status, json as ErroResposta | null, undefined, lerRetryAfter(resposta))
  return c.resposta.parse(json) as z.output<C['resposta']>
}

/**
 * Upload multipart com progresso (XMLHttpRequest). Mesmo CSRF_HEADER e mesmo tratamento de ErroApi de chamar().
 * Os arquivos vão no campo `arquivos`; os demais campos do formulário vão em `campos`.
 */
export function enviarArquivo(
  caminho: string,
  arquivos: File[],
  campos: Record<string, string>,
  aoProgresso: (pct: number) => void,
  signal?: AbortSignal,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Envio cancelado.', 'AbortError'))
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/v1${caminho}`)
    xhr.withCredentials = true
    if (tokenCsrf) xhr.setRequestHeader(CSRF_HEADER, tokenCsrf)
    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable) aoProgresso(Math.round((evento.loaded / evento.total) * 100))
    }
    xhr.onload = () => {
      let json: unknown = null
      try {
        json = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        json = null
      }
      if (xhr.status === 204) {
        resolve(undefined)
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(json)
      else reject(new ErroApi(xhr.status, json as ErroResposta | null))
    }
    xhr.onerror = () => reject(new ErroApi(0, null, 'Sem conexão com o servidor.'))
    xhr.onabort = () => reject(new DOMException('Envio cancelado.', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })

    const formulario = new FormData()
    for (const [chave, valor] of Object.entries(campos)) formulario.append(chave, valor)
    for (const arquivo of arquivos) formulario.append('arquivos', arquivo)
    xhr.send(formulario)
  })
}
