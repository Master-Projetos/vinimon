import { scryptSync } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** Mesmo formato da v1 (legado/v1/db.js): `salt(hex):scrypt(senha, salt, 64)(hex)`. */
export function hashV1(senha: string, saltHex: string): string {
  return `${saltHex}:${scryptSync(senha, saltHex, 64).toString('hex')}`
}

// DDL copiado de legado/v1/db.js (somente os CREATE TABLE).
const DDL = `
CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE,
  atende INTEGER NOT NULL DEFAULT 1, ativo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE, nome TEXT NOT NULL,
  email TEXT, telefone TEXT, senha_hash TEXT NOT NULL,
  nivel INTEGER NOT NULL DEFAULT 3,
  area_id INTEGER REFERENCES areas(id), ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS prioridades (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, cor TEXT NOT NULL DEFAULT '#888888',
  ordem INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS status (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, cor TEXT NOT NULL DEFAULT '#888888',
  tipo TEXT NOT NULL DEFAULT 'andamento'
);
CREATE TABLE IF NOT EXISTS problemas (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, area_id INTEGER REFERENCES areas(id),
  sla_resposta_h INTEGER NOT NULL DEFAULT 4, sla_solucao_h INTEGER NOT NULL DEFAULT 24,
  ativo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS locais (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, ativo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS equipamentos (
  id INTEGER PRIMARY KEY, etiqueta TEXT NOT NULL UNIQUE, tipo TEXT, modelo TEXT, serie TEXT,
  local_id INTEGER REFERENCES locais(id), responsavel TEXT,
  situacao TEXT NOT NULL DEFAULT 'Em uso', observacao TEXT);
CREATE TABLE IF NOT EXISTS chamados (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  area_id INTEGER NOT NULL REFERENCES areas(id),
  problema_id INTEGER REFERENCES problemas(id),
  prioridade_id INTEGER NOT NULL REFERENCES prioridades(id),
  status_id INTEGER NOT NULL REFERENCES status(id),
  local_id INTEGER REFERENCES locais(id),
  equipamento_id INTEGER REFERENCES equipamentos(id),
  operador_id INTEGER REFERENCES usuarios(id),
  assunto TEXT NOT NULL, descricao TEXT NOT NULL, contato TEXT, telefone TEXT,
  data_abertura TEXT NOT NULL, data_agendamento TEXT, data_primeira_resposta TEXT,
  data_fechamento TEXT, solucao TEXT);
CREATE TABLE IF NOT EXISTS assentamentos (
  id INTEGER PRIMARY KEY, chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL DEFAULT 'comentario',
  texto TEXT NOT NULL, criado_em TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS anexos (
  id INTEGER PRIMARY KEY, chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  nome TEXT NOT NULL, mime TEXT NOT NULL, tamanho INTEGER NOT NULL, dados BLOB NOT NULL,
  criado_em TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY, titulo TEXT NOT NULL, conteudo TEXT NOT NULL,
  problema_id INTEGER REFERENCES problemas(id), ativo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notificacoes (
  id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  assentamento_id INTEGER, acao TEXT NOT NULL, texto TEXT NOT NULL,
  lida INTEGER NOT NULL DEFAULT 0, criado_em TEXT NOT NULL);
`

export type OpcoesFixture = {
  /** Acrescenta linhas inválidas (data ruim, FK órfã, nivel=4, colisão de login, e-mail duplicado). */
  invalidos?: boolean
}

export const BYTES_ANEXO = Buffer.from('conteudo-do-anexo-de-teste')

/**
 * Cria um SQLite temporário no formato da v1 e devolve o caminho.
 * O chamador remove o diretório (`dirname(caminho)`) ao final.
 */
