import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { env } from '../../env'
import { invalidarConfig } from '../../lib/config'
import { prisma } from '../../lib/prisma'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const MIB = 1024 * 1024

type Parte = { campo: string; valor: string } | { arquivo: string; nome: string; conteudo: Buffer }

function multipart(partes: Parte[]) {
  const limite = `----vinimon${randomUUID()}`
  const blocos: Buffer[] = []
  for (const p of partes) {
    if ('valor' in p) {
      blocos.push(Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${p.campo}"\r\n\r\n${p.valor}\r\n`))
    } else {
      blocos.push(
        Buffer.from(
          `--${limite}\r\nContent-Disposition: form-data; name="${p.arquivo}"; filename="${p.nome}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
        ),
        p.conteudo,
        Buffer.from('\r\n'),
      )
    }
  }
  blocos.push(Buffer.from(`--${limite}--\r\n`))
  return { payload: Buffer.concat(blocos), tipo: `multipart/form-data; boundary=${limite}` }
}

describe('módulo anexos (S63–S71, S87, T44, T45, T46, T47)', () => {
  let app: App
  let base = 0 // arquivos que já estavam em UPLOAD_DIR antes do teste (o diretório é compartilhado)

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
    invalidarConfig()
    await semearBase()
    base = await contarArquivos()
  })
  afterEach(async () => {
    // nenhum temporário pode sobrar, passe ou falhe o teste (S65)
    const tmp = join(env.UPLOAD_DIR, 'tmp')
    expect(existsSync(tmp) ? await readdir(tmp) : []).toEqual([])
  })

  const enviar = (chamadoId: number, headers: Record<string, string>, partes: Parte[]) => {
    const m = multipart(partes)
    return app.inject({
      method: 'POST',
      url: `/api/v1/chamados/${chamadoId}/anexos`,
      headers: { ...headers, 'content-type': m.tipo },
      payload: m.payload,
    })
  }
  const arquivo = (nome = 'foto.png', conteudo: Buffer = PNG): Parte => ({ arquivo: 'arquivo', nome, conteudo })
  const contarArquivos = async () => {
    const raiz = env.UPLOAD_DIR
    if (!existsSync(raiz)) return 0
    let total = 0
    const andar = async (dir: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.isDirectory()) await andar(join(dir, e.name))
        else total += 1
      }
    }
    await andar(raiz)
    return total
  }
  /** Arquivos criados por este teste. */
  const gravados = async () => (await contarArquivos()) - base
  const configurar = async (chave: string, valor: unknown) => {
    await prisma.config.upsert({
      where: { chave },
      create: { chave, valor: valor as never },
      update: { valor: valor as never },
    })
    invalidarConfig()
  }

  async function cenario() {
    const A = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const outro = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const opX = await criarUsuario({ perfil: 'OPERADOR', areaId: (await criarArea()).id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const c = await criarChamado({ solicitanteId: sol.id, areaId: A.id, papel: 'EM_ATENDIMENTO', operadorId: op.id })
    return {
      A,
      sol,
      outro,
      op,
      opX,
      admin,
      c,
      hSol: await headersDe(sol.id),
      hOutro: await headersDe(outro.id),
      hOp: await headersDe(op.id),
      hOpX: await headersDe(opX.id),
      hAdmin: await headersDe(admin.id),
    }
  }

  describe('enviar', () => {
    it('401 sem sessão e 400 sem multipart', async () => {
      const x = await cenario()
      const semSessao = await app.inject({
        method: 'POST',
        url: `/api/v1/chamados/${x.c.id}/anexos`,
        headers: { origin: x.hSol.origin ?? '' },
      })
      expect(semSessao.statusCode).toBe(401)
      const json = await app.inject({
        method: 'POST',
        url: `/api/v1/chamados/${x.c.id}/anexos`,
        headers: x.hSol,
        payload: { a: 1 },
      })
      expect(json.statusCode).toBe(400)
    })

    it('envia um PNG: 201, arquivo em disco, linha, evento e atividade; tmp vazio', async () => {
      const x = await cenario()
      const antes = await prisma.chamado.findUniqueOrThrow({ where: { id: x.c.id } })
      const res = await enviar(x.c.id, x.hSol, [arquivo()])
      expect(res.statusCode).toBe(201)
      const [a] = res.json()
      expect(a).toMatchObject({
        chamadoId: x.c.id,
        nomeOriginal: 'foto.png',
        mime: 'image/png',
        interno: false,
        tamanho: PNG.length,
        enviadoPor: { id: x.sol.id },
      })
      const linha = await prisma.anexo.findUniqueOrThrow({ where: { id: a.id } })
      expect(linha.storageChave).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/)
      expect(linha.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(await gravados()).toBe(1)
      expect(
        await prisma.chamadoEvento.count({ where: { chamadoId: x.c.id, tipo: 'ANEXO_ADICIONADO', interno: false } }),
      ).toBe(1)
      const depois = await prisma.chamado.findUniqueOrThrow({ where: { id: x.c.id } })
      expect(depois.ultimaAtividadeEm.getTime()).toBeGreaterThan(antes.ultimaAtividadeEm.getTime())
    })

    it('T45: nome malicioso vira nome limpo e a chave não depende dele', async () => {
      const x = await cenario()
      const res = await enviar(x.c.id, x.hSol, [arquivo('..\\..\\pa\tss\u0001wd.png')])
      expect(res.statusCode).toBe(201)
      const [a] = res.json()
      expect(a.nomeOriginal).toBe('passwd.png')
      const linha = await prisma.anexo.findUniqueOrThrow({ where: { id: a.id } })
      expect(linha.storageChave).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/)
    })

    it('tipo não permitido (svg, html, exe) dá 415 e não deixa nada no disco', async () => {
      const x = await cenario()
      for (const [nome, conteudo] of [
        ['a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
        ['a.html', Buffer.from('<html><script>alert(1)</script></html>')],
        ['a.exe', Buffer.from('MZ\x90\x00\x03\x00\x00\x00')],
      ] as const) {
        const res = await enviar(x.c.id, x.hSol, [arquivo(nome, conteudo)])
        expect(res.statusCode, nome).toBe(415)
        expect(res.json().erro.codigo).toBe('TIPO_ARQUIVO_INVALIDO')
      }
      expect(await gravados()).toBe(0)
      expect(await prisma.anexo.count()).toBe(0)
    })

    it('texto UTF-8 .txt é aceito e servido como text/plain', async () => {
      const x = await cenario()
      const res = await enviar(x.c.id, x.hSol, [arquivo('nota.txt', Buffer.from('olá, mundo'))])
      expect(res.statusCode).toBe(201)
      expect(res.json()[0].mime).toBe('text/plain; charset=utf-8')
    })

    it('T44: arquivo com MAX_ANEXO_MB + 1 byte dá 413 e tmp fica vazio', async () => {
      const x = await cenario()
      const grande = Buffer.concat([PNG, Buffer.alloc(env.MAX_ANEXO_MB * MIB + 1 - PNG.length)])
      const res = await enviar(x.c.id, x.hSol, [arquivo('grande.png', grande)])
      expect(res.statusCode).toBe(413)
      expect(res.json().erro.codigo).toBe('ARQUIVO_GRANDE')
      expect(await gravados()).toBe(0)
      expect(await prisma.anexo.count()).toBe(0)
    })

    it('T44: 6 arquivos dão 413 e nada é gravado (nem os 5 primeiros)', async () => {
      const x = await cenario()
      const res = await enviar(
        x.c.id,
        x.hSol,
        Array.from({ length: 6 }, (_, i) => arquivo(`f${i}.png`)),
      )
      expect(res.statusCode).toBe(413)
      expect(await gravados()).toBe(0)
      expect(await prisma.anexo.count()).toBe(0)
    })

    it('T44: a cota de 100 MB por chamado dá 413 sem tocar no disco', async () => {
      const x = await cenario()
      await prisma.anexo.create({
        data: {
          id: randomUUID(),
          chamadoId: x.c.id,
          enviadoPorId: x.sol.id,
          nomeOriginal: 'enorme.bin',
          mime: 'application/pdf',
          tamanho: 100 * MIB,
          sha256: 'a'.repeat(64),
          storageChave: `2026/01/${randomUUID()}`,
        },
      })
      const res = await enviar(x.c.id, x.hSol, [arquivo()])
      expect(res.statusCode).toBe(413)
      expect(await gravados()).toBe(0)
    })

    it('cota de 50 arquivos por chamado dá 413', async () => {
      const x = await cenario()
      await prisma.anexo.createMany({
        data: Array.from({ length: 50 }, () => ({
          id: randomUUID(),
          chamadoId: x.c.id,
          enviadoPorId: x.sol.id,
          nomeOriginal: 'a.png',
          mime: 'image/png',
          tamanho: 10,
          sha256: 'b'.repeat(64),
          storageChave: `2026/01/${randomUUID()}`,
        })),
      })
      expect((await enviar(x.c.id, x.hSol, [arquivo()])).statusCode).toBe(413)
    })

    it('T47: sem acesso ao chamado dá 404 sem gravar no disco; encerrado dá 409; habilitados=false dá 403', async () => {
      const x = await cenario()
      expect((await enviar(x.c.id, x.hOutro, [arquivo()])).statusCode).toBe(404)
      expect((await enviar(x.c.id, x.hOpX, [arquivo()])).statusCode).toBe(404)
      expect((await enviar(999_999, x.hSol, [arquivo()])).statusCode).toBe(404)
      const encerrado = await criarChamado({
        solicitanteId: x.sol.id,
        areaId: x.A.id,
        papel: 'ENCERRADO',
        operadorId: x.op.id,
      })
      expect((await enviar(encerrado.id, x.hSol, [arquivo()])).statusCode).toBe(409)
      await configurar('anexos.habilitados', false)
      const desligado = await enviar(x.c.id, x.hSol, [arquivo()])
      expect(desligado.statusCode).toBe(403)
      expect(await gravados()).toBe(0)
    })

    it('T47: USUARIO com interno=true dá 403 e nada vai para o disco; a equipe pode', async () => {
      const x = await cenario()
      const proibido = await enviar(x.c.id, x.hSol, [{ campo: 'interno', valor: 'true' }, arquivo()])
      expect(proibido.statusCode).toBe(403)
      expect(await gravados()).toBe(0)
      const ok = await enviar(x.c.id, x.hOp, [{ campo: 'interno', valor: 'true' }, arquivo()])
      expect(ok.statusCode).toBe(201)
      expect(ok.json()[0].interno).toBe(true)
      expect(
        await prisma.chamadoEvento.count({ where: { chamadoId: x.c.id, tipo: 'ANEXO_ADICIONADO', interno: true } }),
      ).toBe(1)
    })

    it('campo depois do arquivo dá 400 e valor inválido de interno também', async () => {
      const x = await cenario()
      expect((await enviar(x.c.id, x.hOp, [arquivo(), { campo: 'interno', valor: 'true' }])).statusCode).toBe(400)
      expect((await enviar(x.c.id, x.hOp, [{ campo: 'interno', valor: 'talvez' }, arquivo()])).statusCode).toBe(400)
      expect((await enviar(x.c.id, x.hOp, [{ campo: 'lixo', valor: '1' }, arquivo()])).statusCode).toBe(400)
      expect(await gravados()).toBe(0)
    })

    it('assentamentoId: de outro chamado dá 422; de outro autor dá 422; com mais de 10 min dá 422; válido herda o interno', async () => {
      const x = await cenario()
      const outroChamado = await criarChamado({
        solicitanteId: x.sol.id,
        areaId: x.A.id,
        papel: 'EM_ATENDIMENTO',
        operadorId: x.op.id,
      })
      const comentario = (chamadoId: number, autorId: number, interno: boolean, criadoEm?: Date) =>
        prisma.assentamento.create({
          data: { chamadoId, autorId, tipo: 'COMENTARIO', interno, texto: 'x', ...(criadoEm ? { criadoEm } : {}) },
          select: { id: true },
        })
      const dele = (id: number) => [{ campo: 'assentamentoId', valor: String(id) }, arquivo()]
      expect(
        (await enviar(x.c.id, x.hOp, dele((await comentario(outroChamado.id, x.op.id, false)).id))).statusCode,
      ).toBe(422)
      expect((await enviar(x.c.id, x.hOp, dele((await comentario(x.c.id, x.sol.id, false)).id))).statusCode).toBe(422)
      expect(
        (
          await enviar(
            x.c.id,
            x.hOp,
            dele((await comentario(x.c.id, x.op.id, false, new Date(Date.now() - 11 * 60_000))).id),
          )
        ).statusCode,
      ).toBe(422)
      expect((await enviar(x.c.id, x.hOp, dele(999_999))).statusCode).toBe(422)
      expect(await gravados()).toBe(0)

      const interno = await comentario(x.c.id, x.op.id, true)
      const ok = await enviar(x.c.id, x.hOp, [
        { campo: 'assentamentoId', valor: String(interno.id) },
        { campo: 'interno', valor: 'false' },
        arquivo(),
      ])
      expect(ok.statusCode).toBe(201)
      expect(ok.json()[0]).toMatchObject({ interno: true, assentamentoId: interno.id })
    })
  })

  describe('listar e baixar', () => {
    it('T47: anexo interno é invisível para o solicitante (lista e download dão 404); a equipe vê', async () => {
      const x = await cenario()
      const publico = (await enviar(x.c.id, x.hSol, [arquivo('publico.png')])).json()[0]
      const interno = (
        await enviar(x.c.id, x.hOp, [{ campo: 'interno', valor: 'true' }, arquivo('interno.png')])
      ).json()[0]
      const doSolicitante = await app.inject({
        method: 'GET',
        url: `/api/v1/chamados/${x.c.id}/anexos`,
        headers: x.hSol,
      })
      expect(doSolicitante.json().map((a: { id: string }) => a.id)).toEqual([publico.id])
      expect(
        (await app.inject({ method: 'GET', url: `/api/v1/anexos/${interno.id}`, headers: x.hSol })).statusCode,
      ).toBe(404)
      const daEquipe = await app.inject({ method: 'GET', url: `/api/v1/chamados/${x.c.id}/anexos`, headers: x.hOp })
      expect(daEquipe.json()).toHaveLength(2)
      expect(
        (await app.inject({ method: 'GET', url: `/api/v1/anexos/${interno.id}`, headers: x.hOp })).statusCode,
      ).toBe(200)
    })

    it('T47: fora do escopo dá 404 na lista e no download', async () => {
      const x = await cenario()
      const a = (await enviar(x.c.id, x.hSol, [arquivo()])).json()[0]
      expect(
        (await app.inject({ method: 'GET', url: `/api/v1/chamados/${x.c.id}/anexos`, headers: x.hOutro })).statusCode,
      ).toBe(404)
      expect((await app.inject({ method: 'GET', url: `/api/v1/anexos/${a.id}`, headers: x.hOutro })).statusCode).toBe(
        404,
      )
      expect(
        (await app.inject({ method: 'GET', url: `/api/v1/anexos/${randomUUID()}`, headers: x.hSol })).statusCode,
      ).toBe(404)
      expect((await app.inject({ method: 'GET', url: '/api/v1/anexos/nao-e-uuid', headers: x.hSol })).statusCode).toBe(
        400,
      )
    })

    it('T46: cabeçalhos de S70 (imagem inline; texto como attachment)', async () => {
      const x = await cenario()
      const img = (await enviar(x.c.id, x.hSol, [arquivo('foto.png')])).json()[0]
      const txt = (await enviar(x.c.id, x.hSol, [arquivo('nota.txt', Buffer.from('oi'))])).json()[0]

      const r = await app.inject({ method: 'GET', url: `/api/v1/anexos/${img.id}`, headers: x.hSol })
      expect(r.statusCode).toBe(200)
      expect(r.rawPayload.equals(PNG)).toBe(true)
      expect(r.headers['content-type']).toBe('image/png')
      expect(r.headers['content-disposition']).toMatch(/^inline;/)
      expect(r.headers['x-content-type-options']).toBe('nosniff')
      expect(r.headers['content-security-policy']).toBe(
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      )
      expect(r.headers['cross-origin-resource-policy']).toBe('same-origin')
      expect(r.headers['cache-control']).toBe('private, no-store')

      const t = await app.inject({ method: 'GET', url: `/api/v1/anexos/${txt.id}`, headers: x.hSol })
      expect(t.headers['content-disposition']).toMatch(/^attachment;/)
      expect(t.headers['content-type']).toContain('text/plain')
    })
  })

  describe('excluir', () => {
    it('só ADMIN: apaga arquivo e linha, audita e registra ANEXO_REMOVIDO', async () => {
      const x = await cenario()
      const a = (await enviar(x.c.id, x.hSol, [arquivo()])).json()[0]
      expect((await app.inject({ method: 'DELETE', url: `/api/v1/anexos/${a.id}`, headers: x.hOp })).statusCode).toBe(
        403,
      )
      expect((await app.inject({ method: 'DELETE', url: `/api/v1/anexos/${a.id}`, headers: x.hSol })).statusCode).toBe(
        403,
      )
      expect(await gravados()).toBe(1)

      const res = await app.inject({ method: 'DELETE', url: `/api/v1/anexos/${a.id}`, headers: x.hAdmin })
      expect(res.statusCode).toBe(204)
      expect(await gravados()).toBe(0)
      expect(await prisma.anexo.count()).toBe(0)
      expect(await prisma.auditoria.count({ where: { acao: 'anexo.excluido', entidadeId: a.id } })).toBe(1)
      expect(await prisma.chamadoEvento.count({ where: { chamadoId: x.c.id, tipo: 'ANEXO_REMOVIDO' } })).toBe(1)
      expect(
        (await app.inject({ method: 'DELETE', url: `/api/v1/anexos/${a.id}`, headers: x.hAdmin })).statusCode,
      ).toBe(404)
    })
  })
})
