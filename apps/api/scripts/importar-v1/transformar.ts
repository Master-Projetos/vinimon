import { createHash } from 'node:crypto'
import type { MotivoSeguir, PapelStatus, Perfil, SituacaoArtigo, SituacaoAtivo, TipoStatus } from '@vinimon/shared'
import type { CalendarioSla } from '../../src/modules/sla/calendario'
import { type IntervaloPausa, recalcularSla } from '../../src/modules/sla/recalculo'
import type { AssentamentoV1, LeituraV1, StatusV1 } from './ler'
import type { Normalizado } from './validar'

// ───────────────────────── Entrada ─────────────────────────

export type ContextoTransformacao = {
  /**
   * Papéis de status que já estão ocupados no destino (ex.: pelo `seedBase`).
   * Cada papel é único; a transformação não atribui um papel já ocupado.
   */
  statusPapel?: ReadonlySet<PapelStatus>
  /** Id do canal "Sistema Web". */
  canalWebId: number
  /** Id da jornada 24x7. */
  jornada24x7Id: number
  /** Id da unidade "Principal" (onde entram os locais da v1). */
  unidadePrincipalId: number
  /** Instante de referência (injetável nos testes). */
  agora: Date
  /** Opção `--exigir-troca-todos`. */
  exigirTrocaTodos?: boolean
  /** `sla.alertaPct` (padrão 80). */
  alertaPct?: number
}

// ───────────────────────── Saída (um array por tabela v2) ─────────────────────────

export type AreaLote = { id: number; nome: string; atende: boolean; ativo: boolean }
export type DepartamentoLote = { id: number; unidadeId: number; nome: string; ativo: boolean }
export type PrioridadeLote = {
  id: number
  nome: string
  cor: string
  ordem: number
  padrao: boolean
  ativo: boolean
}
export type StatusLote = {
  id: number
  nome: string
  tipo: TipoStatus
  papel: PapelStatus | null
  cor: string
  pausaSla: boolean
  ordem: number
  ativo: boolean
}
export type ProblemaLote = {
  id: number
  nome: string
  areaPadraoId: number | null
  slaRespostaMin: number | null
  slaSolucaoMin: number | null
  ativo: boolean
}
export type ProblemaAreaLote = { problemaId: number; areaId: number }
export type UsuarioLote = {
  id: number
  login: string
  nome: string
  email: string | null
  telefone: string | null
  senhaHash: string | null
  deveTrocarSenha: boolean
  perfil: Perfil
  areaId: number | null
  ativo: boolean
  criadoEm: Date
}
export type TipoAtivoLote = { id: number; nome: string }
export type AtivoLote = {
  id: number
  etiqueta: string
  tipoId: number
  modelo: string | null
  serie: string | null
  departamentoId: number | null
  responsavelId: number | null
  responsavelTexto: string | null
  situacao: SituacaoAtivo
  observacao: string | null
}
export type CategoriaArtigoLote = { id: number; nome: string }
export type ArtigoLote = {
  id: number
  titulo: string
  conteudo: string
  categoriaId: number
  situacao: SituacaoArtigo
  visibilidade: 'PUBLICO'
  publicadoEm: Date | null
}
export type ArtigoProblemaLote = { artigoId: number; problemaId: number }
export type ChamadoLote = {
  id: number
  assunto: string
  descricao: string
  solucao: string | null
  contato: string | null
  telefone: string | null
  solicitanteId: number
  abertoPorId: number
  operadorId: number | null
  areaId: number
  problemaId: number | null
  prioridadeId: number
  canalId: number
  statusId: number
  statusTipo: TipoStatus
  statusDesde: Date
  departamentoId: number | null
  ativoId: number | null
  abertoEm: Date
  agendadoPara: Date | null
  primeiraRespostaEm: Date | null
  concluidoEm: Date | null
  encerradoEm: Date | null
  jornadaId: number
  slaRespostaMin: number | null
  slaSolucaoMin: number | null
  prazoRespostaEm: Date | null
  alertaRespostaEm: Date | null
  prazoSolucaoEm: Date | null
  alertaSolucaoEm: Date | null
  slaPausado: boolean
  slaPausadoSeg: number
  slaRespostaCumprido: boolean | null
  slaSolucaoCumprido: boolean | null
  tempoRespostaUtilMin: number | null
  tempoSolucaoUtilMin: number | null
  slaAvisoRiscoEm: Date | null
  slaAvisoEstouroEm: Date | null
  slaAvisoRespostaEm: Date | null
  ultimoAssentamentoId: number | null
  ultimoAssentamentoPublicoId: number | null
  ultimaInteracaoEm: Date | null
  ultimaInteracaoAutorId: number | null
  ultimaAtividadeEm: Date
}
export type AssentamentoLote = {
  id: number
  chamadoId: number
  autorId: number
  tipo: 'COMENTARIO' | 'SISTEMA'
  interno: boolean
  texto: string
  criadoEm: Date
}
/**
 * Anexo sem `sha256`: o hash e o tipo detectado só existem depois do pipeline de
 * arquivos (passo 4 da §4.5), que completa a linha antes do `createMany`.
 */
