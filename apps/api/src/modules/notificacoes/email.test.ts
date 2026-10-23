import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { enviarResumoDiario } from '../../jobs/email-resumo-diario'
import { invalidarConfig } from '../../lib/config'
import { definirTransporte, type Transporte } from '../../lib/email'
import { filasEmMemoria, limparFilaMemoria } from '../../lib/filas'
import { prisma } from '../../lib/prisma'
import { executarEnvioEmailNotificacao } from './email-notificacao'
import { processarEvento } from './fanout'

const enviados: { to: string; subject: string; text: string }[] = []
const gravador: Transporte = {
  async sendMail(mensagem) {
    enviados.push({ to: mensagem.to, subject: mensagem.subject, text: mensagem.text })
    return {}
  },
}

async function ligarEmail(ligado: boolean): Promise<void> {
  await prisma.config.upsert({
    where: { chave: 'email.habilitado' },
    create: { chave: 'email.habilitado', valor: ligado },
    update: { valor: ligado },
  })
  invalidarConfig()
}

describe('e-mail de notificações (S101, S102, §5.6, §5.7)', () => {
  beforeEach(async () => {
    await limparBanco()
    await semearBase()
    limparFilaMemoria()
    enviados.length = 0
    definirTransporte(gravador)
    await ligarEmail(true)
  })
  afterEach(() => {
    definirTransporte(undefined)
    invalidarConfig()
  })

  async function cenario() {
    const A = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const colega = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    await prisma.usuario.update({ where: { id: sol.id }, data: { email: 'solicitante@exemplo.com' } })
    await prisma.usuario.update({ where: { id: op.id }, data: { email: 'operador@exemplo.com' } })
    const c = await criarChamado({ solicitanteId: sol.id, areaId: A.id, papel: 'EM_ATENDIMENTO', operadorId: op.id })
    await prisma.chamadoSeguidor.createMany({
      data: [
        { chamadoId: c.id, usuarioId: sol.id, motivo: 'SOLICITANTE' },
        { chamadoId: c.id, usuarioId: op.id, motivo: 'ATRIBUIDO' },
      ],
    })
    // o operador recebe comentário por e-mail (padrão de staff é NUNCA): preferência explícita
    await prisma.preferenciaNotificacao.create({
      data: { usuarioId: op.id, tipo: 'COMENTARIO', inApp: true, desktop: true, email: 'IMEDIATO' },
    })
    return { sol, op, colega, c }
  }

  const evento = (chamadoId: number, tipo: 'COMENTARIO' | 'STATUS_ALTERADO', atorId: number, interno = false) =>
    prisma.chamadoEvento.create({
      data: { chamadoId, tipo, atorId, interno, dados: {} },
      select: { id: true },
    })

  const emailsDe = (usuarioId: number) => prisma.emailSaida.findMany({ where: { usuarioId } })

  it('comentário interno: o e-mail diz só que há comentário, sem o texto, e o solicitante não recebe', async () => {
    const x = await cenario()
    const segredo = 'SEGREDO-INTERNO-7741'
    const assentamento = await prisma.assentamento.create({
      data: { chamadoId: x.c.id, autorId: x.op.id, tipo: 'COMENTARIO', interno: true, texto: segredo },
    })
    const ev = await prisma.chamadoEvento.create({
      data: {
        chamadoId: x.c.id,
        tipo: 'COMENTARIO',
        atorId: x.colega.id,
        interno: true,
        dados: {},
        assentamentoId: assentamento.id,
      },
      select: { id: true },
    })
    await processarEvento(ev.id)

    const doOperador = await emailsDe(x.op.id)
    expect(doOperador).toHaveLength(1)
    expect(doOperador[0]?.texto).toBe(`Há um novo comentário interno no chamado #${x.c.id}`)
    expect(doOperador[0]?.texto).not.toContain(segredo)
    expect(doOperador[0]?.assunto).not.toContain(segredo)
    expect(await emailsDe(x.sol.id)).toHaveLength(0)
    expect(await prisma.emailSaida.count({ where: { texto: { contains: segredo } } })).toBe(0)
  })

  it('o envio sai 60 s depois do commit, com a chave de idempotência da notificação', async () => {
    const x = await cenario()
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.colega.id)).id)
    const doSolicitante = await emailsDe(x.sol.id)
    expect(doSolicitante).toHaveLength(1)
    expect(doSolicitante[0]?.texto).toBe(`Alguém comentou em #${x.c.id}`)
    expect(doSolicitante[0]?.chaveIdempotencia).toMatch(/^notif:\d+:\d{4}-\d{2}-\d{2}T/)
    const agendados = filasEmMemoria.enviados.filter((e) => e.fila === 'email-enviar')
    expect(agendados).toHaveLength(2)
    expect(agendados.every((e) => e.opcoes?.startAfter === 60)).toBe(true)
  })

  it('NUNCA não enfileira: o operador sem preferência não recebe comentário público', async () => {
    const x = await cenario()
    await prisma.preferenciaNotificacao.deleteMany({ where: { usuarioId: x.op.id } })
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.sol.id)).id)
    expect(await emailsDe(x.op.id)).toHaveLength(0)
  })

  it('sem email.habilitado não enfileira nenhum e-mail', async () => {
    const x = await cenario()
    await ligarEmail(false)
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.colega.id)).id)
    expect(await prisma.emailSaida.count()).toBe(0)
    expect(filasEmMemoria.enviados.filter((e) => e.fila === 'email-enviar')).toHaveLength(0)
  })

  it('notificação lida antes do envio não envia: o registro fica ENVIADO com erro "lida"', async () => {
    const x = await cenario()
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.colega.id)).id)
    const [email] = await emailsDe(x.sol.id)
    const notificacao = await prisma.notificacao.findFirstOrThrow({ where: { usuarioId: x.sol.id } })
    await prisma.notificacao.update({ where: { id: notificacao.id }, data: { lidaEm: new Date() } })

    await executarEnvioEmailNotificacao({ id: email?.id ?? 0 })

    expect(enviados).toHaveLength(0)
    const depois = await prisma.emailSaida.findUniqueOrThrow({ where: { id: email?.id ?? 0 } })
    expect(depois.status).toBe('ENVIADO')
    expect(depois.erro).toBe('lida')
  })

  it('notificação não lida: o envio segue normal', async () => {
    const x = await cenario()
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.colega.id)).id)
    const [email] = await emailsDe(x.sol.id)
    await executarEnvioEmailNotificacao({ id: email?.id ?? 0 })
    expect(enviados.map((e) => e.to)).toEqual(['solicitante@exemplo.com'])
    expect((await prisma.emailSaida.findUniqueOrThrow({ where: { id: email?.id ?? 0 } })).status).toBe('ENVIADO')
  })

  it('canal RESUMO não envia na hora; o resumo diário junta as notificações do dia anterior', async () => {
    const x = await cenario()
    await prisma.preferenciaNotificacao.create({
      data: { usuarioId: x.sol.id, tipo: 'COMENTARIO', inApp: true, desktop: true, email: 'RESUMO' },
    })
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.colega.id)).id)
    expect(await emailsDe(x.sol.id)).toHaveLength(0)

    // 14/06 às 15h UTC (12h em São Paulo): dia anterior ao da execução, 15/06 às 9h em São Paulo
    await prisma.notificacao.updateMany({
      where: { usuarioId: x.sol.id },
      data: { atualizadoEm: new Date('2026-06-14T15:00:00Z') },
    })
    expect(await enviarResumoDiario(new Date('2026-06-15T12:00:00Z'))).toEqual({ enviados: 1 })
    const resumo = await prisma.emailSaida.findMany({ where: { usuarioId: x.sol.id, evento: 'RESUMO_DIARIO' } })
    expect(resumo).toHaveLength(1)
    expect(resumo[0]?.texto).toContain(`Alguém comentou em #${x.c.id}`)
    // mesma execução de novo no mesmo dia não duplica
    await enviarResumoDiario(new Date('2026-06-15T12:00:00Z'))
    expect(await prisma.emailSaida.count({ where: { evento: 'RESUMO_DIARIO' } })).toBe(1)
  })
})
