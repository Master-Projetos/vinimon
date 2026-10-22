import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { detectarTipo, limparNomeArquivo } from './tipo-arquivo'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n')
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const ZIP_VAZIO = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)])
const CFB = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)])
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)])

describe('detectarTipo (T43)', () => {
  let dir: string
  const grava = async (nome: string, conteudo: Buffer | string) => {
    const caminho = join(dir, nome)
    await writeFile(caminho, conteudo)
    return caminho
  }
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vinimon-tipo-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('PNG renomeado para .pdf é tratado como image/png, inline', async () => {
    expect(await detectarTipo(await grava('a.bin', PNG), 'relatorio.pdf')).toEqual({ mime: 'image/png', inline: true })
  })

  it('gif é inline; pdf e zip não são', async () => {
    expect(await detectarTipo(await grava('g.bin', GIF), 'g.gif')).toEqual({ mime: 'image/gif', inline: true })
    expect(await detectarTipo(await grava('p.bin', PDF), 'p.pdf')).toEqual({ mime: 'application/pdf', inline: false })
    expect(await detectarTipo(await grava('z.bin', ZIP_VAZIO), 'z.zip')).toEqual({
      mime: 'application/zip',
      inline: false,
    })
  })

  it('HTML como .png, SVG e executável MZ dão null (415)', async () => {
    expect(await detectarTipo(await grava('h.bin', '<html><script>alert(1)</script></html>'), 'foto.png')).toBeNull()
    expect(
      await detectarTipo(await grava('s.bin', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'logo.svg'),
    ).toBeNull()
    expect(await detectarTipo(await grava('e.bin', EXE), 'setup.exe')).toBeNull()
    expect(await detectarTipo(await grava('e2.bin', EXE), 'setup.pdf')).toBeNull()
  })

  it('cfb só com extensão .doc, .xls, .ppt ou .msg, servido como octet-stream', async () => {
    const caminho = await grava('c.bin', CFB)
    for (const nome of ['a.doc', 'a.XLS', 'a.ppt', 'a.msg']) {
      expect(await detectarTipo(caminho, nome)).toEqual({ mime: 'application/octet-stream', inline: false })
    }
    expect(await detectarTipo(caminho, 'a.txt')).toBeNull()
  })

  it('.csv UTF-8 é aceito como text/plain; .txt com byte NUL dá null', async () => {
    expect(await detectarTipo(await grava('t.bin', 'nome;valor\nAção;1\n'), 'dados.csv')).toEqual({
      mime: 'text/plain; charset=utf-8',
      inline: false,
    })
    expect(await detectarTipo(await grava('n.bin', Buffer.from('abc\0def')), 'notas.txt')).toBeNull()
  })

  it('texto com UTF-8 inválido dá null; texto com extensão não listada dá null', async () => {
    expect(await detectarTipo(await grava('i.bin', Buffer.from([0x61, 0xff, 0xfe, 0x62])), 'x.txt')).toBeNull()
    expect(await detectarTipo(await grava('o.bin', 'texto comum'), 'x.md')).toBeNull()
  })

  it('caractere multibyte cortado no limite de 1 MiB não reprova um texto válido', async () => {
    const corpo = Buffer.concat([Buffer.alloc(1024 * 1024 - 1, 0x61), Buffer.from('ã'), Buffer.from('fim')])
    expect(await detectarTipo(await grava('g.txt.bin', corpo), 'grande.log')).toEqual({
      mime: 'text/plain; charset=utf-8',
      inline: false,
    })
  })
})

describe('limparNomeArquivo (T45, S68)', () => {
  it('nome de path traversal com CR/LF sai limpo', () => {
    expect(limparNomeArquivo('../../etc/passwd\r\n.png')).toBe('etcpasswd.png')
  })

  it('remove NUL, barras e pontos iniciais, e limita a 200 caracteres', () => {
    expect(limparNomeArquivo('\0\u007f..oculto\\x.pdf')).toBe('ocultox.pdf')
    expect(limparNomeArquivo(`${'a'.repeat(300)}.png`)).toHaveLength(200)
  })

  it('normaliza para NFC e nunca devolve vazio', () => {
    expect(limparNomeArquivo('ã.png')).toBe('ã.png')
    expect(limparNomeArquivo('..')).toBe('arquivo')
  })
})