export type AnexoLote = {
  id: string
  chamadoId: number
  assentamentoId: null
  enviadoPorId: number
  nomeOriginal: string
  /** Tipo declarado na v1 (o pipeline o substitui pelo detectado). */
  mime: string
  tamanho: number
  storageChave: string
  interno: false
  criadoEm: Date
}
export type ChamadoSeguidorLote = {
  chamadoId: number
  usuarioId: number
  motivo: MotivoSeguir
  criadoEm: Date
}
export type ChamadoLeituraLote = {
  chamadoId: number
  usuarioId: number
  ultimoAssentamentoLidoId: number
  lidoEm: Date
}
export type ConfigLote = { chave: string; valor: string | number | boolean }

export type Lotes = {
  areas: AreaLote[]
  departamentos: DepartamentoLote[]
  prioridades: PrioridadeLote[]
  status: StatusLote[]
  problemas: ProblemaLote[]
  problemasArea: ProblemaAreaLote[]
  usuarios: UsuarioLote[]
  tiposAtivo: TipoAtivoLote[]
  ativos: AtivoLote[]
  categoriasArtigo: CategoriaArtigoLote[]
  artigos: ArtigoLote[]
  artigosProblema: ArtigoProblemaLote[]
  chamados: ChamadoLote[]
  assentamentos: AssentamentoLote[]
  anexos: AnexoLote[]
  chamadosSeguidores: ChamadoSeguidorLote[]
  chamadosLeituras: ChamadoLeituraLote[]
  config: ConfigLote[]
}

export type ResultadoTransformacao = {
  lotes: Lotes
  avisos: string[]
  /** Logins que tiveram o hash anulado por usarem senha padrão (relatório, T10). */
  loginsSenhaAnulada: string[]
}

// ───────────────────────── Utilidades ─────────────────────────

export const MARCADOR_TRUNCADO = '[texto truncado na migração]'
export const SOLUCAO_AUSENTE = '(sem solução registrada no sistema anterior)'
export const LIMITE_ASSENTAMENTO = 10_000
export const NOME_CATEGORIA_ARTIGO = 'Geral'

/** Calendário 24x7 usado no recálculo de SLA dos chamados importados. */
export const CALENDARIO_24X7: CalendarioSla = {
  timezone: 'America/Sao_Paulo',
  ininterrupta: true,
  horarios: [],
  feriados: new Set<string>(),
  feriadosRecorrentes: new Set<string>(),
}

const COR = /^#[0-9a-fA-F]{6}$/

