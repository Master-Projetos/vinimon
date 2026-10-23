import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { type BaseSemeada, criarProblema, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
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

describe('POST /chamados (abrir)', () => {
  let app: App
  let base: BaseSemeada
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
    base = await semearBase()
    publicador = espiao()
    definirTempoReal(publicador)
  })
  afterEach(() => {
    definirTempoReal(original)
  })

  const corpo = { assunto: 'Impressora parada', descricao: 'Não imprime desde ontem.' }
  const abrir = (headers: Record<string, string>, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/v1/chamados', headers, payload })

  /** Duas áreas atendem o problema; `areaPadrao` é a padrão. O OPERADOR é da área padrão. */
  async function cenario(sla: { slaSolucaoMin?: number; slaRespostaMin?: number } = {}) {
    const areaPadrao = await criarArea()
    const outraArea = await criarArea()
    const foraDoProblema = await criarArea()
    const problema = await criarProblema({
      areaIds: [areaPadrao.id, outraArea.id],
      areaPadraoId: areaPadrao.id,
      ...sla,
    })
    const usuario = await criarUsuario({ perfil: 'USUARIO' })
    const operador = await criarUsuario({ perfil: 'OPERADOR', areaId: areaPadrao.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    return {
      areaPadrao,
      outraArea,
      foraDoProblema,
      problema,
      usuario,
      operador,
      admin,
      hUsuario: await headersDe(usuario.id),
      hOperador: await headersDe(operador.id),
      hAdmin: await headersDe(admin.id),
    }
  }

  it('401 sem sessão', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chamados',
      headers: { origin: ORIGEM },
      payload: { ...corpo, problemaId: 1 },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().erro.codigo).toBe('NAO_AUTENTICADO')
  })

  it('T36: statusId, operadorId, concluidoEm e chave desconhecida dão 400; campos inválidos trazem detalhes', async () => {
    const c = await cenario()
    for (const extra of [
      { statusId: 1 },
      { operadorId: c.operador.id },
      { concluidoEm: '2026-01-01T00:00:00Z' },
      { qualquer: 1 },
    ]) {
      const res = await abrir(c.hOperador, { ...corpo, problemaId: c.problema.id, ...extra })
      expect(res.statusCode, JSON.stringify(extra)).toBe(400)
    }
    const curto = await abrir(c.hUsuario, { ...corpo, assunto: 'ab', problemaId: c.problema.id })
    expect(curto.statusCode).toBe(400)
    expect(curto.json().erro.detalhes[0]).toMatchObject({ campo: 'assunto' })
    expect((await abrir(c.hUsuario, { ...corpo })).statusCode).toBe(400) // sem problemaId
  })

  it('USUARIO abre: área do problema, canal Sistema Web, prioridade padrão, status inicial, seguidor, evento e comentário de sistema', async () => {
    const c = await cenario({ slaSolucaoMin: 120, slaRespostaMin: 30 })
    await prisma.usuario.update({
      where: { id: c.usuario.id },
      data: { email: 'ana@exemplo.com', telefone: '(11) 99999-0000' },
    })
    const res = await abrir(c.hUsuario, { ...corpo, problemaId: c.problema.id })
    expect(res.statusCode).toBe(201)
    const d = res.json()
    expect(d).toMatchObject({
      assunto: corpo.assunto,
      novo: true,
      cancelado: false,
      naoLido: false,
      qtdAnexos: 0,
      versao: 0,
      area: { id: c.areaPadrao.id },
      problema: { id: c.problema.id },
      solicitante: { id: c.usuario.id },
      abertoPor: { id: c.usuario.id },
      operador: null,
      canal: { nome: 'Sistema Web' },
      prioridade: { id: base.prioridadePadraoId },
      status: { tipo: 'ABERTO', papel: 'INICIAL' },
      contatoEmail: 'ana@exemplo.com',
      telefone: '(11) 99999-0000',
      seguindo: true,
      participantes: [{ id: c.usuario.id, papel: 'SOLICITANTE' }],
    })
    expect(d.contato).toBeTruthy()
    expect(d.acoes).toMatchObject({
      comentar: true,
      anexar: true,
      cancelar: true,
      comentarInterno: false,
      assumir: false,
    })

    const noBanco = await prisma.chamado.findUniqueOrThrow({ where: { id: d.id } })
    expect(noBanco.abertoPorId).toBe(c.usuario.id)
    // jornada 24x7: prazo = abertura + meta
    expect(noBanco.prazoSolucaoEm?.getTime()).toBe(noBanco.abertoEm.getTime() + 120 * 60_000)
    expect(noBanco.prazoRespostaEm?.getTime()).toBe(noBanco.abertoEm.getTime() + 30 * 60_000)
    expect(noBanco.statusDesde).toEqual(noBanco.abertoEm)

    expect(
      await prisma.chamadoSeguidor.findMany({ where: { chamadoId: d.id }, select: { usuarioId: true, motivo: true } }),
    ).toEqual([{ usuarioId: c.usuario.id, motivo: 'SOLICITANTE' }])
    const ev = await prisma.chamadoEvento.findMany({ where: { chamadoId: d.id } })
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({
      tipo: 'CRIADO',
      atorId: c.usuario.id,
      interno: false,
      processadoEm: expect.any(Date),
    })
    const ass = await prisma.assentamento.findMany({ where: { chamadoId: d.id } })
    expect(ass).toHaveLength(1)
    expect(ass[0]).toMatchObject({ tipo: 'SISTEMA', interno: false, texto: 'Chamado aberto', evento: 'CRIADO' })
    expect(ev[0]?.assentamentoId).toBe(ass[0]?.id)
    expect(await prisma.auditoria.count({ where: { acao: 'chamado.abertoEmNome' } })).toBe(0)
  })

  it('a resposta não vaza campo interno, hash nem busca; USUARIO não recebe `descricaoTecnica` nem `tags`', async () => {
    const c = await cenario()
    const res = await abrir(c.hUsuario, { ...corpo, problemaId: c.problema.id })
    const d = res.json()
    expect(d).not.toHaveProperty('descricaoTecnica')
    expect(d).not.toHaveProperty('tags')
    expect(res.body).not.toMatch(/buscaNorm|busca_norm|senhaHash|tokenHash|totp/i)
  })

  it('USUARIO: `areaId` e `canalId` dão 400, tags dão 400, e solicitante de outro dá 403', async () => {
    const c = await cenario()
    const base400 = (extra: Record<string, unknown>) =>
      abrir(c.hUsuario, { ...corpo, problemaId: c.problema.id, ...extra })
    const area = await base400({ areaId: c.outraArea.id })
    expect(area.statusCode).toBe(400)
    expect(area.json().erro.detalhes[0]).toMatchObject({ campo: 'areaId' })
    expect((await base400({ canalId: base.canalTelefoneId })).statusCode).toBe(400)
    expect((await base400({ tags: ['rede'] })).statusCode).toBe(400)
    const outro = await criarUsuario({ perfil: 'USUARIO' })
    const alheio = await base400({ solicitanteId: outro.id })
    expect(alheio.statusCode).toBe(403)
    expect(alheio.json().erro.codigo).toBe('SEM_PERMISSAO')
    expect((await base400({ solicitanteId: c.usuario.id })).statusCode).toBe(201) // o próprio id é aceito
    expect(await prisma.chamado.count()).toBe(1)
  })

  it('problema inexistente ou inativo dá 400; problema sem área padrão dá 422 para USUARIO', async () => {
    const c = await cenario()
    const inexistente = await abrir(c.hUsuario, { ...corpo, problemaId: 999_999 })
    expect(inexistente.statusCode).toBe(400)
    expect(inexistente.json().erro.detalhes[0]).toMatchObject({ campo: 'problemaId' })
    await prisma.problema.update({ where: { id: c.problema.id }, data: { ativo: false } })
    expect((await abrir(c.hUsuario, { ...corpo, problemaId: c.problema.id })).statusCode).toBe(400)

    const semPadrao = await criarProblema({ areaIds: [c.areaPadrao.id] })
    const sem = await abrir(c.hUsuario, { ...corpo, problemaId: semPadrao.id })
    expect(sem.statusCode).toBe(422)
    expect(sem.json().erro.codigo).toBe('REGRA_NEGOCIO')
  })

  it('equipe escolhe área (entre as do problema) e canal; usa a padrão sem `areaId`; tags entram e só a equipe as vê', async () => {
    const c = await cenario()
    const padrao = await abrir(c.hOperador, { ...corpo, problemaId: c.problema.id })
    expect(padrao.statusCode).toBe(201)
    expect(padrao.json().area.id).toBe(c.areaPadrao.id)

    const escolhida = await abrir(c.hOperador, {
      ...corpo,
      problemaId: c.problema.id,
      areaId: c.outraArea.id,
      canalId: base.canalTelefoneId,
      tags: ['Rede', ' rede ', 'Urgente'],
    })
    expect(escolhida.statusCode).toBe(201)
    const d = escolhida.json()
    expect(d.area.id).toBe(c.outraArea.id)
    expect(d.canal.nome).toBe('Telefone')
    expect(d.tags.map((t: { nome: string }) => t.nome)).toEqual(['Rede', 'Urgente'])
    expect(await prisma.chamadoTag.count({ where: { chamadoId: d.id } })).toBe(2)
    expect(d).not.toHaveProperty('descricaoTecnica') // o OPERADOR é o solicitante aqui: não vê conteúdo interno (S49)

    const fora = await abrir(c.hOperador, { ...corpo, problemaId: c.problema.id, areaId: c.foraDoProblema.id })
    expect(fora.statusCode).toBe(400)
    expect(fora.json().erro.detalhes[0]).toMatchObject({ campo: 'areaId' })
  })

  it('T38: OPERADOR em nome de ADMIN dá 403; em nome de USUARIO grava abertoPorId, canal Telefone, seguidores e auditoria', async () => {
    const c = await cenario()
    const proibido = await abrir(c.hOperador, { ...corpo, problemaId: c.problema.id, solicitanteId: c.admin.id })
    expect(proibido.statusCode).toBe(403)
    expect(await prisma.chamado.count()).toBe(0)

    const res = await abrir(c.hOperador, { ...corpo, problemaId: c.problema.id, solicitanteId: c.usuario.id })
    expect(res.statusCode).toBe(201)
    const d = res.json()
    expect(d).toMatchObject({
      solicitante: { id: c.usuario.id },
      abertoPor: { id: c.operador.id },
      canal: { nome: 'Telefone' },
    })
    const noBanco = await prisma.chamado.findUniqueOrThrow({ where: { id: d.id } })
    expect(noBanco.abertoPorId).toBe(c.operador.id)
    expect(noBanco.solicitanteId).toBe(c.usuario.id)
    const seguidores = await prisma.chamadoSeguidor.findMany({
      where: { chamadoId: d.id },
      orderBy: { usuarioId: 'asc' },
      select: { usuarioId: true, motivo: true },
    })
    expect(seguidores).toEqual(
      [
        { usuarioId: c.usuario.id, motivo: 'SOLICITANTE' },
        { usuarioId: c.operador.id, motivo: 'ABRIU' },
      ].sort((a, b) => a.usuarioId - b.usuarioId),
    )
    const trilha = await prisma.auditoria.findMany({ where: { acao: 'chamado.abertoEmNome' } })
    expect(trilha).toHaveLength(1)
    expect(trilha[0]).toMatchObject({ atorId: c.operador.id, entidade: 'chamado', entidadeId: String(d.id) })
    const ass = await prisma.assentamento.findFirstOrThrow({ where: { chamadoId: d.id } })
    expect(ass.texto).toMatch(/^Aberto por .+ em nome de .+$/)
    // o operador aparece como participante de quem o chamado foi aberto em nome
    expect(d.participantes.map((p: { papel: string }) => p.papel).sort()).toEqual(['SEGUIDOR', 'SOLICITANTE'])
    expect(d.seguindo).toBe(true)
  })

  it('em nome de outro: ADMIN pode abrir para OPERADOR; alvo inativo ou inexistente dá 400', async () => {
    const c = await cenario()
    expect(
      (await abrir(c.hAdmin, { ...corpo, problemaId: c.problema.id, solicitanteId: c.operador.id })).statusCode,
    ).toBe(201)
    const inativo = await criarUsuario({ perfil: 'USUARIO', ativo: false })
    const r1 = await abrir(c.hOperador, { ...corpo, problemaId: c.problema.id, solicitanteId: inativo.id })
    expect(r1.statusCode).toBe(400)
    expect(r1.json().erro.detalhes[0]).toMatchObject({ campo: 'solicitanteId' })
    expect((await abrir(c.hOperador, { ...corpo, problemaId: c.problema.id, solicitanteId: 999_999 })).statusCode).toBe(
      400,
    )
  })

  it('prioridade, departamento e ativo informados são validados', async () => {
    const c = await cenario()
    const alta = await prisma.prioridade.create({ data: { nome: 'Alta de teste', ordem: 9, slaSolucaoMin: 60 } })
    const ok = await abrir(c.hOperador, { ...corpo, problemaId: c.problema.id, prioridadeId: alta.id })
    expect(ok.statusCode).toBe(201)
    expect(ok.json().prioridade.id).toBe(alta.id)
    expect(ok.json().sla.solucao.meta).toBe(60)
    for (const [campo, valor] of [
      ['prioridadeId', 999_999],
      ['departamentoId', 999_999],
      ['ativoId', 999_999],
    ] as const) {
      const res = await abrir(c.hOperador, { ...corpo, problemaId: c.problema.id, [campo]: valor })
      expect(res.statusCode, campo).toBe(400)
      expect(res.json().erro.detalhes[0]).toMatchObject({ campo })
    }
    expect(await prisma.chamado.count()).toBe(1) // os inválidos não deixaram nada
  })

  it('depois do commit: assentamento e fila `criado` são emitidos; erro do publicador não derruba a abertura', async () => {
    const c = await cenario()
    const res = await abrir(c.hUsuario, { ...corpo, problemaId: c.problema.id })
    const d = res.json()
    const ass = await prisma.assentamento.findFirstOrThrow({ where: { chamadoId: d.id } })
    expect(publicador.emitirAssentamentos).toHaveBeenCalledExactlyOnceWith(d.id, [ass.id])
    expect(publicador.emitirFila).toHaveBeenCalledExactlyOnceWith(d.id, 'criado')
    expect(publicador.emitirChamadoAtualizado).not.toHaveBeenCalled()

    publicador.emitirFila.mockImplementation(() => {
      throw new Error('socket fora do ar')
    })
    const outra = await abrir(c.hUsuario, { ...corpo, assunto: 'Outro chamado', problemaId: c.problema.id })
    expect(outra.statusCode).toBe(201)
  })

  it('contato e e-mail informados valem; os do solicitante só entram como padrão', async () => {
    const c = await cenario()
    await prisma.usuario.update({ where: { id: c.usuario.id }, data: { email: 'padrao@exemplo.com' } })
    const res = await abrir(c.hUsuario, {
      ...corpo,
      problemaId: c.problema.id,
      contato: 'Maria da Recepção',
      contatoEmail: 'maria@exemplo.com',
      telefone: '1133334444',
    })
    expect(res.json()).toMatchObject({
      contato: 'Maria da Recepção',
      contatoEmail: 'maria@exemplo.com',
      telefone: '1133334444',
    })
    expect(
      (await abrir(c.hUsuario, { ...corpo, problemaId: c.problema.id, contatoEmail: 'invalido' })).statusCode,
    ).toBe(400)
  })
})
