import { scryptSync, timingSafeEqual } from 'node:crypto'
import type { LeituraV1 } from './ler'

export type PapelV2 = 'ADMIN' | 'OPERADOR' | 'USUARIO'

export type UsuarioNorm = {
  id: number
  /** `lower(trim(login))`. */
  login: string
  /** E-mail inválido ou duplicado vira null (com aviso). */
  email: string | null
  papel: PapelV2
  /** Hash igual ao de uma senha padrão conhecida: vira `senhaHash = null` na gravação. */
  senhaPadrao: boolean
}

export type PrioridadeNorm = { id: number; cor: string }

export type Normalizado = {
  usuarios: UsuarioNorm[]
  prioridades: PrioridadeNorm[]
  /** Logins cuja senha é a padrão (listados no relatório). */
  loginsSenhaPadrao: string[]
}

export type ResultadoValidacao = {
  erros: string[]
  avisos: string[]
  norm: Normalizado
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/
const COR = /^#[0-9a-fA-F]{6}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function dataValida(v: string): boolean {
  return DATA_ISO.test(v) && !Number.isNaN(Date.parse(v))
}

/** Confere o hash `salt:scrypt` da v1 com uma senha; formato inválido não confere. */
export function hashConfere(senha: string, hash: string): boolean {
  const [salt, h] = hash.split(':')
  if (!salt || !h) return false
  const esperado = Buffer.from(h, 'hex')
  if (esperado.length !== 64) return false
  return timingSafeEqual(scryptSync(senha, salt, 64), esperado)
}

function papelDoNivel(nivel: number): PapelV2 | null {
  if (nivel === 1) return 'ADMIN'
  if (nivel === 2) return 'OPERADOR'
  if (nivel === 3) return 'USUARIO'
  return null
}

