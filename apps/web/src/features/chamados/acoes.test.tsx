import { createRootRoute, createRoute, Outlet } from '@tanstack/react-router'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
  CHAVES_CONFIG_PUBLICAS,
  type ChamadoDetalhe,
  ChamadoDetalheSchema,
  CONFIG_PADRAO,
  type SessaoResposta,
  type UsuarioMe,
} from '@vinimon/shared'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AgendarPopover } from '@/features/chamados/components/agendar-popover'
import { AssumirButton } from '@/features/chamados/components/assumir-button'
import { CancelarDialog } from '@/features/chamados/components/cancelar-dialog'
import { ConcluirDialog } from '@/features/chamados/components/concluir-dialog'
import { EncaminharDialog } from '@/features/chamados/components/encaminhar-dialog'
import { ReabrirDialog } from '@/features/chamados/components/reabrir-dialog'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

// Radix (Popper) usa ResizeObserver, que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let restaurar: (() => void) | null = null

afterEach(() => {
  cleanup()
  restaurar?.()
  restaurar = null
})

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

/** Detalhe cru (JSON da API). Os diálogos recebem o tipado, obtido com `ChamadoDetalheSchema`. */
function detalheCru(sobrescrever: Record<string, unknown> = {}) {
  return {
    id: 5,
    assunto: 'Impressora parada',
    novo: false,
    cancelado: false,
    status: EM_ATENDIMENTO,
    prioridade: { id: 2, nome: 'Média', cor: '#2563eb', ordem: 2 },
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
      reabrir: true,
      cancelar: true,
      comentar: true,
      comentarInterno: true,
      anexar: true,
    },
    ...sobrescrever,
  }
}

/** Detalhe tipado, como o diálogo recebe de `useQuery`. */
function detalheTipado(sobrescrever: Record<string, unknown> = {}): ChamadoDetalhe {
  return ChamadoDetalheSchema.parse(detalheCru(sobrescrever))
}

const ANA = { id: 7, nome: 'Ana Souza' }

const META = {
  areas: [
    { id: 1, nome: 'Suporte', atende: true },
    { id: 2, nome: 'Redes', atende: true },
    { id: 3, nome: 'Triagem', atende: false },
  ],
  prioridades: [{ id: 2, nome: 'Média', cor: '#2563eb', ordem: 2, padrao: true }],
  status: [{ ...EM_ATENDIMENTO, ignorado: false }],
  problemas: [],
  canais: [],
  departamentos: [],
  unidades: [],
  tiposAtivo: [],
  jornadas: [],
  categorias: [],
  config: Object.fromEntries(CHAVES_CONFIG_PUBLICAS.map((chave) => [chave, CONFIG_PADRAO[chave]])),
}

