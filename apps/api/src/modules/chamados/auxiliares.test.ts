import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { invalidarConfig } from '../../lib/config'
import { prisma } from '../../lib/prisma'
import { definirTempoReal, type PublicadorTempoReal, tempoReal } from '../../lib/tempo-real'

const espiao = () => ({
  encerrarSessao: vi.fn(),
  encerrarSessoesDoUsuario: vi.fn(),
  revalidarUsuario: vi.fn(),
  revalidarChamado: vi.fn(),
  emitirAssentamentos: vi.fn(),
  emitirChamadoAtualizado: vi.fn(),
  emitirFila: vi.fn(),
  emitirLeitura: vi.fn(),
  emitirNotificacoes: vi.fn(),
  emitirContagem: vi.fn(),
})

describe('operadores auxiliares (C08, S44, S53)', () => {
  let app: App
  let publicador: ReturnType<typeof espiao>
  const original: PublicadorTempoReal = tempoReal

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
    publicador = espiao()
    definirTempoReal(publicador)
  })
  afterEach(() => {
    definirTempoReal(original)
  })

  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const principal = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const auxiliar = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const chamado = await criarChamado({
      solicitanteId: solicitante.id,
      areaId: A.id,
      papel: 'EM_ATENDIMENTO',
      operadorId: principal.id,
    })
    return { A, B, solicitante, principal, auxiliar, chamado }
  }

  const adicionar = (id: number, headers: Record<string, string>, usuarioId: number) =>
    app.inject({ method: 'POST', url: `/api/v1/chamados/${id}/auxiliares`, headers, payload: { usuarioId } })
  const remover = (id: number, headers: Record<string, string>, usuarioId: number) =>
    app.inject({ method: 'DELETE', url: `/api/v1/chamados/${id}/auxiliares/${usuarioId}`, headers })
  const detalhe = (id: number, headers: Record<string, string>) =>
    app.inject({ method: 'GET', url: `/api/v1/chamados/${id}`, headers })

  it('401 sem sessão e 403 para USUARIO', async () => {
    const x = await cenario()
    const sem = await app.inject({
      method: 'POST',
      url: `/api/v1/chamados/${x.chamado.id}/auxiliares`,
      headers: { origin: ORIGEM },
      payload: { usuarioId: x.auxiliar.id },
    })
    expect(sem.statusCode).toBe(401)
    const r = await adicionar(x.chamado.id, await headersDe(x.solicitante.id), x.auxiliar.id)
    expect(r.statusCode).toBe(403)
  })

  it('400 com corpo inválido', async () => {
    const x = await cenario()
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/chamados/${x.chamado.id}/auxiliares`,
      headers: await headersDe(x.principal.id),
      payload: { usuarioId: 'a', extra: 1 },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().erro.detalhes.length).toBeGreaterThan(0)
  })

  it('auxiliar de outra área passa a ver o chamado, vira seguidor, é notificado e perde o acesso ao ser removido', async () => {
    const x = await cenario()
    const hPrincipal = await headersDe(x.principal.id)
    const hAux = await headersDe(x.auxiliar.id)
    expect((await detalhe(x.chamado.id, hAux)).statusCode).toBe(404)

    const r = await adicionar(x.chamado.id, hPrincipal, x.auxiliar.id)
    expect(r.statusCode).toBe(200)
    expect(publicador.revalidarChamado).toHaveBeenCalledWith(x.chamado.id)
    expect((await detalhe(x.chamado.id, hAux)).statusCode).toBe(200)
    const seguidor = await prisma.chamadoSeguidor.findUnique({
      where: { chamadoId_usuarioId: { chamadoId: x.chamado.id, usuarioId: x.auxiliar.id } },
      select: { motivo: true },
    })
    expect(seguidor?.motivo).toBe('ATRIBUIDO')
    const notificacao = await prisma.notificacao.findFirst({
      where: { usuarioId: x.auxiliar.id, chamadoId: x.chamado.id },
      select: { tipo: true },
    })
    expect(notificacao?.tipo).toBe('ATRIBUIDO')
    expect(await prisma.chamadoEvento.count({ where: { chamadoId: x.chamado.id, tipo: 'AUXILIAR_ADICIONADO' } })).toBe(
      1,
    )

    // aparece na lista dele
    const lista = await app.inject({ method: 'GET', url: '/api/v1/chamados', headers: hAux })
    expect(lista.json().itens.map((i: { id: number }) => i.id)).toContain(x.chamado.id)

    publicador.revalidarChamado.mockClear()
    const rem = await remover(x.chamado.id, hPrincipal, x.auxiliar.id)
    expect(rem.statusCode).toBe(200)
    expect(publicador.revalidarChamado).toHaveBeenCalledExactlyOnceWith(x.chamado.id)
    expect((await detalhe(x.chamado.id, hAux)).statusCode).toBe(404)
    expect(
      await prisma.notificacao.count({ where: { usuarioId: x.auxiliar.id, chamadoId: x.chamado.id, lidaEm: null } }),
    ).toBe(0)
    expect(await prisma.chamadoEvento.count({ where: { chamadoId: x.chamado.id, tipo: 'AUXILIAR_REMOVIDO' } })).toBe(1)
  })

  it('o auxiliar comenta como equipe (interno), mas não conclui nem adiciona outros auxiliares', async () => {
    const x = await cenario()
    await adicionar(x.chamado.id, await headersDe(x.principal.id), x.auxiliar.id)
    const hAux = await headersDe(x.auxiliar.id)
    const d = (await detalhe(x.chamado.id, hAux)).json()
    expect(d.acoes).toMatchObject({
      concluir: false,
      assumir: false,
      encaminhar: false,
      comentar: true,
      comentarInterno: true,
    })
    const concluir = await app.inject({
      method: 'POST',
      url: `/api/v1/chamados/${x.chamado.id}/concluir`,
      headers: hAux,
      payload: { versao: d.versao, solucao: 'Problema resolvido com sucesso.' },
    })
    expect(concluir.statusCode).toBe(403)
    const outro = await criarUsuario({ perfil: 'OPERADOR', areaId: x.A.id })
    expect((await adicionar(x.chamado.id, hAux, outro.id)).statusCode).toBe(403)
    expect((await remover(x.chamado.id, hAux, x.auxiliar.id)).statusCode).toBe(403)
  })

  it('regras do alvo: podeReceber, responsável, duplicado, inativo e perfil USUARIO', async () => {
    const x = await cenario()
    const h = await headersDe(x.principal.id)
    await prisma.usuario.update({ where: { id: x.auxiliar.id }, data: { podeReceber: false } })
    expect((await adicionar(x.chamado.id, h, x.auxiliar.id)).statusCode).toBe(422)
    await prisma.usuario.update({ where: { id: x.auxiliar.id }, data: { podeReceber: true } })
    expect((await adicionar(x.chamado.id, h, x.principal.id)).statusCode).toBe(422)
    expect((await adicionar(x.chamado.id, h, x.solicitante.id)).statusCode).toBe(422)
    expect((await adicionar(x.chamado.id, h, x.auxiliar.id)).statusCode).toBe(200)
    expect((await adicionar(x.chamado.id, h, x.auxiliar.id)).statusCode).toBe(409)
    expect((await remover(x.chamado.id, h, x.principal.id)).statusCode).toBe(404)
    // chamado inexistente ou fora do escopo
    expect((await adicionar(999_999, h, x.auxiliar.id)).statusCode).toBe(404)
    const fora = await criarUsuario({ perfil: 'OPERADOR', areaId: x.B.id })
    expect((await adicionar(x.chamado.id, await headersDe(fora.id), x.principal.id)).statusCode).toBe(404)
  })

  it('encaminhar para operador exige podeEncaminhar do autor e podeReceber do destino', async () => {
    const x = await cenario()
    const h = await headersDe(x.principal.id)
    const corpo = (versao: number) => ({ versao, areaId: x.B.id, operadorId: x.auxiliar.id })
    const versao = (await prisma.chamado.findUniqueOrThrow({ where: { id: x.chamado.id }, select: { versao: true } }))
      .versao
    const enc = (b: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `/api/v1/chamados/${x.chamado.id}/encaminhar`, headers: h, payload: b })

    await prisma.usuario.update({ where: { id: x.principal.id }, data: { podeEncaminhar: false } })
    expect((await enc(corpo(versao))).statusCode).toBe(403)
    // sem operador de destino, o encaminhamento por área continua permitido
    await prisma.usuario.update({ where: { id: x.principal.id }, data: { podeEncaminhar: true } })
    await prisma.usuario.update({ where: { id: x.auxiliar.id }, data: { podeReceber: false } })
    expect((await enc(corpo(versao))).statusCode).toBe(422)
    await prisma.usuario.update({ where: { id: x.auxiliar.id }, data: { podeReceber: true } })
    expect((await enc(corpo(versao))).statusCode).toBe(200)
  })

  it('o auxiliar continua vendo o chamado depois de encaminhado a outra área', async () => {
    const x = await cenario()
    const C = await criarArea()
    const h = await headersDe(x.principal.id)
    await adicionar(x.chamado.id, h, x.auxiliar.id)
    const versao = (await prisma.chamado.findUniqueOrThrow({ where: { id: x.chamado.id }, select: { versao: true } }))
      .versao
    const enc = await app.inject({
      method: 'POST',
      url: `/api/v1/chamados/${x.chamado.id}/encaminhar`,
      headers: h,
      payload: { versao, areaId: C.id },
    })
    expect(enc.statusCode).toBe(200)
    expect((await detalhe(x.chamado.id, await headersDe(x.auxiliar.id))).statusCode).toBe(200)
  })
})
