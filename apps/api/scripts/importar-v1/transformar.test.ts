import { rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { criarFixture } from './fixture'
import { type LeituraV1, lerV1 } from './ler'
import { type ContextoTransformacao, MARCADOR_TRUNCADO, SOLUCAO_AUSENTE, transformar, uuidLegado } from './transformar'
import { validar } from './validar'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const AGORA = new Date('2025-03-01T00:00:00.000Z')
const ctx: ContextoTransformacao = {
  canalWebId: 7,
  jornada24x7Id: 9,
  unidadePrincipalId: 5,
  agora: AGORA,
}

function leitura(): LeituraV1 {
  const caminho = criarFixture()
  dirs.push(dirname(caminho))
  return lerV1(caminho)
}
function rodar(L: LeituraV1, c: ContextoTransformacao = ctx) {
  const v = validar(L)
  expect(v.erros).toEqual([])
  return transformar(L, v.norm, c)
}
const d = (iso: string) => new Date(iso)

describe('transformar (fixture válida)', () => {
  it('areas, departamentos, prioridades, status e problemas', () => {
    const { lotes } = rodar(leitura())
    expect(lotes.areas).toEqual([
      { id: 1, nome: 'Tecnologia da Informação', atende: true, ativo: true },
      { id: 2, nome: 'Recursos Humanos', atende: false, ativo: true },
    ])
    expect(lotes.departamentos).toEqual([{ id: 1, unidadeId: 5, nome: 'Matriz', ativo: true }])
    // A de menor ordem acima de 1 vira padrão.
    expect(lotes.prioridades).toEqual([
      { id: 1, nome: 'Baixa', cor: '#2e8b57', ordem: 1, padrao: false, ativo: true },
      { id: 2, nome: 'Alta', cor: '#e67300', ordem: 3, padrao: true, ativo: true },
    ])
    expect(lotes.status).toEqual([
      {
        id: 1,
        nome: 'Aguardando atendimento',
        tipo: 'ABERTO',
        papel: 'INICIAL',
        cor: '#1565c0',
        pausaSla: false,
        ordem: 1,
        ativo: true,
      },
      {
        id: 2,
        nome: 'Em atendimento',
        tipo: 'EM_ATENDIMENTO',
        papel: 'EM_ATENDIMENTO',
        cor: '#6a1b9a',
        pausaSla: false,
        ordem: 2,
        ativo: true,
      },
      {
        id: 3,
        nome: 'Pendente',
        tipo: 'PENDENTE',
        papel: 'AGUARDANDO_SOLICITANTE',
        cor: '#d9a400',
        pausaSla: true,
        ordem: 3,
        ativo: true,
      },
      {
        id: 4,
        nome: 'Encerrado',
        tipo: 'ENCERRADO',
        papel: 'ENCERRADO',
        cor: '#546e7a',
        pausaSla: true,
        ordem: 4,
        ativo: true,
      },
    ])
    expect(lotes.problemas).toEqual([
      { id: 1, nome: 'Impressora', areaPadraoId: 1, slaRespostaMin: 240, slaSolucaoMin: 1440, ativo: true },
    ])
    expect(lotes.problemasArea).toEqual([{ problemaId: 1, areaId: 1 }])
  })

  it('usuários: admin123 e operador123 saem com hash null e aparecem no relatório (T10)', () => {
    const L = leitura()
    const r = rodar(L)
    expect(r.loginsSenhaAnulada).toEqual(['admin', 'operador'])
    const maria = L.usuarios.find((u) => u.login === 'maria')
    expect(r.lotes.usuarios).toEqual([
      {
        id: 1,
        login: 'admin',
        nome: 'Administrador',
        email: 'admin@exemplo.com',
        telefone: null,
        senhaHash: null,
        deveTrocarSenha: true,
        perfil: 'ADMIN',
        areaId: 1,
        ativo: true,
        criadoEm: d('2025-01-01T10:00:00.000Z'),
      },
      {
        id: 2,
        login: 'operador',
        nome: 'Operador de TI',
        email: 'operador@exemplo.com',
        telefone: null,
        senhaHash: null,
        deveTrocarSenha: true,
        perfil: 'OPERADOR',
        areaId: 1,
        ativo: true,
        criadoEm: d('2025-01-01T10:00:00.000Z'),
      },
      {
        id: 3,
        login: 'maria',
        nome: 'Maria Souza',
        email: 'maria@exemplo.com',
        telefone: null,
        senhaHash: maria?.senha_hash ?? 'ausente',
        deveTrocarSenha: false,
        perfil: 'USUARIO',
        areaId: 2,
        ativo: true,
        criadoEm: d('2025-01-02T10:00:00.000Z'),
      },
    ])
    expect(maria?.senha_hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/)
  })

  it('--exigir-troca-todos marca todos para trocar a senha', () => {
    const { lotes } = rodar(leitura(), { ...ctx, exigirTrocaTodos: true })
    expect(lotes.usuarios.map((u) => u.deveTrocarSenha)).toEqual([true, true, true])
  })

  it('chamado encerrado: campos campo a campo, incluindo SLA', () => {
    const { lotes } = rodar(leitura())
    expect(lotes.chamados[0]).toEqual({
      id: 1,
      assunto: 'Impressora parada',
      descricao: 'Não imprime',
      solucao: 'Trocado o toner',
      contato: null,
      telefone: null,
      solicitanteId: 3,
      abertoPorId: 3,
      operadorId: 2,
      areaId: 1,
      problemaId: 1,
      prioridadeId: 2,
      canalId: 7,
      statusId: 4,
      statusTipo: 'ENCERRADO',
      statusDesde: d('2025-02-01T12:00:00.000Z'),
      departamentoId: 1,
      ativoId: null,
      abertoEm: d('2025-02-01T09:00:00.000Z'),
      agendadoPara: null,
      primeiraRespostaEm: d('2025-02-01T09:30:00.000Z'),
      concluidoEm: d('2025-02-01T12:00:00.000Z'),
      encerradoEm: d('2025-02-01T12:00:00.000Z'),
      jornadaId: 9,
      slaRespostaMin: 240,
      slaSolucaoMin: 1440,
      prazoRespostaEm: d('2025-02-01T13:00:00.000Z'),
      alertaRespostaEm: d('2025-02-01T12:12:00.000Z'),
      prazoSolucaoEm: d('2025-02-02T09:00:00.000Z'),
      alertaSolucaoEm: d('2025-02-02T04:12:00.000Z'),
      slaPausado: false,
      slaPausadoSeg: 0,
      slaRespostaCumprido: true,
      slaSolucaoCumprido: true,
      tempoRespostaUtilMin: 30,
      tempoSolucaoUtilMin: 180,
      slaAvisoRiscoEm: null,
      slaAvisoEstouroEm: null,
      slaAvisoRespostaEm: null,
      ultimoAssentamentoId: 3,
      ultimoAssentamentoPublicoId: 2,
      ultimaInteracaoEm: d('2025-02-01T09:30:00.000Z'),
      ultimaInteracaoAutorId: 2,
      ultimaAtividadeEm: d('2025-02-01T09:30:00.000Z'),
    })
  })

  it('chamado em aberto com prazos vencidos: avisos de SLA = agora', () => {
    const { lotes } = rodar(leitura())
    const c = lotes.chamados[1]
    expect(c).toMatchObject({
      id: 2,
      solucao: null,
      abertoPorId: 3,
      statusId: 1,
      statusTipo: 'ABERTO',
      statusDesde: d('2025-02-03T09:00:00.000Z'),
      concluidoEm: null,
      encerradoEm: null,
      prazoRespostaEm: d('2025-02-03T13:00:00.000Z'),
      prazoSolucaoEm: d('2025-02-04T09:00:00.000Z'),
      slaPausado: false,
      slaSolucaoCumprido: null,
      slaAvisoRiscoEm: AGORA,
      slaAvisoEstouroEm: AGORA,
      slaAvisoRespostaEm: AGORA,
      ultimoAssentamentoId: null,
      ultimaInteracaoEm: null,
      ultimaAtividadeEm: d('2025-02-03T09:00:00.000Z'),
    })
  })

  it('chamado em aberto dentro do prazo não recebe avisos', () => {
    const { lotes } = rodar(leitura(), { ...ctx, agora: d('2025-02-03T09:10:00.000Z') })
    expect(lotes.chamados[1]).toMatchObject({
      slaAvisoRiscoEm: null,
      slaAvisoEstouroEm: null,
      slaAvisoRespostaEm: null,
    })
  })

  it('assentamentos: sistema, comentário e privado (interno)', () => {
    const { lotes } = rodar(leitura())
    expect(lotes.assentamentos).toEqual([
      {
        id: 1,
        chamadoId: 1,
        autorId: 3,
        tipo: 'SISTEMA',
        interno: false,
        texto: 'Chamado aberto por Maria Souza',
        criadoEm: d('2025-02-01T09:00:00.000Z'),
      },
      {
        id: 2,
        chamadoId: 1,
        autorId: 2,
        tipo: 'COMENTARIO',
        interno: false,
        texto: 'Verificando',
        criadoEm: d('2025-02-01T09:30:00.000Z'),
      },
      {
        id: 3,
        chamadoId: 1,
        autorId: 2,
        tipo: 'COMENTARIO',
        interno: true,
        texto: 'Nota interna',
        criadoEm: d('2025-02-01T10:00:00.000Z'),
      },
    ])
  })

  it('seguidores e leituras derivados', () => {
    const { lotes } = rodar(leitura())
    expect(lotes.chamadosSeguidores).toEqual([
      { chamadoId: 1, usuarioId: 3, motivo: 'SOLICITANTE', criadoEm: d('2025-02-01T09:00:00.000Z') },
      { chamadoId: 1, usuarioId: 2, motivo: 'ATRIBUIDO', criadoEm: d('2025-02-01T09:00:00.000Z') },
      { chamadoId: 2, usuarioId: 3, motivo: 'SOLICITANTE', criadoEm: d('2025-02-03T09:00:00.000Z') },
    ])
    expect(lotes.chamadosLeituras).toEqual([
      { chamadoId: 1, usuarioId: 3, ultimoAssentamentoLidoId: 3, lidoEm: AGORA },
      { chamadoId: 1, usuarioId: 2, ultimoAssentamentoLidoId: 3, lidoEm: AGORA },
    ])
  })

  it('anexo com id determinístico e chave AAAA/MM/<uuidLegado>', () => {
    const { lotes } = rodar(leitura())
    const id = uuidLegado(1)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(uuidLegado(1)).toBe(id)
    expect(uuidLegado(2)).not.toBe(id)
    expect(lotes.anexos).toEqual([
      {
        id,
        chamadoId: 1,
        assentamentoId: null,
        enviadoPorId: 3,
        nomeOriginal: 'foto.png',
        mime: 'image/png',
        tamanho: 26,
        storageChave: `2025/02/${id}`,
        interno: false,
        criadoEm: d('2025-02-01T09:05:00.000Z'),
      },
    ])
  })

  it('equipamentos, faq e config', () => {
    const { lotes } = rodar(leitura())
    expect(lotes.tiposAtivo).toEqual([{ id: 1, nome: 'Desktop' }])
    expect(lotes.ativos).toEqual([
      {
        id: 1,
        etiqueta: 'PAT-0001',
        tipoId: 1,
        modelo: 'Dell',
        serie: 'SN1',
        departamentoId: 1,
        responsavelId: 3,
        responsavelTexto: null,
        situacao: 'EM_USO',
        observacao: null,
      },
    ])
    expect(lotes.categoriasArtigo).toEqual([{ id: 1, nome: 'Geral' }])
    expect(lotes.artigos).toEqual([
      {
        id: 1,
        titulo: 'Impressora não imprime',
        conteudo: 'Verifique o toner.',
        categoriaId: 1,
        situacao: 'PUBLICADO',
        visibilidade: 'PUBLICO',
        publicadoEm: AGORA,
      },
    ])
    expect(lotes.artigosProblema).toEqual([{ artigoId: 1, problemaId: 1 }])
    expect(lotes.config).toEqual([
      { chave: 'sistema.nome', valor: 'Vinimon' },
      { chave: 'anexos.habilitados', valor: true },
      { chave: 'sessao.horasAbsoluta', valor: 8 },
    ])
  })
})

describe('transformar (casos de borda)', () => {
  it('chamado pendente: pausa em curso, relógio parado e statusDesde do último assentamento de sistema', () => {
    const L = leitura()
    const c = L.chamados[1]
    if (!c) throw new Error('fixture sem chamado 2')
    c.status_id = 3
    L.assentamentos.push({
      id: 10,
      chamado_id: 2,
      usuario_id: 2,
      tipo: 'sistema',
      texto: 'Status alterado',
      criado_em: '2025-02-03T10:00:00.000Z',
    })
    const { lotes } = rodar(L)
    expect(lotes.chamados[1]).toMatchObject({
      statusTipo: 'PENDENTE',
      statusDesde: d('2025-02-03T10:00:00.000Z'),
      slaPausado: true,
      prazoSolucaoEm: null,
      alertaSolucaoEm: null,
      slaAvisoEstouroEm: null,
      slaAvisoRiscoEm: null,
      slaAvisoRespostaEm: AGORA,
      abertoPorId: 3,
    })
  })

  it('status "Agendado" recebe o papel AGENDADO e libera agendadoPara; o INICIAL fica com o outro aberto', () => {
    const L = leitura()
    L.status.push({ id: 5, nome: 'Agendado', cor: '#123456', tipo: 'aberto' })
    const c = L.chamados[1]
    if (!c) throw new Error('fixture sem chamado 2')
    c.status_id = 5
    c.data_agendamento = '2025-03-10T10:00:00.000Z'
    const { lotes } = rodar(L)
    const ag = lotes.status.find((s) => s.id === 5)
    expect(ag).toMatchObject({ tipo: 'AGENDADO', papel: 'AGENDADO', pausaSla: false })
    expect(lotes.status.find((s) => s.id === 1)?.papel).toBe('INICIAL')
    expect(lotes.chamados[1]).toMatchObject({ statusTipo: 'AGENDADO', agendadoPara: d('2025-03-10T10:00:00.000Z') })
  })

  it('papéis já ocupados no destino não são atribuídos de novo', () => {
    const { lotes } = rodar(leitura(), { ...ctx, statusPapel: new Set(['INICIAL']) })
    expect(lotes.status.find((s) => s.id === 1)?.papel).toBeNull()
  })

  it('solução vazia em encerrado vira o texto padrão; sem data_fechamento usa o último assentamento', () => {
    const L = leitura()
    const c = L.chamados[0]
    if (!c) throw new Error('fixture sem chamado 1')
    c.solucao = '  '
    c.data_fechamento = null
    const { lotes } = rodar(L)
    expect(lotes.chamados[0]).toMatchObject({
      solucao: SOLUCAO_AUSENTE,
      concluidoEm: d('2025-02-01T10:00:00.000Z'),
      encerradoEm: d('2025-02-01T10:00:00.000Z'),
      statusDesde: d('2025-02-01T10:00:00.000Z'),
    })
  })

  it('abertoPorId vem do primeiro assentamento "Chamado aberto" de sistema', () => {
    const L = leitura()
    const a = L.assentamentos[0]
    if (!a) throw new Error('fixture sem assentamento')
    a.usuario_id = 2
    const { lotes } = rodar(L)
    expect(lotes.chamados[0]?.abertoPorId).toBe(2)
    expect(lotes.chamados[0]?.solicitanteId).toBe(3)
  })

  it('texto acima de 10.000 caracteres é truncado com o marcador', () => {
    const L = leitura()
    const a = L.assentamentos[1]
    if (!a) throw new Error('fixture sem assentamento')
    a.texto = 'x'.repeat(10_500)
    const t = rodar(L).lotes.assentamentos[1]?.texto ?? ''
    expect(t).toHaveLength(10_000)
    expect(t.endsWith(MARCADOR_TRUNCADO)).toBe(true)
  })

  it('problema com 0 hora vira null e não gera meta; prioridade sem ordem > 1 não tem padrão', () => {
    const L = leitura()
    const p = L.problemas[0]
    if (!p) throw new Error('fixture sem problema')
    p.sla_resposta_h = 0
    p.sla_solucao_h = 0
    for (const pr of L.prioridades) pr.ordem = 1
    const { lotes } = rodar(L)
    expect(lotes.problemas[0]).toMatchObject({ slaRespostaMin: null, slaSolucaoMin: null })
    expect(lotes.chamados[1]).toMatchObject({
      slaRespostaMin: null,
      prazoRespostaEm: null,
      prazoSolucaoEm: null,
      slaAvisoEstouroEm: null,
      slaAvisoRespostaEm: null,
    })
    expect(lotes.prioridades.some((x) => x.padrao)).toBe(false)
  })

  it('equipamento: tipo nulo vira "Outros"; responsável ambíguo ou desconhecido vira texto; situações mapeadas', () => {
    const L = leitura()
    L.equipamentos.push(
      {
        id: 2,
        etiqueta: 'PAT-0002',
        tipo: null,
        modelo: null,
        serie: null,
        local_id: null,
        responsavel: 'Fulano',
        situacao: 'Em manutenção',
        observacao: null,
      },
      {
        id: 3,
        etiqueta: 'PAT-0003',
        tipo: 'Desktop',
        modelo: null,
        serie: null,
        local_id: null,
        responsavel: 'maria  souza',
        situacao: 'Baixado',
        observacao: null,
      },
    )
    L.usuarios.push({
      id: 6,
      login: 'maria2',
      nome: 'MARIA SOUZA',
      email: null,
      telefone: null,
      senha_hash: 'x:y',
      nivel: 3,
      area_id: null,
      ativo: 1,
      criado_em: '2025-01-05T10:00:00.000Z',
    })
    const { lotes } = rodar(L)
    expect(lotes.tiposAtivo).toEqual([
      { id: 1, nome: 'Desktop' },
      { id: 2, nome: 'Outros' },
    ])
    expect(lotes.ativos[0]).toMatchObject({ responsavelId: null, responsavelTexto: 'Maria Souza' })
    expect(lotes.ativos[1]).toMatchObject({
      tipoId: 2,
      situacao: 'EM_MANUTENCAO',
      responsavelId: null,
      responsavelTexto: 'Fulano',
    })
    expect(lotes.ativos[2]).toMatchObject({
      tipoId: 1,
      situacao: 'BAIXADO',
      responsavelId: null,
      responsavelTexto: 'maria  souza',
    })
  })

  it('operador sem área recebe a primeira área que atende', () => {
    const L = leitura()
    const u = L.usuarios[1]
    if (!u) throw new Error('fixture sem operador')
    u.area_id = null
    expect(rodar(L).lotes.usuarios[1]?.areaId).toBe(1)
  })

  it('sessao_horas é limitado a 1–72 e permitir_anexos diferente de 1 desliga', () => {
    const L = leitura()
    L.config = [
      { chave: 'sessao_horas', valor: '500' },
      { chave: 'permitir_anexos', valor: '0' },
      { chave: 'organizacao', valor: 'Acme' },
    ]
    expect(rodar(L).lotes.config).toEqual([
      { chave: 'sessao.horasAbsoluta', valor: 72 },
      { chave: 'anexos.habilitados', valor: false },
      { chave: 'sistema.organizacao', valor: 'Acme' },
    ])
  })
})
