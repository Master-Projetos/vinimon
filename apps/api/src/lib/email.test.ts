import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { limparBanco } from '../../test/ajudantes'
import { executarEnvioEmail } from '../jobs/email-enviar'
import { varrerEmails } from '../jobs/email-varrer'
import { definirTransporte, enfileirarEmail, enviarEmail, type Transporte } from './email'
import { filasEmMemoria, limparFilaMemoria } from './filas'
import { prisma } from './prisma'

const UM_MINUTO_MS = 60_000
const VINTE_E_QUATRO_HORAS_MS = 24 * 60 * UM_MINUTO_MS

const enviados: { to: string; headers: Record<string, string> }[] = []
const gravador: Transporte = {
  async sendMail(mensagem) {
    enviados.push({ to: mensagem.to, headers: mensagem.headers })
    return {}
  },
}

async function criarEmail(chave: string): Promise<number> {
  return prisma.$transaction((tx) =>
    enfileirarEmail(tx, {
      para: 'solicitante@exemplo.com',
      assunto: 'Chamado #1 atualizado',
      texto: 'Seu chamado foi atualizado.',
      evento: 'STATUS_ALTERADO',
      chaveIdempotencia: chave,
    }),
  )
}

describe('outbox de e-mail (NOT-7)', () => {
  beforeEach(async () => {
    await limparBanco()
    limparFilaMemoria()
    enviados.length = 0
    definirTransporte(gravador)
  })
  afterEach(() => {
    definirTransporte(undefined)
  })

  it('a mesma chaveIdempotencia não cria outro registro', async () => {
    const primeiro = await criarEmail('chave-repetida')
    const segundo = await criarEmail('chave-repetida')
    expect(segundo).toBe(primeiro)
    expect(await prisma.emailSaida.count()).toBe(1)
  })

  it('envio idempotente: repetir o job não envia de novo e grava os cabeçalhos anti-loop', async () => {
    const id = await criarEmail('chave-envio')
    await executarEnvioEmail({ id })
    await executarEnvioEmail({ id })
    expect(enviados).toHaveLength(1)
    expect(enviados[0]?.headers).toEqual({ 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' })
    const registro = await prisma.emailSaida.findUniqueOrThrow({ where: { id } })
    expect(registro.status).toBe('ENVIADO')
    expect(registro.enviadoEm).toBeInstanceOf(Date)
  })

  it('falha de envio volta a PENDENTE com o erro, e a nova tentativa envia', async () => {
    const id = await criarEmail('chave-falha')
    definirTransporte({
      async sendMail() {
        throw new Error('SMTP indisponível')
      },
    })
    await expect(enviarEmail(id)).rejects.toThrow('SMTP indisponível')
    const falhou = await prisma.emailSaida.findUniqueOrThrow({ where: { id } })
    expect(falhou.status).toBe('PENDENTE')
    expect(falhou.erro).toBe('SMTP indisponível')
    expect(falhou.tentativas).toBe(1)

    definirTransporte(gravador)
    await enviarEmail(id)
    const enviado = await prisma.emailSaida.findUniqueOrThrow({ where: { id } })
    expect(enviado.status).toBe('ENVIADO')
    expect(enviado.erro).toBeNull()
    expect(enviados).toHaveLength(1)
  })

  it('varredura reenfileira pendentes de mais de 5 min e marca FALHOU os de mais de 24 h', async () => {
    const agora = new Date()
    const antigo = await criarEmail('chave-antigo')
    const medio = await criarEmail('chave-medio')
    await criarEmail('chave-novo')
    await prisma.emailSaida.update({
      where: { id: antigo },
      data: { criadoEm: new Date(agora.getTime() - VINTE_E_QUATRO_HORAS_MS - UM_MINUTO_MS) },
    })
    await prisma.emailSaida.update({
      where: { id: medio },
      data: { criadoEm: new Date(agora.getTime() - 6 * UM_MINUTO_MS) },
    })

    const resultado = await varrerEmails(agora)
    expect(resultado).toEqual({ falhou: 1, reenfileirados: 1 })
    expect(filasEmMemoria.enviados).toEqual([
      { fila: 'email-enviar', dados: { id: medio }, opcoes: { retryLimit: 5, retryBackoff: true } },
    ])
    const expirado = await prisma.emailSaida.findUniqueOrThrow({ where: { id: antigo } })
    expect(expirado.status).toBe('FALHOU')
  })
})
