import type { EventosCliente, EventosServidor } from '@vinimon/shared'
import type { ErroConexao, SocketCliente } from '@/lib/socket'

type Ouvinte = (...args: unknown[]) => void

/** Duplo do socket para testes: sem rede. `disparar` simula o servidor; `emitidos` registra o que o cliente enviou. */
export class SocketFalso implements SocketCliente {
  conectado = false
  conexoes = 0
  desconexoes = 0
  readonly emitidos: Array<{ evento: string; args: unknown[] }> = []
  private readonly ouvintes = new Map<string, Set<Ouvinte>>()

  conectar(): void {
    this.conexoes += 1
  }
  desconectar(): void {
    this.desconexoes += 1
    this.conectado = false
  }
  aoEvento(evento: 'connect' | 'disconnect' | 'connect_error', ouvinte: (erro?: ErroConexao) => void): () => void {
    return this.registrar(evento, (...args) => {
      Reflect.apply(ouvinte, undefined, args)
    })
  }
  ouvir<E extends keyof EventosServidor>(
    evento: E,
    ouvinte: (...args: Parameters<EventosServidor[E]>) => void,
  ): () => void {
    return this.registrar(evento, (...args) => {
      Reflect.apply(ouvinte, undefined, args)
    })
  }
  emitir<E extends keyof EventosCliente>(evento: E, ...args: Parameters<EventosCliente[E]>): void {
    this.emitidos.push({ evento, args })
  }

  /** Simula o servidor aceitando a conexão. */
  conectou(): void {
    this.conectado = true
    this.disparar('connect')
  }
  /** Simula a queda da conexão. */
  caiu(): void {
    this.conectado = false
    this.disparar('disconnect')
  }
  erroDeConexao(codigo?: string): void {
    this.disparar('connect_error', { message: codigo ?? 'falhou', data: codigo ? { codigo } : undefined })
  }
  /** Quantos ouvintes (de qualquer evento) continuam registrados. */
  get ouvintesAtivos(): number {
    let n = 0
    for (const s of this.ouvintes.values()) n += s.size
    return n
  }
  disparar(evento: string, ...args: unknown[]): void {
    for (const o of [...(this.ouvintes.get(evento) ?? [])]) o(...args)
  }

  private registrar(evento: string, ouvinte: Ouvinte): () => void {
    const conjunto = this.ouvintes.get(evento) ?? new Set<Ouvinte>()
    conjunto.add(ouvinte)
    this.ouvintes.set(evento, conjunto)
    return () => {
      conjunto.delete(ouvinte)
    }
  }
}
