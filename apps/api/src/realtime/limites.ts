import { RateLimiterMemory } from 'rate-limiter-flexible'

// Limites por socket (S96, §3.7). A chave de cada limiter é o id do socket (ou socket+chamado).
const porMinuto = (pontos: number) => new RateLimiterMemory({ points: pontos, duration: 60 })

export const limitesEventos = {
  'chamado:entrar': porMinuto(30),
  'chamado:sair': porMinuto(60),
  /** `digitando: true`: 1 a cada 2 s por chamado (excedente descartado em silêncio). */
  'chamado:digitando:true': new RateLimiterMemory({ points: 1, duration: 2 }),
  'chamado:digitando:false': porMinuto(30),
  'presenca:atividade': porMinuto(20),
  'presenca:assinar': porMinuto(20),
} as const

export type EventoLimitado = keyof typeof limitesEventos

/** 120 pacotes a cada 10 s por socket; acima disso, `disconnect(true)`. */
export const limitePacotes = new RateLimiterMemory({ points: 120, duration: 10 })
/** 20 violações em 60 s resultam em `disconnect`. */
export const violacoes = new RateLimiterMemory({ points: 20, duration: 60 })

/** Consome 1 ponto; `false` quando o limite estourou. */
export async function consumir(limiter: RateLimiterMemory, chave: string): Promise<boolean> {
  try {
    await limiter.consume(chave)
    return true
  } catch {
    return false
  }
}
