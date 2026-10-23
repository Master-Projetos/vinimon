import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  ativarMfa,
  criarArea,
  criarUsuario,
  headersDe,
  limparBanco,
  ORIGEM,
  SENHA_TESTE,
  tokenDoCookie,
} from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'
import { hashSenha } from '../../lib/senha'
import { NOME_COOKIE } from '../../lib/sessao'

describe('usuarios: ações administrativas', () => {
  let app: App

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
  })

  const post = (headers: Record<string, string>, id: number | string, acao: string, payload: object = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/usuarios/${id}/${acao}`, headers, payload })

  async function loginReal(login: string, senha: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGEM },
      payload: { login, senha },
    })
    return { res, cookie: `${NOME_COOKIE}=${tokenDoCookie(res)}` }
  }
  const sessaoStatus = async (cookie: string) =>
    (await app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers: { cookie } })).statusCode

  const ACOES = ['redefinir-senha', 'resetar-2fa', 'encerrar-sessoes', 'desbloquear-login', 'anonimizar'] as const

  it('401 sem sessão', async () => {
    for (const acao of ACOES) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/usuarios/1/${acao}`,
        headers: { origin: ORIGEM },
        payload: {},
      })
      expect(res.statusCode).toBe(401)
    }
  })

  it('403 para USUARIO e OPERADOR', async () => {
    const alvo = await criarUsuario({ perfil: 'USUARIO' })
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const headers = await headersDe(u.id)
      for (const acao of ACOES) {
        const res = await post(headers, alvo.id, acao, acao === 'resetar-2fa' ? { senhaAdmin: SENHA_TESTE } : {})
        expect(res.statusCode).toBe(403)
        expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
      }
    }
  })

  it('400 com detalhes: id inválido, corpo inválido e senha do admin errada', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const alvo = await criarUsuario({ perfil: 'USUARIO' })
    const headers = await headersDe(admin.id)
    const idRuim = await post(headers, 'abc', 'encerrar-sessoes')
    expect(idRuim.statusCode).toBe(400)
    expect(idRuim.json().erro.detalhes.length).toBeGreaterThan(0)
    const semSenha = await post(headers, alvo.id, 'resetar-2fa', { extra: 1 })
    expect(semSenha.statusCode).toBe(400)
    expect(semSenha.json().erro.detalhes.length).toBeGreaterThan(0)
    await ativarMfa(alvo.id)
    const errada = await post(headers, alvo.id, 'resetar-2fa', { senhaAdmin: 'senha-errada-123' })
    expect(errada.statusCode).toBe(400)
    expect(errada.json().erro.detalhes[0].campo).toBe('senhaAdmin')
    const intacto = await prisma.usuario.findUnique({ where: { id: alvo.id }, select: { mfaAtivadoEm: true } })
    expect(intacto?.mfaAtivadoEm).not.toBeNull()
  })

  it('404 para alvo inexistente em todas as ações', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    for (const acao of ACOES) {
      const res = await post(headers, 999999, acao, acao === 'resetar-2fa' ? { senhaAdmin: SENHA_TESTE } : {})
      expect(res.statusCode).toBe(404)
    }
  })

  it('T21: redefinir senha devolve senha de 16 caracteres, derruba sessões e audita sem segredo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const alvo = await criarUsuario({ perfil: 'USUARIO' })
    const { cookie } = await loginReal(alvo.login, SENHA_TESTE)
    expect(await sessaoStatus(cookie)).toBe(200)

    const res = await post(await headersDe(admin.id), alvo.id, 'redefinir-senha')
    expect(res.statusCode).toBe(200)
    const { senhaTemporaria } = res.json()
    expect(senhaTemporaria).toHaveLength(16)
    expect(await sessaoStatus(cookie)).toBe(401)
    const sessao = await prisma.sessao.findFirst({ where: { usuarioId: alvo.id } })
    expect(sessao?.motivoRevogacao).toBe('senha_redefinida')
    const u = await prisma.usuario.findUnique({ where: { id: alvo.id } })
    expect(u?.deveTrocarSenha).toBe(true)

    const antiga = await loginReal(alvo.login, SENHA_TESTE)
    expect(antiga.res.statusCode).toBe(401)
    const nova = await loginReal(alvo.login, senhaTemporaria)
    expect(nova.res.statusCode).toBe(200)
    expect(nova.res.json().estado).toBe('TROCA_SENHA')

    const auditoria = await prisma.auditoria.findMany({ where: { acao: 'senha.redefinida' } })
    expect(auditoria).toHaveLength(1)
    expect(JSON.stringify(auditoria)).not.toContain(senhaTemporaria)
    expect(JSON.stringify(auditoria)).not.toMatch(/argon2|senhaHash/i)
  })

  it('T21: desativar derruba e reativar não revive a sessão revogada', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const alvo = await criarUsuario({ perfil: 'USUARIO' })
    const { cookie } = await loginReal(alvo.login, SENHA_TESTE)
    const headers = await headersDe(admin.id)
    const desativar = await app.inject({
      method: 'PATCH',
      url: `/api/v1/usuarios/${alvo.id}`,
      headers,
      payload: { ativo: false },
    })
    expect(desativar.statusCode).toBe(200)
    expect(await sessaoStatus(cookie)).toBe(401)
    const reativar = await app.inject({
      method: 'PATCH',
      url: `/api/v1/usuarios/${alvo.id}`,
      headers,
      payload: { ativo: true },
    })
    expect(reativar.statusCode).toBe(200)
    expect(await sessaoStatus(cookie)).toBe(401)
  })

  it('resetar 2FA: limpa totp, mfa e códigos, revoga sessões e audita mfa.removido', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const alvo = await criarUsuario({ perfil: 'USUARIO' })
    await ativarMfa(alvo.id)
    const sessao = await headersDe(alvo.id)
    const res = await post(await headersDe(admin.id), alvo.id, 'resetar-2fa', { senhaAdmin: SENHA_TESTE })
    expect(res.statusCode).toBe(200)
    expect(JSON.stringify(res.json())).not.toMatch(/totp|argon2|senha_hash/i)
    const u = await prisma.usuario.findUnique({
      where: { id: alvo.id },
      select: { totpSecretEnc: true, totpSecretPendenteEnc: true, totpUltimoPasso: true, mfaAtivadoEm: true },
    })
    expect(u).toStrictEqual({
      totpSecretEnc: null,
      totpSecretPendenteEnc: null,
      totpUltimoPasso: null,
      mfaAtivadoEm: null,
    })
    expect(await prisma.codigoRecuperacao.count({ where: { usuarioId: alvo.id } })).toBe(0)
    expect(await prisma.sessao.count({ where: { usuarioId: alvo.id, revogadaEm: null } })).toBe(0)
    expect(sessao.cookie).toBeTruthy()
    expect(await prisma.auditoria.count({ where: { acao: 'mfa.removido', entidadeId: String(alvo.id) } })).toBe(1)
    const proprio = await post(await headersDe(admin.id), admin.id, 'resetar-2fa', { senhaAdmin: SENHA_TESTE })
    expect(proprio.statusCode).toBe(409)
  })

  it('encerrar sessões revoga todas as do alvo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const alvo = await criarUsuario({ perfil: 'USUARIO' })
    const { cookie } = await loginReal(alvo.login, SENHA_TESTE)
    await headersDe(alvo.id)
    const res = await post(await headersDe(admin.id), alvo.id, 'encerrar-sessoes')
    expect(res.statusCode).toBe(200)
    expect(await sessaoStatus(cookie)).toBe(401)
    expect(await prisma.sessao.count({ where: { usuarioId: alvo.id, revogadaEm: null } })).toBe(0)
  })

  it('desbloquear login apaga as falhas só do login do alvo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const alvo = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.falhaLogin.createMany({
      data: [
        { loginNormalizado: alvo.login, ip: '10.0.0.1' },
        { loginNormalizado: alvo.login, ip: '10.0.0.2' },
        { loginNormalizado: 'outro.login', ip: '10.0.0.1' },
      ],
    })
    const res = await post(await headersDe(admin.id), alvo.id, 'desbloquear-login')
    expect(res.statusCode).toBe(200)
    expect(await prisma.falhaLogin.count({ where: { loginNormalizado: alvo.login } })).toBe(0)
    expect(await prisma.falhaLogin.count({ where: { loginNormalizado: 'outro.login' } })).toBe(1)
  })

  async function chamadoMinimo(solicitanteId: number, abertoPorId: number, extra: { contato: string; email: string }) {
    const area = await criarArea()
    const prioridade = await prisma.prioridade.upsert({
      where: { nome: 'P-anon' },
      update: {},
      create: { nome: 'P-anon' },
      select: { id: true },
    })
    const canal = await prisma.canal.upsert({
      where: { nome: 'C-anon' },
      update: {},
      create: { nome: 'C-anon' },
      select: { id: true },
    })
    const status = await prisma.status.upsert({
      where: { nome: 'S-anon' },
      update: {},
      create: { nome: 'S-anon', tipo: 'ABERTO' },
      select: { id: true },
    })
    const jornada = await prisma.jornada.upsert({
      where: { nome: 'J-anon' },
      update: {},
      create: { nome: 'J-anon' },
      select: { id: true },
    })
    return prisma.chamado.create({
      data: {
        assunto: 'Impressora parada',
        descricao: 'Não imprime',
        contato: extra.contato,
        contatoEmail: extra.email,
        telefone: '(11) 98888-7777',
        solicitanteId,
        abertoPorId,
        areaId: area.id,
        prioridadeId: prioridade.id,
        canalId: canal.id,
        statusId: status.id,
        statusTipo: 'ABERTO',
        jornadaId: jornada.id,
      },
      select: { id: true },
    })
  }

  it('anonimizar (S122): marcadores, sem busca, chamados preservados e sem dado antigo nas colunas', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const alvo = await prisma.usuario.create({
      data: {
        login: 'joana.prado',
        nome: 'Joana Prado',
        email: 'joana.prado@teste.local',
        telefone: '(11) 97777-6666',
        senhaHash: await hashSenha(SENHA_TESTE),
        perfil: 'USUARIO',
      },
    })
    const outro = await criarUsuario({ perfil: 'USUARIO' })
    const { cookie } = await loginReal('joana.prado', SENHA_TESTE)
    expect(await sessaoStatus(cookie)).toBe(200)

    const chamado = await chamadoMinimo(alvo.id, admin.id, { contato: 'Joana Prado', email: 'joana.prado@teste.local' })
    const outroChamado = await chamadoMinimo(outro.id, admin.id, { contato: 'Fulano', email: 'fulano@teste.local' })
    const a1 = await prisma.assentamento.create({
      data: {
        chamadoId: chamado.id,
        autorId: admin.id,
        texto: `Olá @[Joana Prado](usuario:${alvo.id}), veja com @[Fulano](usuario:${outro.id}) e @[Joana Prado](usuario:${alvo.id}).`,
      },
    })
    const a2 = await prisma.assentamento.create({
      data: { chamadoId: chamado.id, autorId: admin.id, texto: `Cc @[Fulano](usuario:${outro.id}) apenas.` },
    })
    const marcador = `Usuário anonimizado #${alvo.id}`

    const headers = await headersDe(admin.id)
    const antesBusca = await app.inject({ method: 'GET', url: '/api/v1/usuarios/busca?q=joana', headers })
    expect(antesBusca.json()).toHaveLength(1)

    const res = await post(headers, alvo.id, 'anonimizar')
    expect(res.statusCode).toBe(200)

    const u = await prisma.usuario.findUniqueOrThrow({
      where: { id: alvo.id },
      select: {
        nome: true,
        email: true,
        telefone: true,
        login: true,
        senhaHash: true,
        ativo: true,
        anonimizadoEm: true,
      },
    })
    expect(u).toMatchObject({
      nome: marcador,
      email: null,
      telefone: null,
      login: `anon${alvo.id}`,
      senhaHash: null,
      ativo: false,
    })
    expect(u.anonimizadoEm).not.toBeNull()
    expect(await sessaoStatus(cookie)).toBe(401)

    const busca = await app.inject({ method: 'GET', url: '/api/v1/usuarios/busca?q=joana', headers })
    expect(busca.json()).toHaveLength(0)
    const buscaMarcador = await app.inject({ method: 'GET', url: '/api/v1/usuarios/busca?q=anonimizado', headers })
    expect(buscaMarcador.json()).toHaveLength(0)

    const c = await prisma.chamado.findUniqueOrThrow({ where: { id: chamado.id } })
    expect(c).toMatchObject({ contato: marcador, contatoEmail: null, telefone: null, solicitanteId: alvo.id })
    const intacto = await prisma.chamado.findUniqueOrThrow({ where: { id: outroChamado.id } })
    expect(intacto).toMatchObject({ contato: 'Fulano', contatoEmail: 'fulano@teste.local' })

    const t1 = await prisma.assentamento.findUniqueOrThrow({ where: { id: a1.id } })
    expect(t1.texto).toBe(
      `Olá @[${marcador}](usuario:${alvo.id}), veja com @[Fulano](usuario:${outro.id}) e @[${marcador}](usuario:${alvo.id}).`,
    )
    const t2 = await prisma.assentamento.findUniqueOrThrow({ where: { id: a2.id } })
    expect(t2.texto).toBe(`Cc @[Fulano](usuario:${outro.id}) apenas.`)

    // varredura direta: nenhuma coluna de chamados nem assentamentos guarda o nome ou o e-mail antigos
    const chamados = await prisma.$queryRaw<{ linha: string }[]>`
      SELECT c::text AS linha FROM chamados c WHERE c.solicitante_id = ${alvo.id}`
    const assentamentos = await prisma.$queryRaw<{ linha: string }[]>`
      SELECT a::text AS linha FROM assentamentos a WHERE a.chamado_id = ${chamado.id}`
    const tudo = JSON.stringify([chamados, assentamentos]).toLowerCase()
    expect(tudo).not.toContain('joana prado')
    expect(tudo).not.toContain('joana.prado@teste.local')

    const auditoria = await prisma.auditoria.findMany({ where: { acao: 'usuario.anonimizado' } })
    expect(auditoria).toHaveLength(1)
    expect(JSON.stringify(auditoria).toLowerCase()).not.toMatch(/joana|prado/)
  })

  it('anonimizar: 409 para si mesmo e para o último ADMIN ativo; permite com outro ADMIN ativo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const proprio = await post(headers, admin.id, 'anonimizar')
    expect(proprio.statusCode).toBe(409)

    const adminInativo = await criarUsuario({ perfil: 'ADMIN', ativo: false })
    const inativo = await post(headers, adminInativo.id, 'anonimizar')
    expect(inativo.statusCode).toBe(200)

    const segundo = await criarUsuario({ perfil: 'ADMIN' })
    const headersSegundo = await headersDe(segundo.id)
    await prisma.usuario.update({ where: { id: admin.id }, data: { ativo: false } })
    const ultimo = await post(headersSegundo, segundo.id, 'anonimizar')
    expect(ultimo.statusCode).toBe(409)
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: segundo.id } })).ativo).toBe(true)
  })
})
