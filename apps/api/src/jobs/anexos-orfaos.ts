import { opendir, rm, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { env } from '../env'
import { prisma } from '../lib/prisma'

const UM_DIA_MS = 24 * 60 * 60 * 1000
const LOTE = 500

/** Arquivos (caminho absoluto) com mais de 24 h, de `raiz` inclusive `tmp/`, via `opendir` recursivo. */
async function* arquivosAntigos(raiz: string, dir: string, limiteMs: number): AsyncGenerator<string> {
  let aberto: Awaited<ReturnType<typeof opendir>>
  try {
    aberto = await opendir(dir)
  } catch {
    return // diretório inexistente: nada a limpar
  }
  for await (const entrada of aberto) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) yield* arquivosAntigos(raiz, caminho, limiteMs)
    else if (entrada.isFile() && !entrada.name.startsWith('.')) {
      const { mtimeMs } = await stat(caminho)
      if (mtimeMs < limiteMs) yield caminho
    }
  }
}

/**
 * Remove os arquivos de `UPLOAD_DIR` (inclusive `tmp/`) com mais de 24 h e sem linha em `anexos` (S123). A chave de
 * um anexo é o caminho relativo `AAAA/MM/<uuid>`; o que está em `tmp/` nunca é chave e, se antigo, é resto de upload
 * que falhou. A checagem no banco é em lotes de 500 chaves com `id in`. Devolve quantos foram removidos.
 */
export async function removerAnexosOrfaos(agora: Date, raiz: string = env.UPLOAD_DIR): Promise<number> {
  const limiteMs = agora.getTime() - UM_DIA_MS
  let removidos = 0
  let lote: Array<{ caminho: string; chave: string }> = []

  const processar = async () => {
    if (lote.length === 0) return
    const existentes = await prisma.anexo.findMany({
      where: { storageChave: { in: lote.map((l) => l.chave) } },
      select: { storageChave: true },
    })
    const vivos = new Set(existentes.map((e) => e.storageChave))
    for (const l of lote) {
      if (vivos.has(l.chave)) continue
      await rm(l.caminho, { force: true })
      removidos += 1
    }
    lote = []
  }

  for await (const caminho of arquivosAntigos(raiz, raiz, limiteMs)) {
    lote.push({ caminho, chave: relative(raiz, caminho).split(sep).join('/') })
    if (lote.length >= LOTE) await processar()
  }
  await processar()
  return removidos
}
