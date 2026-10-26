import {
  ACOES_CHAMADO,
  type AcaoChamado,
  CONFIG_PADRAO,
  type Config,
  type Perfil,
  type TipoStatus,
} from '@vinimon/shared'
import { describe, expect, it } from 'vitest'
import type { UsuarioSessao } from '../lib/sessao'
import {
  acoesDoUsuario,
  type ChamadoEscopo,
  type ChamadoParaAcoes,
  escopoChamados,
  podeAtender,
  podeVerChamado,
  podeVerInterno,
} from './chamados'

const usuario = (id: number, perfil: Perfil, areaIds: number[]): UsuarioSessao => ({
  id,
  nome: `U${id}`,
  login: `u${id}`,
  perfil,
  areaId: areaIds[0] ?? null,
  areaIds,
  sessaoId: 's',
  estado: 'ATIVA',
  mfaAtivo: true,
})

// Os 7 atores de T33. O chamado é da área 10, tem o operador 6 como responsável e foi aberto por 1.
const solicitante = usuario(1, 'USUARIO', [])
const outroUsuario = usuario(2, 'USUARIO', [])
const operadorDaArea = usuario(3, 'OPERADOR', [10])
const operadorAreaSecundaria = usuario(4, 'OPERADOR', [20, 10])
const operadorOutraArea = usuario(5, 'OPERADOR', [30])
const operadorResponsavel = usuario(6, 'OPERADOR', [30])
const admin = usuario(7, 'ADMIN', [])
const ATORES = {
  solicitante,
  outroUsuario,
  operadorDaArea,
  operadorAreaSecundaria,
  operadorOutraArea,
  operadorResponsavel,
  admin,
}

const chamado: ChamadoEscopo = { areaId: 10, operadorId: 6, solicitanteId: 1 }

describe('escopo e políticas de chamado (T33, S44, S46, S49)', () => {
  it('podeVerChamado: solicitante, equipe da área (primária ou secundária), responsável e ADMIN; o resto não', () => {
    const esperado = {
      solicitante: true,
      outroUsuario: false,
      operadorDaArea: true,
      operadorAreaSecundaria: true,
      operadorOutraArea: false,
      operadorResponsavel: true,
      admin: true,
    }
    for (const [nome, u] of Object.entries(ATORES))
      expect(podeVerChamado(u, chamado), nome).toBe(esperado[nome as keyof typeof esperado])
  })

  it('podeVerInterno: nunca o solicitante, nem quem não vê o chamado', () => {
    const esperado = {
      solicitante: false,
      outroUsuario: false,
      operadorDaArea: true,
      operadorAreaSecundaria: true,
      operadorOutraArea: false,
      operadorResponsavel: true,
      admin: true,
    }
    for (const [nome, u] of Object.entries(ATORES))
      expect(podeVerInterno(u, chamado), nome).toBe(esperado[nome as keyof typeof esperado])
  })

  it('operador que é o solicitante do próprio chamado não vê o conteúdo interno (F10 da v1)', () => {
    const meu = { areaId: 10, operadorId: null, solicitanteId: operadorDaArea.id }
    expect(podeVerChamado(operadorDaArea, meu)).toBe(true)
    expect(podeVerInterno(operadorDaArea, meu)).toBe(false)
  })

  it('podeAtender: operador da área (também a secundária), responsável atual e ADMIN', () => {
    const esperado = {
      solicitante: false,
      outroUsuario: false,
      operadorDaArea: true,
      operadorAreaSecundaria: true,
      operadorOutraArea: false,
      operadorResponsavel: true,
      admin: true,
    }
    for (const [nome, u] of Object.entries(ATORES))
      expect(podeAtender(u, chamado), nome).toBe(esperado[nome as keyof typeof esperado])
  })

  it('escopoChamados: ADMIN sem filtro; operador com OR de área, responsável e solicitante; USUARIO só o próprio', () => {
    expect(escopoChamados(admin)).toEqual({})
    expect(escopoChamados(operadorAreaSecundaria)).toEqual({
      OR: [{ areaId: { in: [20, 10] } }, { operadorId: 4 }, { solicitanteId: 4 }],
    })
    expect(escopoChamados(solicitante)).toEqual({ solicitanteId: 1 })
    expect(escopoChamados(outroUsuario)).toEqual({ solicitanteId: 2 })
  })

  it('o escopo nunca depende de dados do chamado alheio: operador sem áreas só enxerga o que é dele', () => {
    const semArea = usuario(8, 'OPERADOR', [])
    expect(escopoChamados(semArea)).toEqual({ OR: [{ areaId: { in: [] } }, { operadorId: 8 }, { solicitanteId: 8 }] })
    expect(podeVerChamado(semArea, chamado)).toBe(false)
  })
})

