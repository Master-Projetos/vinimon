import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

const usuario: UsuarioMe = {
  id: 7,
  nome: 'Ana Souza',
  login: 'ana',
  email: null,
  telefone: null,
  perfil: 'OPERADOR',
  areaId: null,
  areaIds: [],
  permissoes: [],
  mfaAtivo: true,
  deveTrocarSenha: false,
  tema: 'SISTEMA',
  densidade: null,
  enviarComEnter: true,
}
const sessao = (estado: SessaoResposta['estado']): SessaoResposta => ({
  estado,
  csrf: 'csrf-novo',
  usuario: estado === 'ATIVA' ? usuario : null,
})
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

const CODIGOS = Array.from({ length: 10 }, (_, i) => `ABCD-EFGH-JKMN-${String(1000 + i)}`)
const INICIAR = {
  otpauthUri: 'otpauth://totp/Vinimon:ana?secret=JBSWY3DPEHPK3PXP&issuer=Vinimon',
  segredo: 'JBSWY3DPEHPK3PXP',
}

let falsaAtual: ApiFalsa | undefined

// o jsdom não implementa `elementFromPoint` (usado pelo `input-otp`) nem `createObjectURL`
beforeAll(() => {
  if (typeof document.elementFromPoint !== 'function') document.elementFromPoint = () => null
})
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
  vi.unstubAllGlobals()
})

function montar(respostas: Parameters<typeof renderRota>[1]['respostas']) {
  const r = renderRota('/configurar-2fa', { sessao: sessao('CADASTRO_MFA'), respostas })
  falsaAtual = r.falsa
  return r
}

describe('/configurar-2fa', () => {
  it('(a) inicia o cadastro e mostra o QR code e a chave', async () => {
    const { falsa } = montar({ 'POST /auth/2fa/iniciar': () => json(INICIAR) })
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument()
    expect(screen.getByTitle('QR code para o aplicativo autenticador')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    expect(falsa.chamadas.filter((c) => c.url.endsWith('/auth/2fa/iniciar'))).toHaveLength(1)
  })

  it('copia a chave de configuração', async () => {
    const escrever = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: escrever } })
    montar({ 'POST /auth/2fa/iniciar': () => json(INICIAR) })
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar chave' }))
    await waitFor(() => expect(escrever).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP'))
  })

  it('(b) confirmar envia o código, mostra os 10 códigos e "Concluir" só habilita depois de marcar; depois vai para / e a guarda leva a /atividade', async () => {
    const { falsa, router, queryClient } = montar({
      'POST /auth/2fa/iniciar': () => json(INICIAR),
      'POST /auth/2fa/confirmar': () => json({ codigos: CODIGOS, sessao: sessao('ATIVA') }),
    })
    await screen.findByText('JBSWY3DPEHPK3PXP')
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '123456' } })
    await screen.findByText(CODIGOS[0] ?? '')
    expect(falsa.chamadas).toContainEqual({
      metodo: 'POST',
      url: '/api/v1/auth/2fa/confirmar',
      corpo: { codigo: '123456' },
    })
    for (const c of CODIGOS) expect(screen.getByText(c)).toBeInTheDocument()

    const concluir = screen.getByRole('button', { name: 'Concluir' })
    expect(concluir).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Guardei meus códigos'))
    expect(concluir).toBeEnabled()
    expect(router.state.location.pathname).toBe('/configurar-2fa')
    fireEvent.click(concluir)
    await waitFor(() => expect(router.state.location.pathname).toBe('/atividade'))
    expect(queryClient.getQueryData(['auth', 'sessao'])).toMatchObject({ estado: 'ATIVA', csrf: 'csrf-novo' })
  })

  it('os códigos podem ser copiados e baixados como .txt (Blob local)', async () => {
    const escrever = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: escrever } })
    const criarUrl = vi.fn(() => 'blob:teste')
    const revogarUrl = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: criarUrl, revokeObjectURL: revogarUrl }))
    montar({
      'POST /auth/2fa/iniciar': () => json(INICIAR),
      'POST /auth/2fa/confirmar': () => json({ codigos: CODIGOS, sessao: sessao('ATIVA') }),
    })
    await screen.findByText('JBSWY3DPEHPK3PXP')
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '123456' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(escrever).toHaveBeenCalledWith(CODIGOS.join('\n')))
    fireEvent.click(screen.getByRole('button', { name: 'Baixar .txt' }))
    expect(criarUrl).toHaveBeenCalledTimes(1)
    const blob = (criarUrl.mock.calls[0] as unknown as [Blob])[0]
    expect(await blob.text()).toContain(CODIGOS[0])
    expect(revogarUrl).toHaveBeenCalledWith('blob:teste')
  })

  it('(c) 400 com detalhes mostra a mensagem e limpa o campo para tentar de novo', async () => {
    montar({
      'POST /auth/2fa/iniciar': () => json(INICIAR),
      'POST /auth/2fa/confirmar': () =>
        json(
          {
            erro: {
              codigo: 'VALIDACAO',
              mensagem: 'Dados inválidos.',
              detalhes: [{ campo: 'codigo', mensagem: 'Código incorreto.' }],
            },
          },
          400,
        ),
    })
    await screen.findByText('JBSWY3DPEHPK3PXP')
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '000000' } })
    expect(await screen.findByText('Código incorreto.')).toBeInTheDocument()
    expect(screen.getByLabelText('Código de 6 dígitos')).toHaveValue('')
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao iniciar mostra o ErrorState', async (status, titulo) => {
    montar({
      'POST /auth/2fa/iniciar': () => json({ erro: { codigo: 'SEM_PERMISSAO', mensagem: 'Negado.' } }, status),
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument()
  })
})
