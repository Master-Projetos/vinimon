import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { CONFIG_PADRAO, type Meta, type Relatorio, type SessaoResposta, type UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

// Radix (Popper) e o Recharts usam ResizeObserver, que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

function sessaoDe(perfil: UsuarioMe['perfil']): SessaoResposta {
  const usuario: UsuarioMe = {
    id: 7,
    nome: 'Ana Souza',
    login: 'ana',
    email: null,
    telefone: null,
    perfil,
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

const meta: Meta = {
  areas: [{ id: 1, nome: 'Financeiro', atende: true }],
  prioridades: [],
  status: [],
  problemas: [],
  canais: [],
  departamentos: [],
  unidades: [],
  tiposAtivo: [],
  jornadas: [],
  categorias: [],
  config: Object.fromEntries(Object.entries(CONFIG_PADRAO)) as Meta['config'],
}

const visaoGeral: Relatorio = {
  tipo: 'visao-geral',
  de: '2026-01-01',
  ate: '2026-01-31',
  totais: { total: 12, encerrados: 9, pctNoPrazo: 75, tempoMedioSolucaoUtilMin: 150 },
  linhas: [
    { chave: '1', nome: 'Financeiro', total: 8, encerrados: 6, pctNoPrazo: 50, tempoMedioSolucaoUtilMin: 90 },
    { chave: '2', nome: 'Suporte', total: 4, encerrados: 3, pctNoPrazo: null, tempoMedioSolucaoUtilMin: null },
  ],
}

const relatorioSla: Relatorio = {
  tipo: 'sla',
  de: '2026-01-01',
  ate: '2026-01-31',
  totais: { total: 4, encerrados: 2, pctNoPrazo: 50, tempoMedioSolucaoUtilMin: 60 },
  linhas: [{ chave: '1', nome: 'Hardware', total: 4, encerrados: 2, pctNoPrazo: 50, tempoMedioSolucaoUtilMin: 60 }],
  sla: {
    porArea: [
      {
        chave: '1',
        nome: 'Financeiro',
        total: 4,
        comMetaResposta: 4,
        pctRespostaNoPrazo: 100,
        comMetaSolucao: 2,
        pctSolucaoNoPrazo: 50,
      },
    ],
    porProblema: [],
  },
}

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(
  caminho: string,
  respostas: Parameters<typeof renderRota>[1]['respostas'],
  perfil: UsuarioMe['perfil'] = 'OPERADOR',
) {
  const r = renderRota(caminho, { sessao: sessaoDe(perfil), respostas })
  falsaAtual = r.falsa
  return r
}

const respostasPadrao = {
  'GET /meta': meta,
  'GET /relatorios/visao-geral': visaoGeral,
  'GET /relatorios/sla': relatorioSla,
}

describe('relatórios', () => {
  it('/relatorios redireciona para /relatorios/visao-geral', async () => {
    const r = montar('/relatorios', respostasPadrao)
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/relatorios/visao-geral'))
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
  })

  it('mostra os indicadores, o período e a tabela com os dados', async () => {
    montar('/relatorios/visao-geral', respostasPadrao)
    expect(await screen.findByText('Período: 01/01/2026 a 31/01/2026')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    const tabela = screen.getByRole('table', { name: 'Dados do relatório' })
    expect(within(tabela).getByText('Financeiro')).toBeInTheDocument()
    expect(within(tabela).getByText('50,0%')).toBeInTheDocument()
    expect(within(tabela).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('ordena a tabela no cliente ao clicar no cabeçalho', async () => {
    montar('/relatorios/visao-geral', respostasPadrao)
    const tabela = await screen.findByRole('table', { name: 'Dados do relatório' })
    const cabecalho = within(tabela).getByRole('columnheader', { name: 'Total' })
    expect(cabecalho).toHaveAttribute('aria-sort', 'none')

    fireEvent.click(within(cabecalho).getByRole('button', { name: 'Total' }))
    expect(cabecalho).toHaveAttribute('aria-sort', 'ascending')
    expect(within(tabela).getAllByRole('row')[1]).toHaveTextContent('Suporte')

    fireEvent.click(within(cabecalho).getByRole('button', { name: 'Total' }))
    expect(cabecalho).toHaveAttribute('aria-sort', 'descending')
    expect(within(tabela).getAllByRole('row')[1]).toHaveTextContent('Financeiro')
  })

  it('o link do CSV e a consulta usam os filtros da URL', async () => {
    const r = montar('/relatorios/visao-geral?de=2026-01-01&ate=2026-01-31&areaId=1', respostasPadrao)
    const link = await screen.findByRole('link', { name: /Exportar CSV/ })
    expect(link).toHaveAttribute('href', '/api/v1/relatorios/visao-geral/csv?de=2026-01-01&ate=2026-01-31&areaId=1')
    expect(
      r.falsa.chamadas.some((c) => c.url === '/api/v1/relatorios/visao-geral?de=2026-01-01&ate=2026-01-31&areaId=1'),
    ).toBe(true)
  })

  it('tipo desconhecido mostra Relatório não encontrado', async () => {
    montar('/relatorios/inexistente', respostasPadrao)
    expect(await screen.findByText('Relatório não encontrado')).toBeInTheDocument()
  })

  it('403 da API mostra ErrorState no lugar do relatório', async () => {
    montar('/relatorios/visao-geral', {
      'GET /meta': meta,
      'GET /relatorios/visao-geral': () =>
        new Response(JSON.stringify({ erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Sem acesso.' } }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem acesso a este conteúdo')
  })

  it('USUARIO sem relatorio.ver vai para /sem-permissao', async () => {
    const r = montar('/relatorios/visao-geral', respostasPadrao, 'USUARIO')
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/sem-permissao'))
  })

  it('intervalo de datas invertido mostra erro e não muda a URL', async () => {
    const r = montar('/relatorios/visao-geral', respostasPadrao)
    await screen.findByRole('table', { name: 'Dados do relatório' })
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-02-10' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-02-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A data final precisa ser depois da inicial.')
    expect(r.router.state.location.search).toEqual({})
  })

  it('o tipo sla mostra as tabelas de SLA por área', async () => {
    montar('/relatorios/sla', respostasPadrao)
    expect(await screen.findByRole('table', { name: 'SLA por área' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'SLA por problema' })).toBeNull()
    expect(screen.getByText('Nenhum dado no período.')).toBeInTheDocument()
  })

  it('a área de impressão contém o relatório e os controles de tela ficam marcados como ocultáveis', async () => {
    montar('/relatorios/visao-geral', respostasPadrao)
    const titulo = await screen.findByRole('heading', { name: 'Visão geral' })
    const areaImpressao = titulo.closest('.relatorio-impressao')
    expect(areaImpressao).not.toBeNull()
    expect(screen.getByRole('button', { name: /Imprimir/ }).closest('[data-print="ocultar"]')).not.toBeNull()
    expect(screen.getByRole('form', { name: 'Filtros do relatório' })).toHaveAttribute('data-print', 'ocultar')
    const regra = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n')
    expect(regra).toContain('@media print')
    expect(regra).toContain('visibility: hidden')
  })
})
