import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Readable } from 'node:stream'
import type { DiscoLocal } from '../../src/lib/armazenamento'
import { prisma } from '../../src/lib/prisma'
import { detectarTipo } from '../../src/lib/tipo-arquivo'
import type { AnexoLote } from './transformar'

/** Anexo com o que só o pipeline de arquivos conhece: tipo detectado, tamanho real e sha256. */
export type AnexoCompleto = Omit<AnexoLote, 'mime'> & { mime: string; sha256: string }

export type ResultadoArquivos = {
  /** Linhas prontas para o `createMany`. Anexos já gravados em execução anterior não entram. */
  prontos: AnexoCompleto[]
  avisos: string[]
  /** Arquivos efetivamente gravados em `UPLOAD_DIR` (zero no dry-run). */
  gravados: number
  /** Anexos que já existiam no banco e foram pulados sem ler o BLOB. */
  jaExistentes: number
}

const LOTE = 200
const OCTET = 'application/octet-stream'

/** Abre uma CÓPIA do SQLite da v1 (como `lerV1`) para ler um BLOB por vez. Devolve o leitor e o `fechar`. */
export function abrirOrigem(caminho: string): { lerBlob: (id: number) => Buffer | null; fechar: () => void } {
  if (!existsSync(caminho)) throw new Error(`Arquivo SQLite não encontrado: ${caminho}`)
  const dir = mkdtempSync(join(tmpdir(), 'vinimon-v1-blobs-'))
  const copia = join(dir, basename(caminho))
  copyFileSync(caminho, copia)
  for (const sufixo of ['-wal', '-shm'])
    if (existsSync(caminho + sufixo)) copyFileSync(caminho + sufixo, copia + sufixo)
  const db = new DatabaseSync(copia)
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const consulta = db.prepare('SELECT dados FROM anexos WHERE id = ?')
  return {
    lerBlob: (id) => {
      const linha = consulta.get(id)
      const dados = linha?.dados
      if (dados === null || dados === undefined) return null
      return Buffer.isBuffer(dados) ? dados : dados instanceof Uint8Array ? Buffer.from(dados) : null
    },
    fechar: () => {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/**
 * Passo 4 da §4.5: lê um BLOB por vez e o passa pelo MESMO pipeline do upload (S72): `receber` (tmp + sha256),
 * `detectarTipo` (tipo fora da lista vira `application/octet-stream`, sempre `attachment`) e `efetivar` em
 * `AAAA/MM/<uuidLegado>`. Antes de ler, descarta os ids que já estão no banco: uma segunda execução não lê nem grava
 * nada, então não duplica linha nem arquivo. No dry-run só calcula o sha256 (nada vai para o disco).
 */
export async function prepararArquivos(opcoes: {
  caminhoSqlite: string
  anexos: readonly AnexoLote[]
  /** uuid determinístico (`uuidLegado`) → id do anexo na v1, para achar o BLOB. */
  idsLegado: ReadonlyMap<string, number>
  disco: DiscoLocal | null
  dryRun: boolean
}): Promise<ResultadoArquivos> {
  const avisos: string[] = []
  const prontos: AnexoCompleto[] = []
  let gravados = 0
  let jaExistentes = 0
  const origem = abrirOrigem(opcoes.caminhoSqlite)
  try {
    for (let i = 0; i < opcoes.anexos.length; i += LOTE) {
      const lote = opcoes.anexos.slice(i, i + LOTE)
      const existentes = new Set(
        (await prisma.anexo.findMany({ where: { id: { in: lote.map((a) => a.id) } }, select: { id: true } })).map(
          (a) => a.id,
        ),
      )
      for (const anexo of lote) {
        if (existentes.has(anexo.id)) {
          jaExistentes++
          continue
        }
        const idLegado = opcoes.idsLegado.get(anexo.id)
        const blob = idLegado === undefined ? null : origem.lerBlob(idLegado)
        if (blob === null || blob.length === 0) {
          avisos.push(
            `anexo ${idLegado ?? '?'} "${anexo.nomeOriginal}" (chamado ${anexo.chamadoId}) sem conteúdo no sistema anterior: não migrado`,
          )
          continue
        }
        if (opcoes.dryRun || opcoes.disco === null) {
          prontos.push({ ...anexo, tamanho: blob.length, sha256: createHash('sha256').update(blob).digest('hex') })
          continue
        }
        const recebido = await opcoes.disco.receber(Readable.from([blob]), blob.length)
        try {
          const tipo = await detectarTipo(recebido.caminhoLocal, anexo.nomeOriginal)
          await opcoes.disco.efetivar(recebido.temporario, anexo.storageChave)
          gravados++
          prontos.push({ ...anexo, mime: tipo?.mime ?? OCTET, tamanho: recebido.tamanho, sha256: recebido.sha256 })
        } finally {
          await opcoes.disco.descartar(recebido.temporario)
        }
      }
    }
  } finally {
    origem.fechar()
  }
  return { prontos, avisos, gravados, jaExistentes }
}