function sessaoOperador(): SessaoResposta {
  const usuario: UsuarioMe = {
    id: ANA.id,
    nome: ANA.nome,
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
  return { estado: 'ATIVA', csrf: 'csrf-teste', usuario }
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

/**
 * Monta o componente numa árvore de rotas de teste (`arvore` do renderRota), com os providers reais.
 * Os diálogos são controlados pelo pai; aqui ficam sempre abertos.
 */
function montar(componente: () => ReactNode, respostas: Record<string, unknown>) {
  const raiz = createRootRoute({ component: () => <Outlet /> })
  const rota = createRoute({ getParentRoute: () => raiz, path: '/teste', component: componente })
  const r = renderRota('/teste', {
    sessao: sessaoOperador(),
    respostas: { 'GET /meta': META, ...respostas },
    arvore: raiz.addChildren([rota]),
  })
  restaurar = r.falsa.restaurar
  return r
}

function chamadaPost(falsa: ApiFalsa, url: string) {
  return falsa.chamadas.find((c) => c.metodo === 'POST' && c.url === `/api/v1${url}`)
}

const RESPOSTA_OK = (sobrescrever: Record<string, unknown> = {}) => json(detalheCru(sobrescrever))
const erroDe = (status: number, codigo: string, mensagem: string, detalhes: unknown[] = []) =>
  json({ erro: { codigo, mensagem, detalhes } }, status)

describe('Assumir', () => {
  it('sem outro responsável, envia só a versão', async () => {
    const { falsa } = montar(() => <AssumirButton detalhe={detalheTipado({ operador: null })} usuarioId={ANA.id} />, {
      'POST /chamados/5/assumir': () => RESPOSTA_OK({ operador: ANA, versao: 4 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Assumir' }))
    await waitFor(() => expect(chamadaPost(falsa, '/chamados/5/assumir')).toBeDefined())
    expect(chamadaPost(falsa, '/chamados/5/assumir')?.corpo).toEqual({ versao: 3 })
  })

  it('com outro responsável, pede confirmação e reenvia com confirmarTroca:true', async () => {
    const { falsa } = montar(() => <AssumirButton detalhe={detalheTipado()} usuarioId={ANA.id} />, {
      'POST /chamados/5/assumir': () => RESPOSTA_OK({ operador: ANA, versao: 4 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Assumir' }))
    const confirmacao = await screen.findByRole('alertdialog')
    expect(within(confirmacao).getByText(/Bruno Lima é a responsável atual/)).toBeInTheDocument()
    expect(chamadaPost(falsa, '/chamados/5/assumir')).toBeUndefined()

    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Assumir' }))
    await waitFor(() => expect(chamadaPost(falsa, '/chamados/5/assumir')).toBeDefined())
    expect(chamadaPost(falsa, '/chamados/5/assumir')?.corpo).toEqual({ versao: 3, confirmarTroca: true })
  })
})

describe('Encaminhar', () => {
  it('envia área, versão e a primeira resposta marcada (config ESCOLHA)', async () => {
    const { falsa } = montar(() => <EncaminharDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {
      'POST /chamados/5/encaminhar': () => RESPOSTA_OK({ area: { id: 2, nome: 'Redes' }, versao: 4 }),
    })
    fireEvent.click(await screen.findByRole('combobox', { name: /Área de destino/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Redes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Encaminhar' }))

    await waitFor(() => expect(chamadaPost(falsa, '/chamados/5/encaminhar')).toBeDefined())
    expect(chamadaPost(falsa, '/chamados/5/encaminhar')?.corpo).toEqual({
      versao: 3,
      areaId: 2,
      marcarPrimeiraResposta: true,
    })
  })

  it('400 com detalhes aparece no campo', async () => {
    montar(() => <EncaminharDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {
      'POST /chamados/5/encaminhar': () =>
        erroDe(400, 'VALIDACAO', 'Dados inválidos.', [{ campo: 'areaId', mensagem: 'Área sem equipe.' }]),
    })
    fireEvent.click(await screen.findByRole('combobox', { name: /Área de destino/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Redes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Encaminhar' }))
    expect(await screen.findByText('Área sem equipe.')).toBeInTheDocument()
  })

  it('sem área escolhida, não envia e mostra o erro do campo', async () => {
    const { falsa } = montar(() => <EncaminharDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {})
    fireEvent.click(await screen.findByRole('button', { name: 'Encaminhar' }))
    expect(await screen.findByText('Escolha a área de destino.')).toBeInTheDocument()
    expect(falsa.chamadas.some((c) => c.metodo === 'POST')).toBe(false)
  })
})

describe('Agendar', () => {
  it('envia `para` em ISO e a versão; o padrão fica uma hora à frente', async () => {
    const { falsa } = montar(() => <AgendarPopover detalhe={detalheTipado()} />, {
      'POST /chamados/5/agendar': () => RESPOSTA_OK({ agendadoPara: '2026-10-23T12:00:00.000Z', versao: 4 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Agendar' }))
    const painel = await screen.findByRole('dialog')
    fireEvent.click(within(painel).getByRole('button', { name: 'Agendar' }))

    await waitFor(() => expect(chamadaPost(falsa, '/chamados/5/agendar')).toBeDefined())
    const corpo = chamadaPost(falsa, '/chamados/5/agendar')?.corpo as { versao: number; para: string }
    expect(corpo.versao).toBe(3)
    expect(corpo.para).toMatch(/Z$/)
    const daquiA = new Date(corpo.para).getTime() - Date.now()
    expect(daquiA).toBeGreaterThan(50 * 60_000)
    expect(daquiA).toBeLessThan(80 * 60_000)
  })
})

describe('Concluir', () => {
  it('envia solução e descrição técnica', async () => {
    const { falsa } = montar(() => <ConcluirDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {
      'POST /chamados/5/concluir': () => RESPOSTA_OK({ concluidoEm: '2026-10-23T12:00:00.000Z', versao: 4 }),
    })
    fireEvent.change(await screen.findByLabelText(/Solução aplicada/), { target: { value: 'Troca de toner' } })
    fireEvent.change(await screen.findByLabelText(/Descrição técnica/), { target: { value: 'Toner trocado.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))

    await waitFor(() => expect(chamadaPost(falsa, '/chamados/5/concluir')).toBeDefined())
    expect(chamadaPost(falsa, '/chamados/5/concluir')?.corpo).toEqual({
      versao: 3,
      solucao: 'Troca de toner',
      descricaoTecnica: 'Toner trocado.',
    })
  })

  it('400 com detalhes aparece no campo', async () => {
    montar(() => <ConcluirDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {
      'POST /chamados/5/concluir': () =>
        erroDe(400, 'VALIDACAO', 'Dados inválidos.', [{ campo: 'solucao', mensagem: 'Descreva melhor a solução.' }]),
    })
    fireEvent.change(await screen.findByLabelText(/Solução aplicada/), { target: { value: 'Ok' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(await screen.findByText('Descreva melhor a solução.')).toBeInTheDocument()
  })

  it('403 mostra a mensagem do servidor no toast e mantém o diálogo aberto', async () => {
    montar(() => <ConcluirDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {
      'POST /chamados/5/concluir': () => erroDe(403, 'SEM_PERMISSAO', 'Você não pode concluir este chamado.'),
    })
    fireEvent.change(await screen.findByLabelText(/Solução aplicada/), { target: { value: 'Troca de toner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(await screen.findByText('Você não pode concluir este chamado.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('Reabrir', () => {
  it('envia a justificativa e a versão', async () => {
    const { falsa } = montar(() => <ReabrirDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {
      'POST /chamados/5/reabrir': () => RESPOSTA_OK({ concluidoEm: null, versao: 4 }),
    })
    fireEvent.change(await screen.findByLabelText(/Justificativa/), { target: { value: 'O problema voltou.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }))

    await waitFor(() => expect(chamadaPost(falsa, '/chamados/5/reabrir')).toBeDefined())
    expect(chamadaPost(falsa, '/chamados/5/reabrir')?.corpo).toEqual({
      versao: 3,
      justificativa: 'O problema voltou.',
    })
  })

  it('400 com detalhes aparece no campo', async () => {
    montar(() => <ReabrirDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {
      'POST /chamados/5/reabrir': () =>
        erroDe(400, 'VALIDACAO', 'Dados inválidos.', [
          { campo: 'justificativa', mensagem: 'Prazo de reabertura vencido.' },
        ]),
    })
    fireEvent.change(await screen.findByLabelText(/Justificativa/), { target: { value: 'O problema voltou.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }))
    expect(await screen.findByText('Prazo de reabertura vencido.')).toBeInTheDocument()
  })

  it('404 mostra a mensagem do servidor no toast', async () => {
    montar(() => <ReabrirDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {
      'POST /chamados/5/reabrir': () => erroDe(404, 'NAO_ENCONTRADO', 'Chamado não encontrado.'),
    })
    fireEvent.change(await screen.findByLabelText(/Justificativa/), { target: { value: 'O problema voltou.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }))
    expect(await screen.findByText('Chamado não encontrado.')).toBeInTheDocument()
  })
})

describe('Cancelar', () => {
  it('envia o motivo e a versão', async () => {
    const { falsa } = montar(() => <CancelarDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {
      'POST /chamados/5/cancelar': () => RESPOSTA_OK({ cancelado: true, versao: 4 }),
    })
    fireEvent.change(await screen.findByLabelText(/Motivo do cancelamento/), {
      target: { value: 'Chamado duplicado.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar chamado' }))

    await waitFor(() => expect(chamadaPost(falsa, '/chamados/5/cancelar')).toBeDefined())
    expect(chamadaPost(falsa, '/chamados/5/cancelar')?.corpo).toEqual({ versao: 3, motivo: 'Chamado duplicado.' })
  })

  it('400 com detalhes aparece no campo', async () => {
    montar(() => <CancelarDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {
      'POST /chamados/5/cancelar': () =>
        erroDe(400, 'VALIDACAO', 'Dados inválidos.', [{ campo: 'motivo', mensagem: 'Motivo já registrado.' }]),
    })
    fireEvent.change(await screen.findByLabelText(/Motivo do cancelamento/), {
      target: { value: 'Chamado duplicado.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar chamado' }))
    expect(await screen.findByText('Motivo já registrado.')).toBeInTheDocument()
  })

  it('409 de versão mostra o aviso para recarregar', async () => {
    montar(() => <CancelarDialog detalhe={detalheTipado()} aberto aoMudarAberto={() => {}} />, {
      'POST /chamados/5/cancelar': () =>
        erroDe(409, 'CONFLITO', 'O chamado foi alterado por outra pessoa. Recarregue.'),
    })
    fireEvent.change(await screen.findByLabelText(/Motivo do cancelamento/), {
      target: { value: 'Chamado duplicado.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar chamado' }))
    expect(await screen.findByText(/Recarregue/)).toBeInTheDocument()
  })
})
