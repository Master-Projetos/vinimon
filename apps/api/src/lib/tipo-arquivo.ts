import { open } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileTypeFromFile } from 'file-type'

export interface TipoDetectado {
  mime: string
  inline: boolean
}

const LIMITE_TEXTO = 1024 * 1024

/** S66: tipo detectado (não a extensão) → como servir. `inline` só para png, jpeg, gif e webp (S70). */
const PERMITIDOS = new Map<string, TipoDetectado>([
  ['image/png', { mime: 'image/png', inline: true }],
  ['image/jpeg', { mime: 'image/jpeg', inline: true }],
  ['image/gif', { mime: 'image/gif', inline: true }],
  ['image/webp', { mime: 'image/webp', inline: true }],
  ['application/pdf', { mime: 'application/pdf', inline: false }],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false },
  ],
  [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inline: false },
  ],
  [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', inline: false },
  ],
  ['application/vnd.oasis.opendocument.text', { mime: 'application/vnd.oasis.opendocument.text', inline: false }],
  [
    'application/vnd.oasis.opendocument.spreadsheet',
    { mime: 'application/vnd.oasis.opendocument.spreadsheet', inline: false },
  ],
  [
    'application/vnd.oasis.opendocument.presentation',
    { mime: 'application/vnd.oasis.opendocument.presentation', inline: false },
  ],
  ['application/zip', { mime: 'application/zip', inline: false }],
])

const EXTENSOES_CFB = new Set(['.doc', '.xls', '.ppt', '.msg'])
const EXTENSOES_TEXTO = new Set(['.txt', '.csv', '.log'])

/** UTF-8 válido (decodificação fatal) e sem byte NUL, lendo até 1 MiB. */
async function ehTexto(caminho: string): Promise<boolean> {
  const arquivo = await open(caminho, 'r')
  try {
    const buf = Buffer.alloc(LIMITE_TEXTO)
    const { bytesRead } = await arquivo.read(buf, 0, LIMITE_TEXTO, 0)
    const lido = buf.subarray(0, bytesRead)
    if (lido.includes(0)) return false
    // stream: um caractere multibyte cortado no limite de 1 MiB não é erro
    new TextDecoder('utf-8', { fatal: true }).decode(lido, { stream: true })
    return true
  } catch {
    return false
  } finally {
    await arquivo.close()
  }
}

/** Aplica a tabela S66. `null` = tipo não permitido (a rota responde 415 TIPO_ARQUIVO_INVALIDO). */
export async function detectarTipo(caminho: string, nomeOriginal: string): Promise<TipoDetectado | null> {
  const ext = extname(nomeOriginal).toLowerCase()
  const detectado = await fileTypeFromFile(caminho)
  if (detectado) {
    if (detectado.mime === 'application/x-cfb')
      return EXTENSOES_CFB.has(ext) ? { mime: 'application/octet-stream', inline: false } : null
    return PERMITIDOS.get(detectado.mime) ?? null
  }
  if (EXTENSOES_TEXTO.has(ext) && (await ehTexto(caminho))) return { mime: 'text/plain; charset=utf-8', inline: false }
  return null
}

/** S68: nome só para exibição. NFC, sem controles, sem `/`, `\` nem pontos iniciais, até 200 caracteres. */
export function limparNomeArquivo(nome: string): string {
  const semControles = Array.from(nome.normalize('NFC'))
    .filter((c) => {
      const n = c.codePointAt(0) ?? 0
      return n > 0x1f && n !== 0x7f && c !== '/' && c !== '\\'
    })
    .join('')
  const limpo = semControles.replace(/^\.+/, '').trim()
  const cortado = limpo.slice(0, 200)
  return cortado === '' ? 'arquivo' : cortado
}
