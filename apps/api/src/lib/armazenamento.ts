import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { type Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ErroApp } from './erros'

export interface ArmazenamentoAnexos {
  /** Grava o stream em <raiz>/tmp/<uuid>, calculando sha256 e tamanho; lança 413 acima do limite. */
  receber(
    origem: Readable,
    limiteBytes: number,
  ): Promise<{ temporario: string; caminhoLocal: string; tamanho: number; sha256: string }>
  /** rename atômico para AAAA/MM/<uuid>. */
  efetivar(temporario: string, chave: string): Promise<void>
  /** Sempre no finally; não falha se o temporário já não existe. */
  descartar(temporario: string): Promise<void>
  abrirLeitura(chave: string): Readable
  remover(chave: string): Promise<void>
}

/** S67: uuid de qualquer versão (inclui o v8 determinístico dos anexos importados). */
const RE_CHAVE = /^\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const chaveNova = (agora: Date, uuid: string): string => {
  const mes = String(agora.getUTCMonth() + 1).padStart(2, '0')
  return `${agora.getUTCFullYear()}/${mes}/${uuid}`
}

export class DiscoLocal implements ArmazenamentoAnexos {
  private readonly raiz: string

  constructor(raiz: string) {
    this.raiz = resolve(raiz)
  }

  /** Valida a regex da chave e confere que o caminho final continua dentro da raiz. */
  resolver(chave: string): string {
    if (!RE_CHAVE.test(chave)) throw new ErroApp(400, 'REQUISICAO_INVALIDA', 'Chave de arquivo inválida.')
    const caminho = resolve(this.raiz, chave)
    if (!caminho.startsWith(this.raiz + sep))
      throw new ErroApp(400, 'REQUISICAO_INVALIDA', 'Chave de arquivo inválida.')
    return caminho
  }

  private caminhoTemporario(temporario: string): string {
    if (!RE_UUID.test(temporario)) throw new ErroApp(400, 'REQUISICAO_INVALIDA', 'Arquivo temporário inválido.')
    return resolve(this.raiz, 'tmp', temporario)
  }

  async receber(origem: Readable, limiteBytes: number) {
    const temporario = randomUUID()
    const caminhoLocal = this.caminhoTemporario(temporario)
    await mkdir(dirname(caminhoLocal), { recursive: true })
    const hash = createHash('sha256')
    let tamanho = 0
    const contador = new Transform({
      transform(pedaco: Buffer, _codificacao, cb) {
        tamanho += pedaco.length
        if (tamanho > limiteBytes) {
          cb(new ErroApp(413, 'ARQUIVO_GRANDE', 'Arquivo maior que o limite permitido.'))
          return
        }
        hash.update(pedaco)
        cb(null, pedaco)
      },
    })
    try {
      await pipeline(origem, contador, createWriteStream(caminhoLocal, { flags: 'wx', mode: 0o600 }))
    } catch (erro) {
      await rm(caminhoLocal, { force: true })
      throw erro
    }
    return { temporario, caminhoLocal, tamanho, sha256: hash.digest('hex') }
  }

  async efetivar(temporario: string, chave: string): Promise<void> {
    const destino = this.resolver(chave)
    await mkdir(dirname(destino), { recursive: true })
    await rename(this.caminhoTemporario(temporario), destino)
  }

  async descartar(temporario: string): Promise<void> {
    await rm(this.caminhoTemporario(temporario), { force: true })
  }

  abrirLeitura(chave: string): Readable {
    return createReadStream(this.resolver(chave))
  }

  async remover(chave: string): Promise<void> {
    await rm(this.resolver(chave), { force: true })
  }
}
