import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { invalidarConfig } from '../../lib/config'
import { prisma } from '../../lib/prisma'

const JSON_HDR = { 'content-type': 'application/json', origin: ORIGEM }
const NOVA = 'Pitanga-Lanterna-Rio-2027'
const MENSAGEM = 'Se os dados forem aceitos, enviaremos um e-mail para confirmar o cadastro'
const sha256 = (t: string) => createHash('sha256').update(t).digest('hex')
const HORA = 3_600_000

describe('auto-cadastro com aprovação (A14)', () => {
  let app: App
  let ip = 0
  beforeEach(async () => {
    await limparBanco()
    ip = 0
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const definir = async (chave: string, valor: unknown) => {
    await prisma.config.upsert({
      where: { chave },
      create: { chave, valor: valor as never },
      update: { valor: valor as never },
    })
    invalidarConfig()
  }
  const abrir = async (dominios: string[] = ['empresa.com']) => {
    await definir('cadastro.habilitado', true)
    await definir('cadastro.dominiosPermitidos', dominios)
    await definir('email.habilitado', true)
  }
  /** Cada chamada usa um IP diferente: o limite de 3/h por IP não atrapalha os demais testes. */
  const pedir = (payload: Record<string, unknown>, remoteAddress?: string) => {
    ip += 1
    return app.inject({
      method: 'POST',
      url: '/api/v1/publico/cadastro',
      headers: JSON_HDR,
      payload,
      remoteAddress: remoteAddress ?? `10.1.0.${ip}`,
    })
  }
  const confirmar = (token: string, remoteAddress?: string) => {
    ip += 1
    return app.inject({
      method: 'POST',
      url: '/api/v1/publico/cadastro/confirmar',
      headers: JSON_HDR,
      payload: { token },
      remoteAddress: remoteAddress ?? `10.2.0.${ip}`,
    })
  }
  /** O hash da senha não sai nas consultas do Prisma (omit global): lê direto. */
  const senhaHashDe = async (id: number) => {
    const [linha] = await prisma.$queryRaw<
      { senha_hash: string | null }[]
    >`SELECT senha_hash FROM usuarios WHERE id = ${id}`
    return linha?.senha_hash ?? null
  }
  const dados = (n = 1) => ({ login: `novo.${n}`, nome: `Pessoa ${n}`, email: `novo${n}@empresa.com` })
  const tokenDoEmail = async (): Promise<string> => {
    const email = await prisma.emailSaida.findFirstOrThrow({ orderBy: { id: 'desc' }, select: { texto: true } })
    const m = /cadastro\/confirmar\?token=([\w-]+)/.exec(email.texto)
    if (!m?.[1]) throw new Error('link ausente no e-mail')
    return m[1]
  }
  const pendenteConfirmado = async (n = 1) => {
    await abrir()
    expect((await pedir(dados(n))).statusCode).toBe(202)
    expect((await confirmar(await tokenDoEmail())).statusCode).toBe(200)
    return prisma.cadastroPendente.findFirstOrThrow({ where: { login: dados(n).login }, select: { id: true } })
  }

  describe('POST /publico/cadastro', () => {
    it('aceito: grava só o hash do token e enfileira o e-mail de confirmação', async () => {
      await abrir()
      const r = await pedir(dados())
      expect(r.statusCode).toBe(202)
      expect(r.json()).toEqual({ mensagem: MENSAGEM })

      const p = await prisma.cadastroPendente.findFirstOrThrow()
      expect(p).toMatchObject({ login: 'novo.1', email: 'novo1@empresa.com', confirmadoEm: null })
      const token = await tokenDoEmail()
      expect(token).toHaveLength(43) // 32 bytes em base64url
      expect(p.tokenHash).toBe(sha256(token))
      expect(JSON.stringify(p)).not.toContain(token)
      const email = await prisma.emailSaida.findFirstOrThrow()
      expect(email).toMatchObject({ para: 'novo1@empresa.com', evento: 'CADASTRO_CONFIRMAR' })
    })

    it('aceito sem email.habilitado: grava o pedido e não enfileira e-mail', async () => {
      await abrir()
      await definir('email.habilitado', false)
      expect((await pedir(dados())).statusCode).toBe(202)
      expect(await prisma.cadastroPendente.count()).toBe(1)
      expect(await prisma.emailSaida.count()).toBe(0)
    })

    it('normaliza login e e-mail e aceita o domínio em qualquer caixa', async () => {
      await abrir()
      const r = await pedir({ login: ' Novo.Um ', nome: 'Pessoa', email: 'Novo1@EMPRESA.com' })
      expect(r.statusCode).toBe(202)
      expect(await prisma.cadastroPendente.findFirstOrThrow()).toMatchObject({
        login: 'novo.um',
        email: 'novo1@empresa.com',
      })
    })

    it('é ignorado em silêncio, com a mesma resposta e nada gravado: domínio fora, desabilitado, lista vazia', async () => {
      await abrir()
      const aceito = await pedir(dados(1))
      await prisma.cadastroPendente.deleteMany()
      await prisma.emailSaida.deleteMany()

      const fora = await pedir({ ...dados(2), email: 'novo2@outra.com' })
      await definir('cadastro.dominiosPermitidos', [])
      const vazia = await pedir(dados(3))
      await definir('cadastro.dominiosPermitidos', ['empresa.com'])
      await definir('cadastro.habilitado', false)
      const desligado = await pedir(dados(4))

      for (const r of [fora, vazia, desligado]) {
        expect(r.statusCode).toBe(aceito.statusCode)
        expect(r.json()).toEqual(aceito.json())
      }
      expect(await prisma.cadastroPendente.count()).toBe(0)
      expect(await prisma.emailSaida.count()).toBe(0)
    })

    it('login ou e-mail já existentes (usuário ou pedido) recebem resposta indistinguível e nada é gravado', async () => {
      await abrir()
      const u = await criarUsuario({ perfil: 'USUARIO' })
      const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { email: true } })
      const aceito = await pedir(dados(1))
      const emailsAntes = await prisma.emailSaida.count()

      const respostas = [
        await pedir({ ...dados(2), login: u.login }),
        await pedir({ ...dados(3), email: usuario.email }),
        await pedir({ ...dados(1), login: 'outro.login' }), // e-mail de um pedido pendente
        await pedir({ ...dados(1), email: 'outro@empresa.com' }), // login de um pedido pendente
        await pedir({ ...dados(5), departamentoId: 999_999 }),
      ]
      for (const r of respostas) {
        expect(r.statusCode).toBe(aceito.statusCode)
        expect(r.json()).toEqual(aceito.json())
      }
      expect(await prisma.cadastroPendente.count()).toBe(1)
      expect(await prisma.emailSaida.count()).toBe(emailsAntes)
    })

    it('aceito e ignorado levam tempo aproximado (piso de duração)', async () => {
      await abrir()
      const t0 = Date.now()
      await pedir({ ...dados(1), email: 'x@outra.com' })
      expect(Date.now() - t0).toBeGreaterThanOrEqual(280)
      const t1 = Date.now()
      await pedir(dados(2))
      expect(Date.now() - t1).toBeGreaterThanOrEqual(280)
    })

    it('pedido vencido e não confirmado não bloqueia um novo pedido', async () => {
      await abrir()
      await pedir(dados())
      await prisma.cadastroPendente.updateMany({ data: { criadoEm: new Date(Date.now() - 49 * HORA) } })
      expect((await pedir(dados())).statusCode).toBe(202)
      expect(await prisma.cadastroPendente.count()).toBe(1)
      expect((await prisma.cadastroPendente.findFirstOrThrow()).criadoEm.getTime()).toBeGreaterThan(Date.now() - HORA)
    })

    it('400 com detalhes: campo extra, e-mail inválido e login inválido', async () => {
      const extra = await pedir({ ...dados(), perfil: 'ADMIN' })
      expect(extra.statusCode).toBe(400)
      const ruim = await pedir({ login: 'a', nome: 'P', email: 'não-é-email' })
      expect(ruim.statusCode).toBe(400)
      expect(
        ruim
          .json()
          .erro.detalhes.map((d: { campo: string }) => d.campo)
          .sort(),
      ).toEqual(['email', 'login', 'nome'])
    })

    it('limita a 3 por hora por IP (429)', async () => {
      await abrir()
      const ipFixo = '10.9.9.9'
      for (let n = 1; n <= 3; n++) expect((await pedir(dados(n), ipFixo)).statusCode).toBe(202)
      const quarta = await pedir(dados(4), ipFixo)
      expect(quarta.statusCode).toBe(429)
      expect((await pedir(dados(5), '10.9.9.10')).statusCode).toBe(202)
    })
  })

  describe('POST /publico/cadastro/confirmar', () => {
    it('token válido marca confirmadoEm e audita; reutilizar dá 400 genérico', async () => {
      await abrir()
      await pedir(dados())
      const token = await tokenDoEmail()
      const ok = await confirmar(token)
      expect(ok.statusCode).toBe(200)
      expect((await prisma.cadastroPendente.findFirstOrThrow()).confirmadoEm).not.toBeNull()
      expect(await prisma.auditoria.count({ where: { acao: 'cadastro.confirmado' } })).toBe(1)

      const de_novo = await confirmar(token)
      expect(de_novo.statusCode).toBe(400)
      expect(de_novo.json().erro.mensagem).toBe('Link inválido ou expirado')
    })

    it('token inexistente ou expirado (48 h) dá o mesmo 400', async () => {
      await abrir()
      await pedir(dados())
      const token = await tokenDoEmail()
      const inexistente = await confirmar('x'.repeat(43))
      await prisma.cadastroPendente.updateMany({ data: { criadoEm: new Date(Date.now() - 49 * HORA) } })
      const expirado = await confirmar(token)
      for (const r of [inexistente, expirado]) {
        expect(r.statusCode).toBe(400)
        expect(r.json().erro.mensagem).toBe('Link inválido ou expirado')
      }
      expect((await prisma.cadastroPendente.findFirstOrThrow()).confirmadoEm).toBeNull()
    })

    it('400 com corpo inválido e limite por IP (429)', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/publico/cadastro/confirmar',
        headers: JSON_HDR,
        payload: { token: '' },
      })
      expect(r.statusCode).toBe(400)
      expect(r.json().erro.detalhes).toBeDefined()
      for (let n = 0; n < 10; n++) expect((await confirmar('y'.repeat(43), '10.8.8.8')).statusCode).toBe(400)
      expect((await confirmar('y'.repeat(43), '10.8.8.8')).statusCode).toBe(429)
    })
  })

  describe('administração', () => {
    const listar = (headers?: Record<string, string>) =>
      app.inject({ method: 'GET', url: '/api/v1/cadastro-pendentes', ...(headers ? { headers } : {}) })

    it('401 sem sessão e 403 para USUARIO e OPERADOR', async () => {
      expect((await listar()).statusCode).toBe(401)
      for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
        const u = await criarUsuario({ perfil })
        const h = await headersDe(u.id)
        expect((await listar(h)).statusCode).toBe(403)
        expect(
          (await app.inject({ method: 'POST', url: '/api/v1/cadastro-pendentes/1/aprovar', headers: h })).statusCode,
        ).toBe(403)
        expect(
          (await app.inject({ method: 'DELETE', url: '/api/v1/cadastro-pendentes/1', headers: h })).statusCode,
        ).toBe(403)
      }
    })

    it('lista só os confirmados, sem o hash do token', async () => {
      const confirmado = await pendenteConfirmado(1)
      await pedir(dados(2)) // não confirmado
      const admin = await criarUsuario({ perfil: 'ADMIN' })
      const r = await listar(await headersDe(admin.id))
      expect(r.statusCode).toBe(200)
      const corpo = r.json()
      expect(corpo.total).toBe(1)
      expect(corpo.itens).toHaveLength(1)
      expect(corpo.itens[0]).toMatchObject({ id: confirmado.id, login: 'novo.1', email: 'novo1@empresa.com' })
      expect(JSON.stringify(corpo)).not.toContain('tokenHash')
      expect(corpo).toMatchObject({ pagina: 1, porPagina: 25 })
    })

    it('400 com detalhes na paginação inválida', async () => {
      const admin = await criarUsuario({ perfil: 'ADMIN' })
      const r = await app.inject({
        method: 'GET',
        url: '/api/v1/cadastro-pendentes?pagina=0',
        headers: await headersDe(admin.id),
      })
      expect(r.statusCode).toBe(400)
      expect(r.json().erro.detalhes).toBeDefined()
    })

    it('aprovar cria o usuário, emite o link de senha (TokenSenha), apaga o pedido e audita', async () => {
      const p = await pendenteConfirmado(1)
      const admin = await criarUsuario({ perfil: 'ADMIN' })
      const r = await app.inject({
        method: 'POST',
        url: `/api/v1/cadastro-pendentes/${p.id}/aprovar`,
        headers: await headersDe(admin.id),
      })
      expect(r.statusCode).toBe(201)
      const u = await prisma.usuario.findUniqueOrThrow({ where: { login: 'novo.1' } })
      expect(r.json()).toEqual({ usuarioId: u.id, login: 'novo.1' })
      expect(u).toMatchObject({ perfil: 'USUARIO', ativo: true, email: 'novo1@empresa.com' })
      expect(await senhaHashDe(u.id)).toBeNull()
      expect(await prisma.cadastroPendente.count()).toBe(0)

      const email = await prisma.emailSaida.findFirstOrThrow({ orderBy: { id: 'desc' } })
      expect(email).toMatchObject({ evento: 'CADASTRO_APROVADO', para: 'novo1@empresa.com', usuarioId: u.id })
      const token = /redefinir-senha\?token=([\w-]+)/.exec(email.texto)?.[1] ?? ''
      const t = await prisma.tokenSenha.findFirstOrThrow({ where: { usuarioId: u.id } })
      expect(t.tokenHash).toBe(sha256(token))
      expect(t.usadoEm).toBeNull()

      const criado = await prisma.auditoria.findFirstOrThrow({ where: { acao: 'usuario.criado' } })
      expect(criado.atorId).toBe(admin.id)
      expect(JSON.stringify(criado.dados)).not.toContain(token)
      expect(JSON.stringify(criado.dados)).not.toContain('empresa.com')
      expect(await prisma.auditoria.count({ where: { acao: 'cadastro.aprovado' } })).toBe(1)

      // o mesmo mecanismo da recuperação: o link define a senha
      const def = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/redefinir-senha',
        headers: JSON_HDR,
        payload: { token, novaSenha: NOVA },
      })
      expect(def.statusCode).toBe(204)
      expect(await senhaHashDe(u.id)).not.toBeNull()
    })

    it('aprovar: 404 para inexistente e não confirmado, 400 para id inválido, 409 se já existe usuário', async () => {
      await abrir()
      await pedir(dados(1)) // não confirmado
      const naoConfirmado = await prisma.cadastroPendente.findFirstOrThrow({ select: { id: true } })
      const admin = await criarUsuario({ perfil: 'ADMIN' })
      const h = await headersDe(admin.id)
      const aprovar = (id: string | number) =>
        app.inject({ method: 'POST', url: `/api/v1/cadastro-pendentes/${id}/aprovar`, headers: h })
      expect((await aprovar(999_999)).statusCode).toBe(404)
      expect((await aprovar(naoConfirmado.id)).statusCode).toBe(404)
      const ruim = await aprovar('abc')
      expect(ruim.statusCode).toBe(400)
      expect(ruim.json().erro.detalhes).toBeDefined()

      const p = await pendenteConfirmado(2)
      await prisma.usuario.create({ data: { login: 'novo.2', nome: 'Já existe', perfil: 'USUARIO' } })
      expect((await aprovar(p.id)).statusCode).toBe(409)
      expect(await prisma.cadastroPendente.count({ where: { id: p.id } })).toBe(1)
    })

    it('rejeitar apaga o pedido e audita; 404 na repetição', async () => {
      const p = await pendenteConfirmado(1)
      const admin = await criarUsuario({ perfil: 'ADMIN' })
      const h = await headersDe(admin.id)
      const apagar = () => app.inject({ method: 'DELETE', url: `/api/v1/cadastro-pendentes/${p.id}`, headers: h })
      expect((await apagar()).statusCode).toBe(204)
      expect(await prisma.cadastroPendente.count()).toBe(0)
      expect(await prisma.auditoria.count({ where: { acao: 'cadastro.rejeitado' } })).toBe(1)
      expect((await apagar()).statusCode).toBe(404)
      expect(await prisma.usuario.count({ where: { login: 'novo.1' } })).toBe(0)
    })
  })
})