export function criarFixture(opcoes: OpcoesFixture = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'vinimon-fixture-'))
  const caminho = join(dir, 'v1.db')
  const db = new DatabaseSync(caminho)
  try {
    db.exec('PRAGMA journal_mode = WAL;')
    db.exec(DDL)
    const salt = (n: number) => n.toString(16).padStart(32, '0')
    db.exec(`
INSERT INTO areas(id,nome,atende,ativo) VALUES (1,'Tecnologia da Informação',1,1),(2,'Recursos Humanos',0,1);
INSERT INTO prioridades(id,nome,cor,ordem) VALUES (1,'Baixa','#2e8b57',1),(2,'Alta','#e67300',3);
INSERT INTO status(id,nome,cor,tipo) VALUES (1,'Aguardando atendimento','#1565c0','aberto'),
  (2,'Em atendimento','#6a1b9a','andamento'),(3,'Pendente','#d9a400','pendente'),(4,'Encerrado','#546e7a','encerrado');
INSERT INTO problemas(id,nome,area_id,sla_resposta_h,sla_solucao_h) VALUES (1,'Impressora',1,4,24);
INSERT INTO locais(id,nome) VALUES (1,'Matriz');
INSERT INTO equipamentos(id,etiqueta,tipo,modelo,serie,local_id,responsavel,situacao)
  VALUES (1,'PAT-0001','Desktop','Dell','SN1',1,'Maria Souza','Em uso');
INSERT INTO faq(id,titulo,conteudo,problema_id) VALUES (1,'Impressora não imprime','Verifique o toner.',1);
INSERT INTO config(chave,valor) VALUES ('nome_sistema','Vinimon'),('sessao_horas','8'),('permitir_anexos','1');
`)
    const user = db.prepare(
      'INSERT INTO usuarios(id,login,nome,email,senha_hash,nivel,area_id,criado_em) VALUES (?,?,?,?,?,?,?,?)',
    )
    user.run(
      1,
      'admin',
      'Administrador',
      'admin@exemplo.com',
      hashV1('admin123', salt(1)),
      1,
      1,
      '2025-01-01T10:00:00.000Z',
    )
    user.run(
      2,
      'operador',
      'Operador de TI',
      'operador@exemplo.com',
      hashV1('operador123', salt(2)),
      2,
      1,
      '2025-01-01T10:00:00.000Z',
    )
    user.run(
      3,
      'maria',
      'Maria Souza',
      'maria@exemplo.com',
      hashV1('Segredo#2025', salt(3)),
      3,
      2,
      '2025-01-02T10:00:00.000Z',
    )
    const ch = db.prepare(
      `INSERT INTO chamados(id,usuario_id,area_id,problema_id,prioridade_id,status_id,local_id,operador_id,assunto,descricao,data_abertura,data_primeira_resposta,data_fechamento,solucao)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    ch.run(
      1,
      3,
      1,
      1,
      2,
      4,
      1,
      2,
      'Impressora parada',
      'Não imprime',
      '2025-02-01T09:00:00.000Z',
      '2025-02-01T09:30:00.000Z',
      '2025-02-01T12:00:00.000Z',
      'Trocado o toner',
    )
    ch.run(2, 3, 1, 1, 1, 1, 1, null, 'Sem rede', 'Cabo solto', '2025-02-03T09:00:00.000Z', null, null, null)
    const as = db.prepare(
      'INSERT INTO assentamentos(id,chamado_id,usuario_id,tipo,texto,criado_em) VALUES (?,?,?,?,?,?)',
    )
    as.run(1, 1, 3, 'sistema', 'Chamado aberto por Maria Souza', '2025-02-01T09:00:00.000Z')
    as.run(2, 1, 2, 'comentario', 'Verificando', '2025-02-01T09:30:00.000Z')
    as.run(3, 1, 2, 'privado', 'Nota interna', '2025-02-01T10:00:00.000Z')
    db.prepare(
      'INSERT INTO anexos(id,chamado_id,usuario_id,nome,mime,tamanho,dados,criado_em) VALUES (?,?,?,?,?,?,?,?)',
    ).run(1, 1, 3, 'foto.png', 'image/png', BYTES_ANEXO.length, BYTES_ANEXO, '2025-02-01T09:05:00.000Z')
    db.prepare(
      "INSERT INTO notificacoes(id,usuario_id,chamado_id,acao,texto,criado_em) VALUES (1,2,1,'abertura','Novo chamado','2025-02-01T09:00:00.000Z')",
    ).run()

    if (opcoes.invalidos) {
      // O node:sqlite liga foreign_keys por padrão; desliga só para gravar FKs órfãs.
      db.exec('PRAGMA foreign_keys = OFF;')
      // Colisão de login após normalização (lower/trim) e e-mail duplicado (aviso).
      user.run(
        4,
        'Maria ',
        'Maria Duplicada',
        'maria@exemplo.com',
        hashV1('x', salt(4)),
        3,
        2,
        '2025-01-03T10:00:00.000Z',
      )
      // Nível inválido.
      user.run(5, 'chefe', 'Chefe', 'chefe@exemplo.com', hashV1('y', salt(5)), 4, 2, '2025-01-03T10:00:00.000Z')
      // Data inválida e FK órfã (status 99), assunto curto.
      ch.run(3, 3, 1, 1, 1, 99, 1, null, 'Ok', 'Assunto curto e status órfão', 'ontem', null, null, null)
      ch.run(4, 3, 1, 1, 1, 1, 1, null, 'Data ruim', 'Data de abertura inválida', '2025-13-45', null, null, null)
    }
  } finally {
    db.close()
  }
  return caminho
}
