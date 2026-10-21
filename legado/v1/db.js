// Banco de dados SQLite (node:sqlite) - esquema e dados iniciais
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_FILE = process.env.VINIMON_DB || './data/VINIMON.db';
mkdirSync(dirname(DB_FILE), { recursive: true });
export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

export function hashSenha(senha) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(senha, salt, 64).toString('hex');
}
export function confereSenha(senha, hash) {
  const [salt, h] = String(hash).split(':');
  if (!salt || !h) return false;
  const calc = scryptSync(senha, salt, 64);
  const orig = Buffer.from(h, 'hex');
  return calc.length === orig.length && timingSafeEqual(calc, orig);
}

db.exec(`
CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE,
  atende INTEGER NOT NULL DEFAULT 1, ativo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE, nome TEXT NOT NULL,
  email TEXT, telefone TEXT, senha_hash TEXT NOT NULL,
  nivel INTEGER NOT NULL DEFAULT 3,            -- 1 admin, 2 operador, 3 usuário
  area_id INTEGER REFERENCES areas(id), ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS prioridades (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, cor TEXT NOT NULL DEFAULT '#888888',
  ordem INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS status (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, cor TEXT NOT NULL DEFAULT '#888888',
  tipo TEXT NOT NULL DEFAULT 'andamento'        -- aberto | andamento | pendente | encerrado
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
CREATE INDEX IF NOT EXISTS ix_ch_status ON chamados(status_id);
CREATE INDEX IF NOT EXISTS ix_ch_area ON chamados(area_id);
CREATE INDEX IF NOT EXISTS ix_ch_user ON chamados(usuario_id);
CREATE TABLE IF NOT EXISTS assentamentos (
  id INTEGER PRIMARY KEY, chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL DEFAULT 'comentario',      -- comentario | privado | sistema
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
CREATE INDEX IF NOT EXISTS ix_not_user ON notificacoes(usuario_id, lida);
`);
db.prepare("UPDATE config SET valor='Vinimon' WHERE chave='nome_sistema' AND valor='VINIMON'").run();

function seed() {
  if (db.prepare('SELECT COUNT(*) n FROM usuarios').get().n > 0) return;
  const ins = (sql, rows) => { const st = db.prepare(sql); rows.forEach(r => st.run(...r)); };
  ins('INSERT INTO areas(nome,atende) VALUES(?,?)', [['Tecnologia da Informação', 1], ['Manutenção Predial', 1], ['Recursos Humanos', 0], ['Financeiro', 0]]);
  ins('INSERT INTO prioridades(nome,cor,ordem) VALUES(?,?,?)', [['Baixa', '#2e8b57', 1], ['Média', '#d9a400', 2], ['Alta', '#e67300', 3], ['Crítica', '#c62828', 4]]);
  ins('INSERT INTO status(nome,cor,tipo) VALUES(?,?,?)', [['Aguardando atendimento', '#1565c0', 'aberto'], ['Em atendimento', '#6a1b9a', 'andamento'], ['Pendente (aguardando usuário)', '#d9a400', 'pendente'], ['Agendado', '#00838f', 'pendente'], ['Encerrado', '#546e7a', 'encerrado']]);
  ins('INSERT INTO problemas(nome,area_id,sla_resposta_h,sla_solucao_h) VALUES(?,?,?,?)', [
    ['Computador não liga', 1, 2, 8], ['Rede / Internet', 1, 1, 6], ['Impressora', 1, 4, 24], ['Instalação de software', 1, 8, 48], ['Acesso / Senha', 1, 1, 4],
    ['Ar-condicionado', 2, 4, 48], ['Elétrica', 2, 2, 24], ['Hidráulica', 2, 4, 24]]);
  ins('INSERT INTO locais(nome) VALUES(?)', [['Matriz - 1º andar'], ['Matriz - 2º andar'], ['Almoxarifado'], ['Filial Centro']]);
  ins('INSERT INTO equipamentos(etiqueta,tipo,modelo,serie,local_id,responsavel) VALUES(?,?,?,?,?,?)', [
    ['PAT-0001', 'Desktop', 'Dell OptiPlex 3080', 'SN123456', 1, 'Maria Souza'], ['PAT-0002', 'Notebook', 'Lenovo ThinkPad E14', 'SN654321', 2, 'João Lima'], ['PAT-0003', 'Impressora', 'HP LaserJet M404', 'SN777888', 1, 'Setor Administrativo']]);
  ins('INSERT INTO faq(titulo,conteudo,problema_id) VALUES(?,?,?)', [
    ['Como redefinir minha senha de rede?', 'Abra um chamado em "Acesso / Senha" informando seu login. O atendimento redefine a senha em até 4 horas.', 5],
    ['Impressora não imprime', 'Verifique se há papel e toner, reinicie a impressora e confirme se está selecionada como padrão. Persistindo, abra um chamado.', 3]]);
  ins('INSERT INTO config(chave,valor) VALUES(?,?)', [['nome_sistema', 'Vinimon'], ['organizacao', 'Minha Empresa'], ['sessao_horas', '8'], ['permitir_anexos', '1']]);
  ins('INSERT INTO usuarios(login,nome,email,senha_hash,nivel,area_id) VALUES(?,?,?,?,?,?)', [
    ['admin', 'Administrador', 'admin@exemplo.com', hashSenha('admin123'), 1, 1],
    ['operador', 'Operador de TI', 'operador@exemplo.com', hashSenha('operador123'), 2, 1],
    ['usuario', 'Usuário Demonstração', 'usuario@exemplo.com', hashSenha('usuario123'), 3, 3]]);
}
seed();
