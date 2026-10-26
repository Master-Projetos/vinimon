import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { executarEnvioEmail } from '../../jobs/email-enviar'
import { definirTransporte, type Transporte } from '../../lib/email'
import { filasEmMemoria, limparFilaMemoria } from '../../lib/filas'
import { prisma } from '../../lib/prisma'
import { render } from './render'

const enviados: { to: string; subject: string }[] = []
const gravador: Transporte = {
  async sendMail(mensagem) {
    enviados.push({ to: mensagem.to, subject: mensagem.subject })
    return {}
  },
}

const corpoValido = { assunto: 'Chamado {{numero}}: {{assunto}}', corpoTexto: 'Olá {{solicitante}}', ativo: true }

describe('módulo modelos de e-mail', () => {
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
    limparFilaMemoria()
    enviados.length = 0
    await prisma.modeloEmail.createMany({
      data: [
        { evento: 'abertura', assunto: 'Chamado {{numero}} aberto', corpoTexto: 'Olá {{solicitante}}', ativo: true },
        { evento: 'lembrete', assunto: 'Lembrete {{numero}}', corpoTexto: 'Aguarda atenção', ativo: true },
      ],
    })
  })
  afterEach(() => {
    definirTransporte(undefined)
  })

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/modelos-email' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR, em listar, editar e enviar teste', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const headers = await headersDe(u.id)
      const lista = await app.inject({ method: 'GET', url: '/api/v1/modelos-email', headers })
      expect(lista.statusCode).toBe(403)
      expect(lista.json().erro.codigo).toBe('SEM_PERMISSAO')
      const editada = await app.inject({
        method: 'PUT',
        url: '/api/v1/modelos-email/abertura',
        headers,
        payload: corpoValido,
      })
      expect(editada.statusCode).toBe(403)
      const teste = await app.inject({
        method: 'POST',
        url: '/api/v1/modelos-email/teste',
        headers,
        payload: { para: 'alguem@exemplo.com' },
      })
      expect(teste.statusCode).toBe(403)
    }
    expect(await prisma.auditoria.count({ where: { entidade: 'modelo_email' } })).toBe(0)
  })

  it('400 com detalhes por campo e para chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const semAssunto = await app.inject({
      method: 'PUT',
      url: '/api/v1/modelos-email/abertura',
      headers,
      payload: { ...corpoValido, assunto: '   ' },
    })
    expect(semAssunto.statusCode).toBe(400)
    expect(semAssunto.json().erro.codigo).toBe('VALIDACAO')
    expect(semAssunto.json().erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'assunto' })]),
    )
    const extra = await app.inject({
      method: 'PUT',
      url: '/api/v1/modelos-email/abertura',
      headers,
      payload: { ...corpoValido, evento: 'lembrete' },
    })
    expect(extra.statusCode).toBe(400)
    const paraInvalido = await app.inject({
      method: 'POST',
      url: '/api/v1/modelos-email/teste',
      headers,
      payload: { para: 'nao-e-email' },
    })
    expect(paraInvalido.statusCode).toBe(400)
    expect(paraInvalido.json().erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'para' })]),
    )
  })

  it('200: lista, obtém, altera e audita', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const lista = await app.inject({ method: 'GET', url: '/api/v1/modelos-email', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toHaveLength(2)
    expect(lista.json()[0]).toMatchObject({ evento: 'abertura', ativo: true })
    expect(lista.json()[0].atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const um = await app.inject({ method: 'GET', url: '/api/v1/modelos-email/lembrete', headers })
    expect(um.statusCode).toBe(200)
    expect(um.json()).toMatchObject({ evento: 'lembrete', corpoTexto: 'Aguarda atenção' })

    const alterado = await app.inject({
      method: 'PUT',
      url: '/api/v1/modelos-email/abertura',
      headers,
      payload: { ...corpoValido, ativo: false },
    })
    expect(alterado.statusCode).toBe(200)
    expect(alterado.json()).toMatchObject({ evento: 'abertura', assunto: corpoValido.assunto, ativo: false })
    const gravado = await prisma.modeloEmail.findUniqueOrThrow({ where: { evento: 'abertura' } })
    expect(gravado.ativo).toBe(false)
    const auditado = await prisma.auditoria.findFirstOrThrow({
      where: { acao: 'cadastro.alterado', entidade: 'modelo_email', entidadeId: 'abertura' },
    })
    expect(auditado.atorId).toBe(admin.id)
  })

  it('404 para evento inexistente, em obter e em editar, sem auditar', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const obtido = await app.inject({ method: 'GET', url: '/api/v1/modelos-email/inexistente', headers })
    expect(obtido.statusCode).toBe(404)
    expect(obtido.json().erro.codigo).toBe('NAO_ENCONTRADO')
    const editado = await app.inject({
      method: 'PUT',
      url: '/api/v1/modelos-email/inexistente',
      headers,
      payload: corpoValido,
    })
    expect(editado.statusCode).toBe(404)
    expect(await prisma.auditoria.count({ where: { entidade: 'modelo_email' } })).toBe(0)
    expect(await prisma.modeloEmail.count({ where: { evento: 'inexistente' } })).toBe(0)
  })

  it('envio de teste grava na outbox, agenda o job e chega ao transporte', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    definirTransporte(gravador)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/modelos-email/teste',
      headers,
      payload: { para: 'teste@exemplo.com' },
    })
    expect(res.statusCode).toBe(200)
    const { id } = res.json()
    expect(filasEmMemoria.enviados).toEqual([expect.objectContaining({ fila: 'email-enviar', dados: { id } })])

    await executarEnvioEmail({ id })
    expect(enviados).toEqual([{ to: 'teste@exemplo.com', subject: 'Teste de e-mail do Vinimon' }])
    const registro = await prisma.emailSaida.findUniqueOrThrow({ where: { id } })
    expect(registro).toMatchObject({ status: 'ENVIADO', evento: 'teste', para: 'teste@exemplo.com' })
  })

  it('render escapa variáveis no HTML, troca <br> nas quebras e deixa variável desconhecida literal', () => {
    const r = render(
      { assunto: '{{desconhecida}} {{numero}}', corpoTexto: 'Olá {{solicitante}}\nVeja {{link}}' },
      { numero: '7', solicitante: '<script>alert("x")</script>' },
    )
    expect(r.assunto).toBe('{{desconhecida}} 7')
    expect(r.texto).toBe('Olá <script>alert("x")</script>\nVeja {{link}}')
    expect(r.html).toBe('Olá &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>Veja {{link}}')
    expect(r.html).not.toContain('<script>')
  })
})