/** Id determinístico do anexo importado (§4.5, passo 4). */
export function uuidLegado(id: number): string {
  const h = createHash('sha256').update(`vinimon-legado-anexo:${id}`).digest('hex')
  const variante = ((Number.parseInt(h.charAt(16), 16) & 3) | 8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** Datas da v1 sem fuso são tratadas como UTC. */
function paraData(v: string): Date {
  const iso = v.includes(' ') && !v.includes('T') ? v.replace(' ', 'T') : v
  const temFuso = /(Z|[+-]\d{2}:?\d{2})$/.test(iso)
  const completo = /T/.test(iso) ? iso : `${iso}T00:00:00`
  return new Date(temFuso ? iso : `${completo}Z`)
}

function normalizarNome(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function vazioParaNulo(v: string | null): string | null {
  if (v === null) return null
  const t = v.trim()
  return t === '' ? null : t
}

function truncarAssentamento(texto: string): string {
  if (texto.length <= LIMITE_ASSENTAMENTO) return texto
  return texto.slice(0, LIMITE_ASSENTAMENTO - MARCADOR_TRUNCADO.length) + MARCADOR_TRUNCADO
}

function tipoV2(s: StatusV1): TipoStatus {
  if (normalizarNome(s.nome) === 'agendado') return 'AGENDADO'
  if (s.tipo === 'aberto') return 'ABERTO'
  if (s.tipo === 'andamento') return 'EM_ATENDIMENTO'
  if (s.tipo === 'pendente') return 'PENDENTE'
  if (s.tipo === 'encerrado') return 'ENCERRADO'
  return 'EM_ATENDIMENTO'
}

const PAPEL_POR_TIPO_V1: Readonly<Record<string, PapelStatus>> = {
  aberto: 'INICIAL',
  andamento: 'EM_ATENDIMENTO',
  pendente: 'AGUARDANDO_SOLICITANTE',
  encerrado: 'ENCERRADO',
}

function situacaoAtivo(v: string): SituacaoAtivo | null {
  const n = normalizarNome(v)
  if (n === 'em uso') return 'EM_USO'
  if (n === 'em estoque') return 'EM_ESTOQUE'
  if (n === 'em manutencao') return 'EM_MANUTENCAO'
  if (n === 'baixado') return 'BAIXADO'
  return null
}

function agrupar<T>(itens: readonly T[], chave: (t: T) => number): Map<number, T[]> {
  const mapa = new Map<number, T[]>()
  for (const i of itens) {
    const k = chave(i)
    const lista = mapa.get(k)
    if (lista) lista.push(i)
    else mapa.set(k, [i])
  }
  return mapa
}

// ───────────────────────── Transformação ─────────────────────────

/**
 * Transforma a leitura da v1 (já validada) em lotes por tabela do v2, na ordem das FKs,
 * prontos para `createMany`. Função pura: sem banco, sem relógio e sem arquivos.
 * `norm` é a saída de `validar()` (logins, e-mails, perfis, cores e senhas padrão já normalizados).
 */
export function transformar(L: LeituraV1, norm: Normalizado, ctx: ContextoTransformacao): ResultadoTransformacao {
  const avisos: string[] = []
  const agora = ctx.agora
  const ocupados = ctx.statusPapel ?? new Set<PapelStatus>()

  // areas / departamentos
  const areas: AreaLote[] = L.areas.map((a) => ({
    id: a.id,
    nome: a.nome,
    atende: a.atende === 1,
    ativo: a.ativo === 1,
  }))
  const departamentos: DepartamentoLote[] = L.locais.map((l) => ({
    id: l.id,
    unidadeId: ctx.unidadePrincipalId,
    nome: l.nome,
    ativo: l.ativo === 1,
  }))

  // prioridades: cor já normalizada; a de menor ordem acima de 1 vira padrão
  const corPrioridade = new Map(norm.prioridades.map((p) => [p.id, p.cor]))
  const candidatas = L.prioridades.filter((p) => p.ordem > 1).sort((a, b) => a.ordem - b.ordem || a.id - b.id)
  const idPadrao = candidatas[0]?.id ?? null
  const prioridades: PrioridadeLote[] = L.prioridades.map((p) => ({
    id: p.id,
    nome: p.nome,
    cor: corPrioridade.get(p.id) ?? '#888888',
    ordem: p.ordem,
    padrao: p.id === idPadrao,
    ativo: true,
  }))

  // status: tipo, pausa e papéis (menor id de cada tipo; "Agendado" pelo nome)
  const papelDe = new Map<number, PapelStatus>()
  const porId = [...L.status].sort((a, b) => a.id - b.id)
  const agendado = porId.find((s) => normalizarNome(s.nome) === 'agendado')
  if (agendado && !ocupados.has('AGENDADO')) papelDe.set(agendado.id, 'AGENDADO')
  const tiposJaServidos = new Set<string>()
  for (const s of porId) {
    if (s.id === agendado?.id) continue
    const papel = PAPEL_POR_TIPO_V1[s.tipo]
    if (!papel || tiposJaServidos.has(s.tipo)) continue
    tiposJaServidos.add(s.tipo)
    if (!ocupados.has(papel)) papelDe.set(s.id, papel)
  }
  const tipoPorStatus = new Map<number, TipoStatus>()
  const pausaPorStatus = new Map<number, boolean>()
  const encerradoPorStatus = new Map<number, boolean>()
  const status: StatusLote[] = L.status.map((s, i) => {
    const tipo = tipoV2(s)
    const pausaSla = tipo === 'PENDENTE' || tipo === 'ENCERRADO'
    tipoPorStatus.set(s.id, tipo)
    pausaPorStatus.set(s.id, pausaSla)
    encerradoPorStatus.set(s.id, tipo === 'ENCERRADO')
    return {
      id: s.id,
      nome: s.nome,
      tipo,
      papel: papelDe.get(s.id) ?? null,
      cor: COR.test(s.cor) ? s.cor : '#888888',
      pausaSla,
      ordem: i + 1,
      ativo: true,
    }
  })

  // problemas (horas × 60; 0 vira null) e ProblemaArea
  const minutos = (h: number): number | null => (h > 0 ? Math.round(h * 60) : null)
  const problemas: ProblemaLote[] = L.problemas.map((p) => ({
    id: p.id,
    nome: p.nome,
    areaPadraoId: p.area_id,
    slaRespostaMin: minutos(p.sla_resposta_h),
    slaSolucaoMin: minutos(p.sla_solucao_h),
    ativo: p.ativo === 1,
  }))
  const problemasArea: ProblemaAreaLote[] = []
  for (const p of L.problemas) {
    if (p.area_id !== null) problemasArea.push({ problemaId: p.id, areaId: p.area_id })
  }
  const problemaPorId = new Map(problemas.map((p) => [p.id, p]))

  // usuarios
  const normPorId = new Map(norm.usuarios.map((u) => [u.id, u]))
  const primeiraAreaQueAtende = [...L.areas].sort((a, b) => a.id - b.id).find((a) => a.atende === 1)?.id ?? null
  const usuarios: UsuarioLote[] = []
  const loginsSenhaAnulada: string[] = []
  for (const u of L.usuarios) {
    const n = normPorId.get(u.id)
    if (!n) throw new Error(`usuarios #${u.id}: ausente na saída de validar().`)
    let areaId = u.area_id
    if (n.papel === 'OPERADOR' && areaId === null) {
      areaId = primeiraAreaQueAtende
      if (areaId === null) avisos.push(`usuarios #${u.id}: operador sem área e nenhuma área atende; ficará sem área.`)
    }
    if (n.senhaPadrao) loginsSenhaAnulada.push(n.login)
    usuarios.push({
      id: u.id,
      login: n.login,
      nome: u.nome.trim().slice(0, 120),
      email: n.email,
      telefone: vazioParaNulo(u.telefone === null ? null : String(u.telefone))?.slice(0, 30) ?? null,
      senhaHash: n.senhaPadrao ? null : u.senha_hash,
      deveTrocarSenha: n.senhaPadrao || ctx.exigirTrocaTodos === true,
      perfil: n.papel,
      areaId,
      ativo: u.ativo === 1,
      criadoEm: paraData(u.criado_em),
    })
  }

  // equipamentos → TipoAtivo + Ativo
  const tiposAtivo: TipoAtivoLote[] = []
  const idTipo = new Map<string, number>()
  const usuariosPorNome = new Map<string, number[]>()
  for (const u of L.usuarios) {
    const k = normalizarNome(u.nome)
    const lista = usuariosPorNome.get(k)
    if (lista) lista.push(u.id)
    else usuariosPorNome.set(k, [u.id])
  }
  const ativos: AtivoLote[] = L.equipamentos.map((e) => {
    const nomeTipo = vazioParaNulo(e.tipo) ?? 'Outros'
    let tipoId = idTipo.get(nomeTipo)
    if (tipoId === undefined) {
      tipoId = tiposAtivo.length + 1
      idTipo.set(nomeTipo, tipoId)
      tiposAtivo.push({ id: tipoId, nome: nomeTipo })
    }
    let situacao = situacaoAtivo(e.situacao)
    if (situacao === null) {
      avisos.push(`equipamentos #${e.id}: situação desconhecida ("${e.situacao}"); usará "Em uso".`)
      situacao = 'EM_USO'
    }
    const resp = vazioParaNulo(e.responsavel)
    const candidatos = resp === null ? [] : (usuariosPorNome.get(normalizarNome(resp)) ?? [])
    const responsavelId = candidatos.length === 1 ? (candidatos[0] ?? null) : null
    return {
      id: e.id,
      etiqueta: e.etiqueta,
      tipoId,
      modelo: e.modelo,
      serie: e.serie,
      departamentoId: e.local_id,
      responsavelId,
      responsavelTexto: responsavelId === null && resp !== null ? resp.slice(0, 120) : null,
      situacao,
      observacao: e.observacao,
    }
  })

  // faq → Artigo + ArtigoProblema
  const categoriasArtigo: CategoriaArtigoLote[] = L.faq.length > 0 ? [{ id: 1, nome: NOME_CATEGORIA_ARTIGO }] : []
  const artigos: ArtigoLote[] = L.faq.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    conteudo: f.conteudo,
    categoriaId: 1,
    situacao: f.ativo === 1 ? 'PUBLICADO' : 'ARQUIVADO',
    visibilidade: 'PUBLICO',
    publicadoEm: f.ativo === 1 ? agora : null,
  }))
  const artigosProblema: ArtigoProblemaLote[] = []
  for (const f of L.faq) {
    if (f.problema_id !== null) artigosProblema.push({ artigoId: f.id, problemaId: f.problema_id })
  }

  // assentamentos
  const assentamentos: AssentamentoLote[] = L.assentamentos.map((a) => ({
    id: a.id,
    chamadoId: a.chamado_id,
    autorId: a.usuario_id,
    tipo: a.tipo === 'sistema' ? 'SISTEMA' : 'COMENTARIO',
    interno: a.tipo === 'privado',
    texto: truncarAssentamento(a.texto),
    criadoEm: paraData(a.criado_em),
  }))
  const assPorChamado = agrupar<AssentamentoV1>(
    [...L.assentamentos].sort((a, b) => a.id - b.id),
    (a) => a.chamado_id,
  )

  // chamados
  const chamados: ChamadoLote[] = []
  const seguidores: ChamadoSeguidorLote[] = []
  const leituras: ChamadoLeituraLote[] = []
  const alertaPct = ctx.alertaPct ?? 80
  for (const c of L.chamados) {
    const ass = assPorChamado.get(c.id) ?? []
    const ultimo = ass[ass.length - 1]
    const tipo = tipoPorStatus.get(c.status_id)
    if (tipo === undefined) throw new Error(`chamados #${c.id}: status_id=${c.status_id} ausente.`)
    const encerrado = encerradoPorStatus.get(c.status_id) === true
    const pausa = pausaPorStatus.get(c.status_id) === true

    const abertoEm = paraData(c.data_abertura)
    const primeiraRespostaEm = c.data_primeira_resposta === null ? null : paraData(c.data_primeira_resposta)
    const abriu = ass.find((a) => a.tipo === 'sistema' && a.texto.startsWith('Chamado aberto'))
    const abertoPorId = abriu?.usuario_id ?? c.usuario_id

    const ultimoSistema = [...ass].reverse().find((a) => a.tipo === 'sistema')
    const fechamento = encerrado
      ? c.data_fechamento !== null
        ? paraData(c.data_fechamento)
        : ultimo
          ? paraData(ultimo.criado_em)
          : abertoEm
      : null
    const statusDesde = fechamento ?? (ultimoSistema ? paraData(ultimoSistema.criado_em) : abertoEm)

    const problema = c.problema_id === null ? undefined : problemaPorId.get(c.problema_id)
    const slaRespostaMin = problema?.slaRespostaMin ?? null
    const slaSolucaoMin = problema?.slaSolucaoMin ?? null
    const pausas: IntervaloPausa[] = !encerrado && pausa ? [{ inicio: statusDesde, fim: null }] : []
    const sla = recalcularSla(
      { abertoEm, slaRespostaMin, slaSolucaoMin, primeiraRespostaEm, concluidoEm: fechamento, pausas, alertaPct },
      CALENDARIO_24X7,
    )

    // Avisos de SLA já vencido: evitam a enxurrada de alertas na primeira execução do job.
    const emAberto = fechamento === null
    const solucaoVencida = emAberto && sla.prazoSolucaoEm !== null && sla.prazoSolucaoEm.getTime() < agora.getTime()
    const riscoVencido = emAberto && sla.alertaSolucaoEm !== null && sla.alertaSolucaoEm.getTime() < agora.getTime()
    const respostaVencida =
      emAberto &&
      primeiraRespostaEm === null &&
      sla.prazoRespostaEm !== null &&
      sla.prazoRespostaEm.getTime() < agora.getTime()

    const publicos = ass.filter((a) => a.tipo !== 'privado')
    const ultimoPublico = publicos[publicos.length - 1]
    const solucao = vazioParaNulo(c.solucao)

    chamados.push({
      id: c.id,
      assunto: c.assunto.trim().slice(0, 150),
      descricao: c.descricao,
      solucao: encerrado ? (solucao ?? SOLUCAO_AUSENTE) : solucao,
      contato: c.contato === null ? null : c.contato.slice(0, 120),
      telefone: c.telefone === null ? null : c.telefone.slice(0, 30),
      solicitanteId: c.usuario_id,
      abertoPorId,
      operadorId: c.operador_id,
      areaId: c.area_id,
      problemaId: c.problema_id,
      prioridadeId: c.prioridade_id,
      canalId: ctx.canalWebId,
      statusId: c.status_id,
      statusTipo: tipo,
      statusDesde,
      departamentoId: c.local_id,
      ativoId: c.equipamento_id,
      abertoEm,
      agendadoPara: tipo === 'AGENDADO' && c.data_agendamento !== null ? paraData(c.data_agendamento) : null,
      primeiraRespostaEm,
      concluidoEm: fechamento,
      encerradoEm: fechamento,
      jornadaId: ctx.jornada24x7Id,
      slaRespostaMin,
      slaSolucaoMin,
      prazoRespostaEm: sla.prazoRespostaEm,
      alertaRespostaEm: sla.alertaRespostaEm,
      prazoSolucaoEm: sla.prazoSolucaoEm,
      alertaSolucaoEm: sla.alertaSolucaoEm,
      slaPausado: emAberto && pausa,
      slaPausadoSeg: sla.slaPausadoSeg,
      slaRespostaCumprido: sla.slaRespostaCumprido,
      slaSolucaoCumprido: sla.slaSolucaoCumprido,
      tempoRespostaUtilMin: sla.tempoRespostaUtilMin,
      tempoSolucaoUtilMin: sla.tempoSolucaoUtilMin,
      slaAvisoRiscoEm: solucaoVencida || riscoVencido ? agora : null,
      slaAvisoEstouroEm: solucaoVencida ? agora : null,
      slaAvisoRespostaEm: respostaVencida ? agora : null,
      ultimoAssentamentoId: ultimo?.id ?? null,
      ultimoAssentamentoPublicoId: ultimoPublico?.id ?? null,
      ultimaInteracaoEm: ultimoPublico ? paraData(ultimoPublico.criado_em) : null,
      ultimaInteracaoAutorId: ultimoPublico?.usuario_id ?? null,
      ultimaAtividadeEm: ultimoPublico ? paraData(ultimoPublico.criado_em) : abertoEm,
    })

    // seguidores: solicitante, operador e autores de comentários (um motivo por usuário)
    const motivos = new Map<number, MotivoSeguir>()
    motivos.set(c.usuario_id, 'SOLICITANTE')
    if (c.operador_id !== null && !motivos.has(c.operador_id)) motivos.set(c.operador_id, 'ATRIBUIDO')
    for (const a of ass) {
      if (a.tipo !== 'sistema' && !motivos.has(a.usuario_id)) motivos.set(a.usuario_id, 'COMENTOU')
    }
    for (const [usuarioId, motivo] of motivos) {
      seguidores.push({ chamadoId: c.id, usuarioId, motivo, criadoEm: abertoEm })
      // leitura: último assentamento do chamado, para cada seguidor (sem assentamentos, não há o que ler)
      if (ultimo) {
        leituras.push({ chamadoId: c.id, usuarioId, ultimoAssentamentoLidoId: ultimo.id, lidoEm: agora })
      }
    }
  }

  // anexos: id determinístico e chave AAAA/MM/<uuidLegado> (AAAA/MM de criado_em)
  const anexos: AnexoLote[] = L.anexos.map((a) => {
    const criadoEm = paraData(a.criado_em)
    const uuid = uuidLegado(a.id)
    const mes = String(criadoEm.getUTCMonth() + 1).padStart(2, '0')
    return {
      id: uuid,
      chamadoId: a.chamado_id,
      assentamentoId: null,
      enviadoPorId: a.usuario_id,
      nomeOriginal: a.nome.slice(0, 200),
      mime: a.mime,
      tamanho: a.tamanho,
      storageChave: `${criadoEm.getUTCFullYear()}/${mes}/${uuid}`,
      interno: false,
      criadoEm,
    }
  })

  // config
  const config: ConfigLote[] = []
  for (const c of L.config) {
    if (c.chave === 'nome_sistema') config.push({ chave: 'sistema.nome', valor: c.valor })
    else if (c.chave === 'organizacao') config.push({ chave: 'sistema.organizacao', valor: c.valor })
    else if (c.chave === 'sessao_horas') {
      const n = Number.parseInt(c.valor, 10)
      if (Number.isNaN(n)) avisos.push(`config sessao_horas inválido ("${c.valor}"); mantém o padrão.`)
      else config.push({ chave: 'sessao.horasAbsoluta', valor: Math.min(72, Math.max(1, n)) })
    } else if (c.chave === 'permitir_anexos') config.push({ chave: 'anexos.habilitados', valor: c.valor === '1' })
  }

  return {
    lotes: {
      areas,
      departamentos,
      prioridades,
      status,
      problemas,
      problemasArea,
      usuarios,
      tiposAtivo,
      ativos,
      categoriasArtigo,
      artigos,
      artigosProblema,
      chamados,
      assentamentos,
      anexos,
      chamadosSeguidores: seguidores,
      chamadosLeituras: leituras,
      config,
    },
    avisos,
    loginsSenhaAnulada,
  }
}