describe('acoesDoUsuario (§3.5, camada 3)', () => {
  const agora = new Date('2026-10-22T12:00:00Z')
  const base = (statusTipo: TipoStatus, extra: Partial<ChamadoParaAcoes> = {}): ChamadoParaAcoes => ({
    ...chamado,
    statusTipo,
    papel: null,
    cancelado: false,
    encerradoEm: null,
    ...extra,
  })
  const ligadas = (u: UsuarioSessao, c: ChamadoParaAcoes, cfg: Config = CONFIG_PADRAO): AcaoChamado[] =>
    ACOES_CHAMADO.filter((a) => acoesDoUsuario(u, c, cfg, agora)[a])

  const EM_CURSO: AcaoChamado[] = [
    'assumir',
    'encaminhar',
    'status',
    'prioridade',
    'classificar',
    'tags',
    'agendar',
    'concluir',
    'cancelar',
    'comentar',
    'comentarInterno',
    'anexar',
  ]

  it('quem atende, por tipo de status (uma linha por tipo)', () => {
    expect(ligadas(operadorDaArea, base('ABERTO'))).toEqual(EM_CURSO)
    expect(ligadas(operadorDaArea, base('EM_ATENDIMENTO'))).toEqual(EM_CURSO)
    expect(ligadas(operadorDaArea, base('PENDENTE'))).toEqual(EM_CURSO)
    expect(ligadas(operadorDaArea, base('AGENDADO'))).toEqual([
      'prioridade',
      'classificar',
      'tags',
      'agendar',
      'concluir',
      'cancelar',
      'comentar',
      'comentarInterno',
      'anexar',
    ])
    expect(ligadas(operadorDaArea, base('CONCLUIDO'))).toEqual([
      'classificar',
      'tags',
      'comentar',
      'comentarInterno',
      'anexar',
    ])
    expect(ligadas(operadorDaArea, base('ENCERRADO', { encerradoEm: agora }))).toEqual(['tags'])
  })

  it('o solicitante USUARIO comenta e anexa em curso, avalia em CONCLUIDO e reabre em ENCERRADO', () => {
    for (const tipo of ['ABERTO', 'EM_ATENDIMENTO', 'PENDENTE', 'AGENDADO'] as const) {
      expect(ligadas(solicitante, base(tipo)), tipo).toEqual(['comentar', 'anexar'])
    }
    expect(ligadas(solicitante, base('CONCLUIDO'))).toEqual(['aprovar', 'rejeitar'])
    expect(ligadas(solicitante, base('ENCERRADO', { encerradoEm: agora }))).toEqual(['reabrir'])
  })

  it('o solicitante só cancela em ABERTO e sem operador', () => {
    expect(ligadas(solicitante, base('ABERTO', { operadorId: null }))).toContain('cancelar')
    expect(ligadas(solicitante, base('ABERTO'))).not.toContain('cancelar')
    expect(ligadas(solicitante, base('PENDENTE', { operadorId: null }))).not.toContain('cancelar')
  })

  it('quem não vê o chamado não tem ação nenhuma', () => {
    for (const tipo of ['ABERTO', 'EM_ATENDIMENTO', 'PENDENTE', 'AGENDADO', 'CONCLUIDO', 'ENCERRADO'] as const) {
      expect(ligadas(outroUsuario, base(tipo)), tipo).toEqual([])
      expect(ligadas(operadorOutraArea, base(tipo)), tipo).toEqual([])
    }
  })

  it('aprovar e rejeitar são só do solicitante, mesmo para ADMIN e operador responsável', () => {
    for (const u of [operadorDaArea, operadorResponsavel, admin]) {
      const a = acoesDoUsuario(u, base('CONCLUIDO'), CONFIG_PADRAO, agora)
      expect(a.aprovar, `${u.id}`).toBe(false)
      expect(a.rejeitar, `${u.id}`).toBe(false)
    }
  })

  it('o solicitante nunca vê comentário interno, mesmo sendo OPERADOR do próprio chamado', () => {
    const meu = base('EM_ATENDIMENTO', { solicitanteId: operadorDaArea.id, operadorId: null })
    const a = acoesDoUsuario(operadorDaArea, meu, CONFIG_PADRAO, agora)
    expect(a.comentar).toBe(true)
    expect(a.comentarInterno).toBe(false)
  })

  it('o solicitante não comenta depois de CONCLUIDO; a equipe comenta até antes de ENCERRADO', () => {
    expect(acoesDoUsuario(solicitante, base('CONCLUIDO'), CONFIG_PADRAO, agora).comentar).toBe(false)
    expect(acoesDoUsuario(operadorDaArea, base('CONCLUIDO'), CONFIG_PADRAO, agora).comentar).toBe(true)
    expect(
      acoesDoUsuario(operadorDaArea, base('ENCERRADO', { encerradoEm: agora }), CONFIG_PADRAO, agora).comentar,
    ).toBe(false)
  })

  it('anexar exige `anexos.habilitados`', () => {
    const cfg = { ...CONFIG_PADRAO, 'anexos.habilitados': false }
    expect(acoesDoUsuario(operadorDaArea, base('ABERTO'), cfg, agora).anexar).toBe(false)
    expect(acoesDoUsuario(operadorDaArea, base('ABERTO'), cfg, agora).comentar).toBe(true)
  })

  describe('reabrir', () => {
    const encerrado = (extra: Partial<ChamadoParaAcoes> = {}) =>
      base('ENCERRADO', { encerradoEm: new Date('2026-10-18T12:00:00Z'), ...extra }) // 4 dias antes de `agora`
    const reabre = (u: UsuarioSessao, c: ChamadoParaAcoes, cfg: Config = CONFIG_PADRAO) =>
      acoesDoUsuario(u, c, cfg, agora).reabrir

    it('solicitante, último operador e ADMIN podem; outro operador da área não', () => {
      expect(reabre(solicitante, encerrado())).toBe(true)
      expect(reabre(operadorResponsavel, encerrado())).toBe(true)
      expect(reabre(admin, encerrado())).toBe(true)
      expect(reabre(operadorDaArea, encerrado())).toBe(false)
      expect(reabre(outroUsuario, encerrado())).toBe(false)
    })

    it('exige `permitirReabertura`', () => {
      expect(reabre(solicitante, encerrado(), { ...CONFIG_PADRAO, 'chamado.permitirReabertura': false })).toBe(false)
    })

    it('respeita `prazoReaberturaDias` (0 = sem limite)', () => {
      expect(reabre(solicitante, encerrado(), { ...CONFIG_PADRAO, 'chamado.prazoReaberturaDias': 5 })).toBe(true)
      expect(reabre(solicitante, encerrado(), { ...CONFIG_PADRAO, 'chamado.prazoReaberturaDias': 4 })).toBe(true) // exatamente no limite
      expect(reabre(solicitante, encerrado(), { ...CONFIG_PADRAO, 'chamado.prazoReaberturaDias': 3 })).toBe(false)
      expect(
        reabre(solicitante, encerrado({ encerradoEm: null }), { ...CONFIG_PADRAO, 'chamado.prazoReaberturaDias': 3 }),
      ).toBe(false)
      expect(
        reabre(solicitante, encerrado({ encerradoEm: new Date('2020-01-01T00:00:00Z') }), {
          ...CONFIG_PADRAO,
          'chamado.prazoReaberturaDias': 0,
        }),
      ).toBe(true)
    })

    it('chamado cancelado nunca reabre, e só ENCERRADO reabre', () => {
      expect(reabre(solicitante, encerrado({ cancelado: true }))).toBe(false)
      expect(reabre(solicitante, base('CONCLUIDO'))).toBe(false)
      expect(reabre(solicitante, base('EM_ATENDIMENTO'))).toBe(false)
    })
  })
})

describe('chamado.isolarAreas desligado (T-13.2)', () => {
  const semIsolamento: UsuarioSessao = { ...operadorOutraArea, verTodasAreas: true }

  it('o operador vê chamado de qualquer área, inclusive o interno, e o escopo Prisma fica sem filtro', () => {
    expect(podeVerChamado(semIsolamento, chamado)).toBe(true)
    expect(podeVerInterno(semIsolamento, chamado)).toBe(true)
    expect(escopoChamados(semIsolamento)).toEqual({})
  })

  it('podeAtender não muda: só as áreas do operador ou o chamado de que é responsável', () => {
    expect(podeAtender(semIsolamento, chamado)).toBe(false)
    expect(podeAtender(semIsolamento, { ...chamado, areaId: 30 })).toBe(true)
  })

  it('verTodasAreas não vale para USUARIO (só OPERADOR, por permissão)', () => {
    const u: UsuarioSessao = { ...outroUsuario, verTodasAreas: true }
    expect(podeVerChamado(u, chamado)).toBe(false)
    expect(escopoChamados(u)).toEqual({ solicitanteId: u.id })
  })
})
