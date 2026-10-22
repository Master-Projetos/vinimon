import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** Valor cru de uma coluna do SQLite da v1. */
export type Valor = string | number | null

export type AreaV1 = { id: number; nome: string; atende: number; ativo: number }
export type UsuarioV1 = {
  id: number
  login: string
  nome: string
  email: Valor
  telefone: Valor
  senha_hash: string
  nivel: number
  area_id: number | null
  ativo: number
  criado_em: string
}
export type PrioridadeV1 = { id: number; nome: string; cor: string; ordem: number }
export type StatusV1 = { id: number; nome: string; cor: string; tipo: string }
export type ProblemaV1 = {
  id: number
  nome: string
  area_id: number | null
  sla_resposta_h: number
  sla_solucao_h: number
  ativo: number
}
export type LocalV1 = { id: number; nome: string; ativo: number }
export type EquipamentoV1 = {
  id: number
  etiqueta: string
  tipo: string | null
  modelo: string | null
  serie: string | null
  local_id: number | null
  responsavel: string | null
  situacao: string
  observacao: string | null
}
export type ChamadoV1 = {
  id: number
  usuario_id: number
  area_id: number
  problema_id: number | null
  prioridade_id: number
  status_id: number
  local_id: number | null
  equipamento_id: number | null
  operador_id: number | null
  assunto: string
  descricao: string
  contato: string | null
  telefone: string | null
  data_abertura: string
  data_agendamento: string | null
  data_primeira_resposta: string | null
  data_fechamento: string | null
  solucao: string | null
}
export type AssentamentoV1 = {
  id: number
  chamado_id: number
  usuario_id: number
  tipo: string
  texto: string
  criado_em: string
}
/** Anexo SEM a coluna `dados` (o BLOB é lido depois, um por vez). */
export type AnexoV1 = {
  id: number
  chamado_id: number
  usuario_id: number
  nome: string
  mime: string
  tamanho: number
  criado_em: string
}
export type FaqV1 = {
  id: number
  titulo: string
  conteudo: string
  problema_id: number | null
  ativo: number
}
export type ConfigV1 = { chave: string; valor: string }

export type LeituraV1 = {
  areas: AreaV1[]
  usuarios: UsuarioV1[]
  prioridades: PrioridadeV1[]
  status: StatusV1[]
  problemas: ProblemaV1[]
  locais: LocalV1[]
  equipamentos: EquipamentoV1[]
  chamados: ChamadoV1[]
  assentamentos: AssentamentoV1[]
  anexos: AnexoV1[]
  faq: FaqV1[]
  config: ConfigV1[]
  /** A tabela `notificacoes` existe no legado (não é migrada). */
  temNotificacoes: boolean
}

type Linha = Record<string, unknown>

/** Lê todas as linhas de uma consulta, com `ORDER BY id` já na própria SQL. */
function linhas(db: DatabaseSync, sql: string): Linha[] {
  return db.prepare(sql).all()
}

// Os bancos da v1 têm NOT NULL/tipos garantidos pelo DDL; os mapeadores abaixo
// apenas estreitam o tipo de cada coluna, sem inventar valores.
function txt(l: Linha, c: string): string {
  const v = l[c]
  return typeof v === 'string' ? v : String(v ?? '')
}
function txtN(l: Linha, c: string): string | null {
  const v = l[c]
  return v === null || v === undefined ? null : String(v)
}
function num(l: Linha, c: string): number {
  const v = l[c]
  return typeof v === 'number' ? v : Number(v)
}
function numN(l: Linha, c: string): number | null {
  const v = l[c]
  return v === null || v === undefined ? null : Number(v)
}
function valor(l: Linha, c: string): Valor {
  const v = l[c]
  return typeof v === 'string' || typeof v === 'number' ? v : null
}