/** Validação PURA do que foi lido da v1. Qualquer erro aborta a importação. */
export function validar(L: LeituraV1): ResultadoValidacao {
  const erros: string[] = []
  const avisos: string[] = []

  const ids = {
    areas: new Set(L.areas.map((a) => a.id)),
    usuarios: new Set(L.usuarios.map((u) => u.id)),
    prioridades: new Set(L.prioridades.map((p) => p.id)),
    status: new Set(L.status.map((s) => s.id)),
    problemas: new Set(L.problemas.map((p) => p.id)),
    locais: new Set(L.locais.map((l) => l.id)),
    equipamentos: new Set(L.equipamentos.map((e) => e.id)),
    chamados: new Set(L.chamados.map((c) => c.id)),
  }

  /** FK opcional (null é permitido) ou obrigatória. */
  const fk = (onde: string, campo: string, valor: number | null, destino: Set<number>, tabela: string) => {
    if (valor === null) return
    if (!destino.has(valor)) erros.push(`${onde}: ${campo}=${valor} não existe em ${tabela} (FK órfã).`)
  }
  const data = (onde: string, campo: string, valor: string | null) => {
    if (valor === null) return
    if (!dataValida(valor)) erros.push(`${onde}: ${campo} inválida ("${valor}").`)
  }

  // Usuários: login normalizado, colisão, nível, e-mail, FK de área.
  const porLogin = new Map<string, number>()
  const emailsVistos = new Set<string>()
  const usuarios: UsuarioNorm[] = []
  const loginsSenhaPadrao: string[] = []
  for (const u of L.usuarios) {
    const onde = `usuarios #${u.id}`
    const login = u.login.trim().toLowerCase()
    if (login === '') erros.push(`${onde}: login vazio.`)
    const anterior = porLogin.get(login)
    if (anterior !== undefined) {
      erros.push(
        `${onde}: login "${login}" colide com usuarios #${anterior} após normalizar (minúsculas, sem espaços).`,
      )
    } else {
      porLogin.set(login, u.id)
    }
    const papel = papelDoNivel(u.nivel)
    if (papel === null) erros.push(`${onde}: nivel=${u.nivel} fora de {1,2,3}.`)
    data(onde, 'criado_em', u.criado_em)
    fk(onde, 'area_id', u.area_id, ids.areas, 'areas')

    let email: string | null = null
    const bruto = typeof u.email === 'string' ? u.email.trim().toLowerCase() : ''
    if (bruto !== '') {
      if (!EMAIL.test(bruto)) {
        avisos.push(`${onde}: e-mail inválido ("${bruto}"); será importado como nulo.`)
      } else if (emailsVistos.has(bruto)) {
        avisos.push(`${onde}: e-mail duplicado ("${bruto}"); será importado como nulo.`)
      } else {
        emailsVistos.add(bruto)
        email = bruto
      }
    }

    const candidatas = ['admin123', 'operador123', 'usuario123', `${login}123`]
    const senhaPadrao = candidatas.some((s) => hashConfere(s, u.senha_hash))
    if (senhaPadrao) loginsSenhaPadrao.push(login)

    if (papel === 'OPERADOR' && u.area_id === null) {
      avisos.push(`${onde}: operador sem área; receberá a primeira área que atende.`)
    }
    usuarios.push({ id: u.id, login, email, papel: papel ?? 'USUARIO', senhaPadrao })
  }

  // Prioridades: cor inválida vira #888888 com aviso.
  const prioridades: PrioridadeNorm[] = L.prioridades.map((p) => {
    if (COR.test(p.cor)) return { id: p.id, cor: p.cor }
    avisos.push(`prioridades #${p.id}: cor inválida ("${p.cor}"); usará #888888.`)
    return { id: p.id, cor: '#888888' }
  })

  const TIPOS_STATUS = new Set(['aberto', 'andamento', 'pendente', 'encerrado'])
  for (const s of L.status) {
    if (!TIPOS_STATUS.has(s.tipo)) avisos.push(`status #${s.id}: tipo desconhecido ("${s.tipo}").`)
  }

  for (const p of L.problemas) fk(`problemas #${p.id}`, 'area_id', p.area_id, ids.areas, 'areas')
  for (const e of L.equipamentos) fk(`equipamentos #${e.id}`, 'local_id', e.local_id, ids.locais, 'locais')
  for (const f of L.faq) fk(`faq #${f.id}`, 'problema_id', f.problema_id, ids.problemas, 'problemas')

  for (const c of L.chamados) {
    const onde = `chamados #${c.id}`
    fk(onde, 'usuario_id', c.usuario_id, ids.usuarios, 'usuarios')
    fk(onde, 'area_id', c.area_id, ids.areas, 'areas')
    fk(onde, 'problema_id', c.problema_id, ids.problemas, 'problemas')
    fk(onde, 'prioridade_id', c.prioridade_id, ids.prioridades, 'prioridades')
    fk(onde, 'status_id', c.status_id, ids.status, 'status')
    fk(onde, 'local_id', c.local_id, ids.locais, 'locais')
    fk(onde, 'equipamento_id', c.equipamento_id, ids.equipamentos, 'equipamentos')
    fk(onde, 'operador_id', c.operador_id, ids.usuarios, 'usuarios')
    data(onde, 'data_abertura', c.data_abertura)
    data(onde, 'data_agendamento', c.data_agendamento)
    data(onde, 'data_primeira_resposta', c.data_primeira_resposta)
    data(onde, 'data_fechamento', c.data_fechamento)
    if (c.assunto.trim().length < 3) erros.push(`${onde}: assunto com menos de 3 caracteres.`)
  }

  for (const a of L.assentamentos) {
    const onde = `assentamentos #${a.id}`
    fk(onde, 'chamado_id', a.chamado_id, ids.chamados, 'chamados')
    fk(onde, 'usuario_id', a.usuario_id, ids.usuarios, 'usuarios')
    data(onde, 'criado_em', a.criado_em)
  }
  for (const a of L.anexos) {
    const onde = `anexos #${a.id}`
    fk(onde, 'chamado_id', a.chamado_id, ids.chamados, 'chamados')
    fk(onde, 'usuario_id', a.usuario_id, ids.usuarios, 'usuarios')
    data(onde, 'criado_em', a.criado_em)
  }

  if (L.temNotificacoes) avisos.push('A tabela notificacoes existe no legado e não será migrada.')

  return { erros, avisos, norm: { usuarios, prioridades, loginsSenhaPadrao } }
}
