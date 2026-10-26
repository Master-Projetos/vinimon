import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  CHAVES_CONFIG_PUBLICAS,
  type ChamadoDetalhe,
  CONFIG_PADRAO,
  type Meta,
  type SessaoResposta,
  type UsuarioMe,
} from '@vinimon/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DensityProvider } from '@/components/theme/density-provider'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { type ApiFalsa, apiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'
import { ValidacaoCard } from './validacao-card'

// Radix (RadioGroup, Switch, Dialog) usa ResizeObserver e o foco por seta, que o jsdom não traz pronto.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let falsaAtual: ApiFalsa | undefined

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  Element.prototype.scrollIntoView = () => undefined
})

afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
  vi.unstubAllGlobals()
})

function sessaoDe(perfil: UsuarioMe['perfil']): SessaoResposta {
  const usuario: UsuarioMe = {
    id: 20,
    nome: 'Carla Dias',
    login: 'carla',
    email: null,
    telefone: null,
    perfil,
    areaId: null,
    areaIds: [],
    permissoes: [],
    mfaAtivo: false,
    deveTrocarSenha: false,
    tema: 'SISTEMA',
    densidade: null,
    enviarComEnter: true,
  }
  return { estado: 'ATIVA', csrf: 'csrf-teste', usuario }
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

const MEDIA = { id: 2, nome: 'Média', cor: '#2563eb', ordem: 2 }
const EM_ATENDIMENTO = {
  id: 2,
  nome: 'Em atendimento',
  tipo: 'EM_ATENDIMENTO',
  papel: 'EM_ATENDIMENTO',
  cor: '#16a34a',
}
const SLA_PRAZO = {
  meta: 480,
  prazo: '2099-01-01T12:00:00.000Z',
  alerta: '2098-12-31T12:00:00.000Z',
  cumprido: null,
  finalizado: false,
}

function detalhe(sobrescrever: Record<string, unknown> = {}) {
  return {
    id: 5,
    assunto: 'Impressora parada',
    novo: false,
    cancelado: false,
    status: EM_ATENDIMENTO,
    prioridade: MEDIA,
    area: { id: 1, nome: 'Suporte' },
    problema: { id: 4, nome: 'Impressão' },
    solicitante: { id: 20, nome: 'Carla Dias' },
    operador: { id: 8, nome: 'Bruno Lima' },
    abertoEm: '2026-10-01T10:00:00.000Z',
    agendadoPara: null,
    ultimaAtividadeEm: '2026-10-01T11:00:00.000Z',
    ultimaInteracao: null,
    naoLido: false,
    qtdAnexos: 0,
    sla: { resposta: { ...SLA_PRAZO, finalizado: true, cumprido: true }, solucao: SLA_PRAZO },
    descricao: 'A impressora do setor não imprime.',
    solucao: null,
    contato: null,
    contatoEmail: null,
    telefone: null,
    abertoPor: { id: 9, nome: 'Diego Reis' },
    canal: { id: 1, nome: 'Telefone' },
    departamento: { id: 3, nome: 'Financeiro' },
    ativo: null,
    primeiraRespostaEm: '2026-10-01T10:30:00.000Z',
    concluidoEm: null,
    encerradoEm: null,
    validacaoLimiteEm: null,
    statusDesde: '2026-10-01T10:30:00.000Z',
    rejeicoes: 1,
    versao: 3,
    participantes: [
      { id: 20, nome: 'Carla Dias', papel: 'SOLICITANTE' },
      { id: 8, nome: 'Bruno Lima', papel: 'OPERADOR' },
    ],
    tags: [],
    avaliacao: null,
    seguindo: false,
    acoes: {
      assumir: true,
      encaminhar: true,
      status: true,
      prioridade: true,
      classificar: true,
      tags: true,
      agendar: true,
      concluir: true,
      aprovar: false,
      rejeitar: false,
      reabrir: false,
      cancelar: true,
      comentar: true,
      comentarInterno: true,
      anexar: true,
    },
    ...sobrescrever,
  }
}

const CONCLUIDO = { id: 6, nome: 'Concluído', tipo: 'CONCLUIDO', papel: 'CONCLUIDO', cor: '#16a34a' }
const ENCERRADO = { id: 7, nome: 'Encerrado', tipo: 'ENCERRADO', papel: 'ENCERRADO', cor: '#64748b' }
const TUDO_FALSO = {
  assumir: false,
  encaminhar: false,
  status: false,
  prioridade: false,
  classificar: false,
  tags: false,
  agendar: false,
  concluir: false,
  aprovar: false,
  rejeitar: false,
  reabrir: false,
  cancelar: false,
  comentar: false,
  comentarInterno: false,
  anexar: false,
}

function chamadoConcluido(acoes: Record<string, boolean> = { aprovar: true, rejeitar: true }) {
  return {
    ...detalhe(),
    status: CONCLUIDO,
    solucao: 'Troquei o toner e limpei o cabeçote.',
    concluidoEm: '2026-10-02T12:00:00.000Z',
    validacaoLimiteEm: '2026-10-05T12:00:00.000Z',
    versao: 3,
    acoes: { ...TUDO_FALSO, ...acoes },
  }
}

function chamadoEncerrado(acoes: Record<string, boolean> = {}) {
  return {
    ...detalhe(),
    status: ENCERRADO,
    solucao: 'Troquei o toner.',
    concluidoEm: '2026-10-02T12:00:00.000Z',
    encerradoEm: '2026-10-03T12:00:00.000Z',
    avaliacao: { nota: 'BOM', comentario: null, automatica: false, criadoEm: '2026-10-03T12:00:00.000Z' },
    versao: 4,
    acoes: { ...TUDO_FALSO, ...acoes },
  }
}

function montarCard(corpoDetalhe: ReturnType<typeof chamadoConcluido>, respostas: Parameters<typeof apiFalsa>[0]) {
  falsaAtual = apiFalsa(respostas)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // o detalhe que o componente recebe é o mesmo que a API devolveria (já com datas convertidas)
  const detalheAtual = JSON.parse(JSON.stringify(corpoDetalhe))
  const { rerender } = render(
    <ThemeProvider>
      <DensityProvider>
        <QueryClientProvider client={qc}>
          <ValidacaoCard detalhe={paraDetalhe(detalheAtual)} />
          <Toaster />
        </QueryClientProvider>
      </DensityProvider>
    </ThemeProvider>,
  )
  return { falsa: falsaAtual, rerender }
}

/** Converte as datas ISO da fixture em `Date`, como o `chamar` faz depois do parse do Zod. */
function paraDetalhe(d: Record<string, unknown>): ChamadoDetalhe {
  const datas = [
    'abertoEm',
    'ultimaAtividadeEm',
    'primeiraRespostaEm',
    'concluidoEm',
    'encerradoEm',
    'validacaoLimiteEm',
    'statusDesde',
  ]
  const copia: Record<string, unknown> = { ...d }
  for (const k of datas) if (typeof copia[k] === 'string') copia[k] = new Date(copia[k] as string)
  return copia as unknown as ChamadoDetalhe
}

describe('ValidacaoCard', () => {
  it('o solicitante avalia só pelo teclado: setas escolhem a nota, o botão libera e o POST sai com a nota', async () => {
    const { falsa } = montarCard(chamadoConcluido(), { 'POST /chamados/5/aprovar': () => json(chamadoEncerrado()) })
    const confirmar = screen.getByRole('button', { name: 'Confirmar solução' })
    expect(confirmar).toBeDisabled()
    const grupo = screen.getByRole('radiogroup', { name: 'Avaliação do atendimento' })
    const radios = within(grupo).getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false'])
    radios[0]?.focus()
    fireEvent.keyDown(radios[0] as HTMLElement, { key: 'ArrowDown' })
    fireEvent.keyDown(radios[1] as HTMLElement, { key: 'ArrowDown' })
    await waitFor(() => expect(within(grupo).getByRole('radio', { name: /Regular/ })).toBeChecked())
    expect(confirmar).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Comentário (opcional)'), { target: { value: '  Resolveram rápido.  ' } })
    fireEvent.click(confirmar)
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/chamados/5/aprovar',
        corpo: { versao: 3, nota: 'REGULAR', comentario: 'Resolveram rápido.' },
      }),
    )
    expect(await screen.findByText('Obrigado pela avaliação. O chamado foi encerrado.')).toBeInTheDocument()
  })

  it('os quatro cartões de nota têm rótulo e o sem comentário não manda o campo', async () => {
    const { falsa } = montarCard(chamadoConcluido(), { 'POST /chamados/5/aprovar': () => json(chamadoEncerrado()) })
    for (const nome of ['Ótimo', 'Bom', 'Regular', 'Ruim'])
      expect(screen.getByRole('radio', { name: new RegExp(nome) })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Ótimo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar solução' }))
    await waitFor(() => expect(falsa.chamadas.some((c) => c.url === '/api/v1/chamados/5/aprovar')).toBe(true))
    expect(falsa.chamadas.find((c) => c.url === '/api/v1/chamados/5/aprovar')?.corpo).toEqual({
      versao: 3,
      nota: 'OTIMO',
    })
  })

  it('"Não resolveu" exige o motivo e depois rejeita com a versão do chamado', async () => {
    const { falsa } = montarCard(chamadoConcluido(), { 'POST /chamados/5/rejeitar': () => json(detalhe()) })
    fireEvent.click(screen.getByRole('button', { name: 'Não resolveu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('Use de 5 a 2.000 caracteres.')).toBeInTheDocument()
    expect(falsa.chamadas.some((c) => c.url.endsWith('/rejeitar'))).toBe(false)
    fireEvent.change(screen.getByLabelText('Conte o que ainda não funciona'), {
      target: { value: 'Continua sem imprimir.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/chamados/5/rejeitar',
        corpo: { versao: 3, motivo: 'Continua sem imprimir.' },
      }),
    )
    expect(await screen.findByText('O chamado voltou para o atendimento.')).toBeInTheDocument()
  })

  it('Voltar retorna à avaliação sem chamar a API', () => {
    const { falsa } = montarCard(chamadoConcluido(), {})
    fireEvent.click(screen.getByRole('button', { name: 'Não resolveu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('radiogroup', { name: 'Avaliação do atendimento' })).toBeInTheDocument()
    expect(falsa.chamadas).toHaveLength(0)
  })

  it('400 com detalhes aparece no campo do comentário', async () => {
    montarCard(chamadoConcluido(), {
      'POST /chamados/5/aprovar': () =>
        json(
          {
            erro: {
              codigo: 'VALIDACAO',
              mensagem: 'Dados inválidos.',
              detalhes: [{ campo: 'comentario', mensagem: 'Comentário inválido.' }],
            },
          },
          400,
        ),
    })
    fireEvent.click(screen.getByRole('radio', { name: /Bom/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar solução' }))
    expect(await screen.findByText('Comentário inválido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Comentário (opcional)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('409 por versão mostra o aviso para recarregar', async () => {
    montarCard(chamadoConcluido(), {
      'POST /chamados/5/aprovar': () => json({ erro: { codigo: 'CONFLITO', mensagem: 'Versão desatualizada.' } }, 409),
    })
    fireEvent.click(screen.getByRole('radio', { name: /Bom/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar solução' }))
    expect(await screen.findByText(/Recarregue/)).toBeInTheDocument()
  })

  it('só mostra os botões das ações permitidas', () => {
    montarCard(chamadoConcluido({ rejeitar: true }), {})
    expect(screen.queryByRole('button', { name: 'Confirmar solução' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Não resolveu' })).toBeInTheDocument()
  })
})

describe('solução e barra de encerrado na conversa', () => {
  const meta: Meta = {
    areas: [],
    prioridades: [],
    status: [],
    problemas: [],
    canais: [],
    departamentos: [],
    unidades: [],
    tiposAtivo: [],
    jornadas: [],
    categorias: [],
    config: Object.fromEntries(CHAVES_CONFIG_PUBLICAS.map((c) => [c, CONFIG_PADRAO[c]])) as Meta['config'],
  }

  function montarRota(corpoDetalhe: Record<string, unknown>, perfil: UsuarioMe['perfil']) {
    const r = renderRota('/chamados/5', {
      sessao: sessaoDe(perfil),
      respostas: {
        'GET /chamados/5': corpoDetalhe,
        'GET /chamados/5/assentamentos': { itens: [], proximoCursor: null },
        'GET /meta': meta,
      },
    })
    falsaAtual = r.falsa
    return r
  }

  it('concluído: o solicitante vê a solução e a validação', async () => {
    montarRota(chamadoConcluido(), 'USUARIO')
    expect(await screen.findByLabelText('Solução do chamado')).toHaveTextContent('Troquei o toner')
    expect(screen.getByLabelText('Validação do atendimento')).toBeInTheDocument()
  })

  it('concluído sem permissão de validar: vê a solução, sem o cartão de validação', async () => {
    montarRota(chamadoConcluido({}), 'OPERADOR')
    expect(await screen.findByLabelText('Solução do chamado')).toBeInTheDocument()
    expect(screen.queryByLabelText('Validação do atendimento')).not.toBeInTheDocument()
  })

  it('encerrado: barra com a data e a avaliação, e o botão Reabrir abre o diálogo', async () => {
    montarRota(chamadoEncerrado({ reabrir: true }), 'USUARIO')
    const barra = (await screen.findByText(/Encerrado em/)).closest<HTMLElement>('[role="status"]') as HTMLElement
    expect(barra).toHaveTextContent('Encerrado em')
    expect(barra).toHaveTextContent('Avaliação: Bom')
    fireEvent.click(within(barra).getByRole('button', { name: 'Reabrir' }))
    expect(await screen.findByText('Reabrir chamado')).toBeInTheDocument()
  })

  it('encerrado sem permissão de reabrir: a barra não tem o botão', async () => {
    montarRota(chamadoEncerrado({}), 'USUARIO')
    const barra = (await screen.findByText(/Encerrado em/)).closest<HTMLElement>('[role="status"]') as HTMLElement
    expect(within(barra).queryByRole('button', { name: 'Reabrir' })).not.toBeInTheDocument()
  })

  it('aberto: nem solução nem validação nem barra', async () => {
    montarRota(detalhe(), 'USUARIO')
    await screen.findByRole('log')
    expect(screen.queryByLabelText('Solução do chamado')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Validação do atendimento')).not.toBeInTheDocument()
  })
})