function lerTudo(db: DatabaseSync): LeituraV1 {
  const existe = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='notificacoes'").get()
  return {
    areas: linhas(db, 'SELECT id, nome, atende, ativo FROM areas ORDER BY id').map((l) => ({
      id: num(l, 'id'),
      nome: txt(l, 'nome'),
      atende: num(l, 'atende'),
      ativo: num(l, 'ativo'),
    })),
    usuarios: linhas(
      db,
      'SELECT id, login, nome, email, telefone, senha_hash, nivel, area_id, ativo, criado_em FROM usuarios ORDER BY id',
    ).map((l) => ({
      id: num(l, 'id'),
      login: txt(l, 'login'),
      nome: txt(l, 'nome'),
      email: valor(l, 'email'),
      telefone: valor(l, 'telefone'),
      senha_hash: txt(l, 'senha_hash'),
      nivel: num(l, 'nivel'),
      area_id: numN(l, 'area_id'),
      ativo: num(l, 'ativo'),
      criado_em: txt(l, 'criado_em'),
    })),
    prioridades: linhas(db, 'SELECT id, nome, cor, ordem FROM prioridades ORDER BY id').map((l) => ({
      id: num(l, 'id'),
      nome: txt(l, 'nome'),
      cor: txt(l, 'cor'),
      ordem: num(l, 'ordem'),
    })),
    status: linhas(db, 'SELECT id, nome, cor, tipo FROM status ORDER BY id').map((l) => ({
      id: num(l, 'id'),
      nome: txt(l, 'nome'),
      cor: txt(l, 'cor'),
      tipo: txt(l, 'tipo'),
    })),
    problemas: linhas(
      db,
      'SELECT id, nome, area_id, sla_resposta_h, sla_solucao_h, ativo FROM problemas ORDER BY id',
    ).map((l) => ({
      id: num(l, 'id'),
      nome: txt(l, 'nome'),
      area_id: numN(l, 'area_id'),
      sla_resposta_h: num(l, 'sla_resposta_h'),
      sla_solucao_h: num(l, 'sla_solucao_h'),
      ativo: num(l, 'ativo'),
    })),
    locais: linhas(db, 'SELECT id, nome, ativo FROM locais ORDER BY id').map((l) => ({
      id: num(l, 'id'),
      nome: txt(l, 'nome'),
      ativo: num(l, 'ativo'),
    })),
    equipamentos: linhas(
      db,
      'SELECT id, etiqueta, tipo, modelo, serie, local_id, responsavel, situacao, observacao FROM equipamentos ORDER BY id',
    ).map((l) => ({
      id: num(l, 'id'),
      etiqueta: txt(l, 'etiqueta'),
      tipo: txtN(l, 'tipo'),
      modelo: txtN(l, 'modelo'),
      serie: txtN(l, 'serie'),
      local_id: numN(l, 'local_id'),
      responsavel: txtN(l, 'responsavel'),
      situacao: txt(l, 'situacao'),
      observacao: txtN(l, 'observacao'),
    })),
    chamados: linhas(
      db,
      `SELECT id, usuario_id, area_id, problema_id, prioridade_id, status_id, local_id, equipamento_id,
        operador_id, assunto, descricao, contato, telefone, data_abertura, data_agendamento,
        data_primeira_resposta, data_fechamento, solucao FROM chamados ORDER BY id`,
    ).map((l) => ({
      id: num(l, 'id'),
      usuario_id: num(l, 'usuario_id'),
      area_id: num(l, 'area_id'),
      problema_id: numN(l, 'problema_id'),
      prioridade_id: num(l, 'prioridade_id'),
      status_id: num(l, 'status_id'),
      local_id: numN(l, 'local_id'),
      equipamento_id: numN(l, 'equipamento_id'),
      operador_id: numN(l, 'operador_id'),
      assunto: txt(l, 'assunto'),
      descricao: txt(l, 'descricao'),
      contato: txtN(l, 'contato'),
      telefone: txtN(l, 'telefone'),
      data_abertura: txt(l, 'data_abertura'),
      data_agendamento: txtN(l, 'data_agendamento'),
      data_primeira_resposta: txtN(l, 'data_primeira_resposta'),
      data_fechamento: txtN(l, 'data_fechamento'),
      solucao: txtN(l, 'solucao'),
    })),
    assentamentos: linhas(
      db,
      'SELECT id, chamado_id, usuario_id, tipo, texto, criado_em FROM assentamentos ORDER BY id',
    ).map((l) => ({
      id: num(l, 'id'),
      chamado_id: num(l, 'chamado_id'),
      usuario_id: num(l, 'usuario_id'),
      tipo: txt(l, 'tipo'),
      texto: txt(l, 'texto'),
      criado_em: txt(l, 'criado_em'),
    })),
    // Sem a coluna `dados`: os BLOBs são lidos um por vez na gravação.
    anexos: linhas(db, 'SELECT id, chamado_id, usuario_id, nome, mime, tamanho, criado_em FROM anexos ORDER BY id').map(
      (l) => ({
        id: num(l, 'id'),
        chamado_id: num(l, 'chamado_id'),
        usuario_id: num(l, 'usuario_id'),
        nome: txt(l, 'nome'),
        mime: txt(l, 'mime'),
        tamanho: num(l, 'tamanho'),
        criado_em: txt(l, 'criado_em'),
      }),
    ),
    faq: linhas(db, 'SELECT id, titulo, conteudo, problema_id, ativo FROM faq ORDER BY id').map((l) => ({
      id: num(l, 'id'),
      titulo: txt(l, 'titulo'),
      conteudo: txt(l, 'conteudo'),
      problema_id: numN(l, 'problema_id'),
      ativo: num(l, 'ativo'),
    })),
    config: linhas(db, 'SELECT chave, valor FROM config ORDER BY chave').map((l) => ({
      chave: txt(l, 'chave'),
      valor: txt(l, 'valor'),
    })),
    temNotificacoes: existe !== undefined,
  }
}

/**
 * Copia o `.db` (e `-wal`/`-shm`, se existirem) para um diretório temporário,
 * abre a CÓPIA (nunca o original), faz checkpoint, exige `integrity_check = ok`
 * e lê as tabelas. O diretório temporário é removido ao final.
 */
export function lerV1(caminho: string): LeituraV1 {
  if (!existsSync(caminho)) throw new Error(`Arquivo SQLite não encontrado: ${caminho}`)
  const dir = mkdtempSync(join(tmpdir(), 'vinimon-v1-'))
  try {
    const copia = join(dir, basename(caminho))
    copyFileSync(caminho, copia)
    for (const sufixo of ['-wal', '-shm']) {
      if (existsSync(caminho + sufixo)) copyFileSync(caminho + sufixo, copia + sufixo)
    }
    const db = new DatabaseSync(copia)
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      const integridade = db.prepare('PRAGMA integrity_check').all()
      const ok = integridade.length === 1 && integridade[0]?.integrity_check === 'ok'
      if (!ok) throw new Error('integrity_check do SQLite da v1 falhou: o banco está corrompido.')
      return lerTudo(db)
    } finally {
      db.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
