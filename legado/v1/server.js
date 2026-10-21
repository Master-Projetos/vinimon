// Servidor HTTP + API REST do VINIMON (sem dependências externas)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, hashSenha, confereSenha } from './db.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = resolve(fileURLToPath(new URL('./public', import.meta.url)));
const MAX_BODY = 12 * 1024 * 1024;
const MAX_ANEXO = 5 * 1024 * 1024;
const agora = () => new Date().toISOString();
const cfg = k => db.prepare('SELECT valor FROM config WHERE chave=?').get(k)?.valor;

// ---------- sessões / tentativas de login ----------
const sessoes = new Map(); // token -> {uid, exp}
const falhas = new Map();  // ip|login -> {n, ate}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const erro = (s, m) => new HttpError(s, m);

function cookies(req) {
  const o = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
function usuarioDaSessao(req) {
  const t = cookies(req).sid; const s = t && sessoes.get(t);
  if (!s) return null;
  if (s.exp < Date.now()) { sessoes.delete(t); return null; }
  return db.prepare('SELECT id,login,nome,email,telefone,nivel,area_id FROM usuarios WHERE id=? AND ativo=1').get(s.uid) || null;
}
const exige = (u, max = 3) => { if (!u) throw erro(401, 'Não autenticado'); if (u.nivel > max) throw erro(403, 'Sem permissão'); };

// ---------- entidades cadastrais (CRUD genérico) ----------
const ENT = {
  areas: { label: 'Áreas', campos: [['nome', 'Nome', 'text', 1], ['atende', 'Área de atendimento', 'bool'], ['ativo', 'Ativa', 'bool']] },
  prioridades: { label: 'Prioridades', campos: [['nome', 'Nome', 'text', 1], ['cor', 'Cor', 'color'], ['ordem', 'Ordem', 'number']] },
  status: { label: 'Status', campos: [['nome', 'Nome', 'text', 1], ['cor', 'Cor', 'color'], ['tipo', 'Tipo', 'select', 1, [['aberto', 'Aberto'], ['andamento', 'Em andamento'], ['pendente', 'Pendente'], ['encerrado', 'Encerrado']]]] },
  problemas: { label: 'Tipos de problema', campos: [['nome', 'Nome', 'text', 1], ['area_id', 'Área responsável', 'ref:areas', 1], ['sla_resposta_h', 'SLA resposta (h)', 'number'], ['sla_solucao_h', 'SLA solução (h)', 'number'], ['ativo', 'Ativo', 'bool']] },
  locais: { label: 'Locais', campos: [['nome', 'Nome', 'text', 1], ['ativo', 'Ativo', 'bool']] },
  equipamentos: { label: 'Equipamentos', campos: [['etiqueta', 'Etiqueta/Patrimônio', 'text', 1], ['tipo', 'Tipo', 'text'], ['modelo', 'Modelo', 'text'], ['serie', 'Nº de série', 'text'], ['local_id', 'Local', 'ref:locais'], ['responsavel', 'Responsável', 'text'], ['situacao', 'Situação', 'select', 0, [['Em uso', 'Em uso'], ['Em estoque', 'Em estoque'], ['Em manutenção', 'Em manutenção'], ['Baixado', 'Baixado']]], ['observacao', 'Observação', 'textarea']] },
  faq: { label: 'Base de conhecimento (FAQ)', campos: [['titulo', 'Título', 'text', 1], ['conteudo', 'Conteúdo', 'textarea', 1], ['problema_id', 'Tipo de problema', 'ref:problemas'], ['ativo', 'Publicado', 'bool']] },
  usuarios: { label: 'Usuários', campos: [['nome', 'Nome', 'text', 1], ['login', 'Login', 'text', 1], ['email', 'E-mail', 'text'], ['telefone', 'Telefone', 'text'], ['nivel', 'Perfil', 'select', 1, [[1, 'Administrador'], [2, 'Operador'], [3, 'Usuário']]], ['area_id', 'Área', 'ref:areas'], ['senha', 'Senha', 'password'], ['ativo', 'Ativo', 'bool']] },
};
const escrita = { faq: 2, equipamentos: 2 }; // demais: somente admin
const colunas = e => ENT[e].campos.map(c => c[0]).filter(c => c !== 'senha');

function validaEntidade(ent, body, criando) {
  const vals = {};
  for (const [k, rot, tipo, obrig, opts] of ENT[ent].campos) {
    if (k === 'senha') continue;
    let v = body[k];
    if (tipo === 'bool') v = v ? 1 : 0;
    else if (v === undefined || v === null || v === '') v = null;
    if (v === null && obrig) throw erro(400, `Campo obrigatório: ${rot}`);
    if (v !== null && (tipo === 'number' || tipo.startsWith('ref:'))) { v = Number(v); if (!Number.isInteger(v)) throw erro(400, `Valor inválido: ${rot}`); }
    if (v !== null && tipo === 'select' && !opts.some(o => String(o[0]) === String(v))) throw erro(400, `Valor inválido: ${rot}`);
    if (v !== null && tipo === 'color' && !/^#[0-9a-fA-F]{6}$/.test(v)) throw erro(400, 'Cor inválida');
    if (v === null && !criando && body[k] === undefined) continue;
    vals[k] = typeof v === 'string' ? v.trim() : v;
  }
  if (ent === 'usuarios') {
    if (body.senha) { if (String(body.senha).length < 6) throw erro(400, 'A senha deve ter ao menos 6 caracteres'); vals.senha_hash = hashSenha(String(body.senha)); }
    else if (criando) throw erro(400, 'Informe a senha');
  }
  return vals;
}

// ---------- chamados ----------
const SEL_CH = `SELECT c.*, s.nome status_nome, s.cor status_cor, s.tipo status_tipo, p.nome prioridade_nome, p.cor prioridade_cor,
  a.nome area_nome, pr.nome problema_nome, pr.sla_resposta_h, pr.sla_solucao_h, l.nome local_nome, e.etiqueta equipamento_etiqueta,
  us.nome solicitante_nome, op.nome operador_nome
  FROM chamados c JOIN status s ON s.id=c.status_id JOIN prioridades p ON p.id=c.prioridade_id JOIN areas a ON a.id=c.area_id
  LEFT JOIN problemas pr ON pr.id=c.problema_id LEFT JOIN locais l ON l.id=c.local_id LEFT JOIN equipamentos e ON e.id=c.equipamento_id
  JOIN usuarios us ON us.id=c.usuario_id LEFT JOIN usuarios op ON op.id=c.operador_id`;

function escopo(u, w, p) {
  if (u.nivel === 1) return;
  if (u.nivel === 2) { w.push('(c.area_id=? OR c.operador_id=? OR c.usuario_id=?)'); p.push(u.area_id ?? -1, u.id, u.id); }
  else { w.push('c.usuario_id=?'); p.push(u.id); }
}
function enriquece(c) {
  const ab = Date.parse(c.data_abertura), enc = c.status_tipo === 'encerrado';
  const lim = h => ab + (h || 0) * 3600e3;
  c.sla_solucao_limite = c.sla_solucao_h ? new Date(lim(c.sla_solucao_h)).toISOString() : null;
  c.sla_resposta_limite = c.sla_resposta_h ? new Date(lim(c.sla_resposta_h)).toISOString() : null;
  const fim = enc && c.data_fechamento ? Date.parse(c.data_fechamento) : Date.now();
  c.sla_solucao_estourado = !!(c.sla_solucao_h && fim > lim(c.sla_solucao_h));
  const resp = c.data_primeira_resposta ? Date.parse(c.data_primeira_resposta) : Date.now();
  c.sla_resposta_estourado = !!(c.sla_resposta_h && resp > lim(c.sla_resposta_h));
  return c;
}
function carregaChamado(u, id) {
  const c = db.prepare(SEL_CH + ' WHERE c.id=?').get(id);
  if (!c) throw erro(404, 'Chamado não encontrado');
  const w = [], p = []; escopo(u, w, p);
  if (w.length && !db.prepare(`SELECT 1 FROM chamados c WHERE c.id=? AND ${w.join(' AND ')}`).get(id, ...p)) throw erro(403, 'Sem permissão para este chamado');
  return enriquece(c);
}
const log = (cid, uid, texto, tipo = 'sistema') =>
  db.prepare('INSERT INTO assentamentos(chamado_id,usuario_id,tipo,texto,criado_em) VALUES(?,?,?,?,?)').run(cid, uid, tipo, texto, agora());
const statusPorTipo = t => db.prepare('SELECT id FROM status WHERE tipo=? ORDER BY id LIMIT 1').get(t)?.id;
const nome = (t, id) => db.prepare(`SELECT nome FROM ${t} WHERE id=?`).get(id)?.nome ?? '—';

function listaChamados(u, q) {
  const w = [], p = []; escopo(u, w, p);
  const f = (cond, v) => { w.push(cond); p.push(v); };
  if (q.status_id) f('c.status_id=?', +q.status_id);
  if (q.status_tipo === 'abertos') w.push("s.tipo<>'encerrado'"); else if (q.status_tipo) f('s.tipo=?', q.status_tipo);
  if (q.area_id) f('c.area_id=?', +q.area_id);
  if (q.prioridade_id) f('c.prioridade_id=?', +q.prioridade_id);
  if (q.problema_id) f('c.problema_id=?', +q.problema_id);
  if (q.operador_id === '0') w.push('c.operador_id IS NULL'); else if (q.operador_id) f('c.operador_id=?', +q.operador_id);
  if (q.usuario_id && u.nivel < 3) f('c.usuario_id=?', +q.usuario_id);
  if (q.meus === '1') f('c.operador_id=?', u.id);
  if (q.de) f('c.data_abertura>=?', new Date(q.de + 'T00:00:00').toISOString());
  if (q.ate) f('c.data_abertura<=?', new Date(q.ate + 'T23:59:59.999').toISOString());
  if (q.busca) {
    const t = `%${q.busca.replace(/[%_]/g, m => '\\' + m)}%`;
    w.push("(c.assunto LIKE ? ESCAPE '\\' OR c.descricao LIKE ? ESCAPE '\\' OR CAST(c.id AS TEXT)=? OR us.nome LIKE ? ESCAPE '\\')");
    p.push(t, t, q.busca.trim(), t);
  }
  const ord = { id: 'c.id', abertura: 'c.data_abertura', prioridade: 'p.ordem', status: 's.nome' }[q.ordem] || 'c.id';
  const dir = q.dir === 'asc' ? 'ASC' : 'DESC';
  const where = w.length ? ' WHERE ' + w.join(' AND ') : '';
  const pag = Math.max(1, +q.pagina || 1), por = Math.min(200, +q.por || 25);
  const total = db.prepare(`SELECT COUNT(*) n FROM chamados c JOIN status s ON s.id=c.status_id JOIN prioridades p ON p.id=c.prioridade_id JOIN usuarios us ON us.id=c.usuario_id${where}`).get(...p).n;
  const itens = db.prepare(`${SEL_CH}${where} ORDER BY ${ord} ${dir} LIMIT ? OFFSET ?`).all(...p, por, (pag - 1) * por).map(enriquece);
  return { total, pagina: pag, por, itens };
}

function criaChamado(u, b) {
  const assunto = String(b.assunto || '').trim(), descricao = String(b.descricao || '').trim();
  if (!assunto || !descricao) throw erro(400, 'Assunto e descrição são obrigatórios');
  const prob = b.problema_id ? db.prepare('SELECT * FROM problemas WHERE id=? AND ativo=1').get(+b.problema_id) : null;
  const area = +b.area_id || prob?.area_id;
  if (!area || !db.prepare('SELECT 1 FROM areas WHERE id=? AND atende=1 AND ativo=1').get(area)) throw erro(400, 'Selecione uma área de atendimento válida');
  const prio = +b.prioridade_id || db.prepare('SELECT id FROM prioridades ORDER BY ordem LIMIT 1').get().id;
  if (!db.prepare('SELECT 1 FROM prioridades WHERE id=?').get(prio)) throw erro(400, 'Prioridade inválida');
  let solicitante = u.id;
  if (b.usuario_id && u.nivel < 3 && +b.usuario_id !== u.id) {
    if (!db.prepare('SELECT 1 FROM usuarios WHERE id=? AND ativo=1').get(+b.usuario_id)) throw erro(400, 'Solicitante inválido');
    solicitante = +b.usuario_id;
  }
  const r = db.prepare(`INSERT INTO chamados(usuario_id,area_id,problema_id,prioridade_id,status_id,local_id,equipamento_id,assunto,descricao,contato,telefone,data_abertura)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(solicitante, area, prob?.id ?? null, prio, statusPorTipo('aberto'), +b.local_id || null, +b.equipamento_id || null,
    assunto, descricao, b.contato || null, b.telefone || null, agora());
  const id = Number(r.lastInsertRowid);
  log(id, u.id, solicitante === u.id ? 'Chamado aberto.' : `Chamado aberto em nome de ${nome('usuarios', solicitante)}.`);
  if (Array.isArray(b.anexos)) b.anexos.forEach(a => salvaAnexo(u, id, a));
  return id;
}
function salvaAnexo(u, cid, a) {
  if (cfg('permitir_anexos') !== '1') throw erro(400, 'Anexos desativados');
  const buf = Buffer.from(String(a.dados || ''), 'base64');
  if (!buf.length) throw erro(400, 'Arquivo vazio');
  if (buf.length > MAX_ANEXO) throw erro(413, 'Anexo excede 5 MB');
  const nm = String(a.nome || 'arquivo').replace(/[\\/\0\r\n]/g, '_').slice(0, 150);
  db.prepare('INSERT INTO anexos(chamado_id,usuario_id,nome,mime,tamanho,dados,criado_em) VALUES(?,?,?,?,?,?,?)')
    .run(cid, u.id, nm, String(a.mime || 'application/octet-stream').slice(0, 100), buf.length, buf, agora());
  log(cid, u.id, `Anexo adicionado: ${nm}`);
}

function acaoChamado(u, id, b) {
  const c = carregaChamado(u, id);
  const operador = u.nivel <= 2;
  const dono = c.usuario_id === u.id;
  const encerrado = c.status_tipo === 'encerrado';
  const texto = String(b.texto || '').trim();
  const primeiraResp = () => { if (!c.data_primeira_resposta && operador) db.prepare('UPDATE chamados SET data_primeira_resposta=? WHERE id=?').run(agora(), id); };
  const setStatus = sid => db.prepare('UPDATE chamados SET status_id=? WHERE id=?').run(sid, id);
  switch (b.acao) {
    case 'comentar': {
      if (!texto) throw erro(400, 'Digite o comentário');
      if (encerrado) throw erro(400, 'Chamado encerrado. Reabra para comentar.');
      const priv = !!b.privado && operador;
      log(id, u.id, texto, priv ? 'privado' : 'comentario'); primeiraResp();
      if (dono && !operador && c.status_tipo === 'pendente') setStatus(statusPorTipo('andamento') ?? c.status_id);
      break;
    }
    case 'assumir': {
      if (!operador) throw erro(403, 'Sem permissão');
      if (encerrado) throw erro(400, 'Chamado encerrado');
      db.prepare('UPDATE chamados SET operador_id=? WHERE id=?').run(u.id, id);
      if (c.status_tipo === 'aberto') setStatus(statusPorTipo('andamento') ?? c.status_id);
      primeiraResp(); log(id, u.id, `${u.nome} assumiu o chamado.`);
      break;
    }
    case 'status': {
      if (!operador) throw erro(403, 'Sem permissão');
      const st = db.prepare('SELECT * FROM status WHERE id=?').get(+b.status_id);
      if (!st) throw erro(400, 'Status inválido');
      if (st.tipo === 'encerrado') throw erro(400, 'Use a ação Encerrar para informar a solução');
      if (encerrado) throw erro(400, 'Chamado encerrado. Reabra primeiro.');
      setStatus(st.id); primeiraResp();
      log(id, u.id, `Status alterado: ${c.status_nome} → ${st.nome}.${texto ? ' ' + texto : ''}`);
      break;
    }
    case 'prioridade': {
      if (!operador) throw erro(403, 'Sem permissão');
      if (!db.prepare('SELECT 1 FROM prioridades WHERE id=?').get(+b.prioridade_id)) throw erro(400, 'Prioridade inválida');
      db.prepare('UPDATE chamados SET prioridade_id=? WHERE id=?').run(+b.prioridade_id, id);
      log(id, u.id, `Prioridade alterada: ${c.prioridade_nome} → ${nome('prioridades', +b.prioridade_id)}.`);
      break;
    }
    case 'encaminhar': {
      if (!operador) throw erro(403, 'Sem permissão');
      if (encerrado) throw erro(400, 'Chamado encerrado');
      const area = +b.area_id || c.area_id;
      if (!db.prepare('SELECT 1 FROM areas WHERE id=? AND atende=1 AND ativo=1').get(area)) throw erro(400, 'Área inválida');
      let op = null;
      if (b.operador_id) {
        op = db.prepare('SELECT id FROM usuarios WHERE id=? AND nivel<=2 AND ativo=1').get(+b.operador_id);
        if (!op) throw erro(400, 'Operador inválido');
      }
      db.prepare('UPDATE chamados SET area_id=?, operador_id=? WHERE id=?').run(area, op?.id ?? null, id);
      primeiraResp();
      log(id, u.id, `Encaminhado para ${nome('areas', area)}${op ? ' / ' + nome('usuarios', op.id) : ''}.${texto ? ' ' + texto : ''}`);
      break;
    }
    case 'agendar': {
      if (!operador) throw erro(403, 'Sem permissão');
      if (encerrado) throw erro(400, 'Chamado encerrado');
      const d = Date.parse(b.data);
      if (!b.data || isNaN(d)) throw erro(400, 'Data inválida');
      const ag = statusPorTipo('pendente') && db.prepare("SELECT id FROM status WHERE nome='Agendado'").get()?.id;
      db.prepare('UPDATE chamados SET data_agendamento=? WHERE id=?').run(new Date(d).toISOString(), id);
      if (ag) setStatus(ag);
      primeiraResp(); log(id, u.id, `Atendimento agendado para ${new Date(d).toLocaleString('pt-BR')}.${texto ? ' ' + texto : ''}`);
      break;
    }
    case 'encerrar': {
      if (!operador && !dono) throw erro(403, 'Sem permissão');
      if (encerrado) throw erro(400, 'Chamado já encerrado');
      if (!texto) throw erro(400, 'Informe a solução/motivo do encerramento');
      const fim = statusPorTipo('encerrado'); if (!fim) throw erro(500, 'Nenhum status do tipo "encerrado" cadastrado');
      db.prepare('UPDATE chamados SET status_id=?, data_fechamento=?, solucao=? WHERE id=?').run(fim, agora(), texto, id);
      primeiraResp(); log(id, u.id, `Chamado encerrado. Solução: ${texto}`);
      break;
    }
    case 'reabrir': {
      if (!encerrado) throw erro(400, 'Chamado não está encerrado');
      if (!operador && !dono) throw erro(403, 'Sem permissão');
      db.prepare('UPDATE chamados SET status_id=?, data_fechamento=NULL, solucao=NULL WHERE id=?').run(statusPorTipo('aberto'), id);
      log(id, u.id, `Chamado reaberto.${texto ? ' ' + texto : ''}`);
      break;
    }
    case 'anexar': {
      if (encerrado) throw erro(400, 'Chamado encerrado');
      salvaAnexo(u, id, b.anexo || {});
      break;
    }
    default: throw erro(400, 'Ação desconhecida');
  }
  notifica(u, id, b.acao, b.acao === 'comentar' && !!b.privado && operador, c.operador_id);
}

// ---------- notificações ----------
const VERBO = {
  comentar: 'adicionou um comentário', assumir: 'assumiu o chamado', status: 'alterou o status', prioridade: 'alterou a prioridade',
  encaminhar: 'encaminhou o chamado', agendar: 'agendou o atendimento', encerrar: 'encerrou o chamado', reabrir: 'reabriu o chamado', anexar: 'adicionou um anexo',
};
// avisa quem já tratou o chamado (solicitante, operadores e quem comentou), exceto quem fez a ação
function notifica(u, id, acao, privado, operadorAnterior) {
  const ass = db.prepare('SELECT MAX(id) id FROM assentamentos WHERE chamado_id=?').get(id).id;
  const ch = db.prepare('SELECT usuario_id, operador_id FROM chamados WHERE id=?').get(id);
  const ids = new Set(db.prepare('SELECT DISTINCT usuario_id FROM assentamentos WHERE chamado_id=?').all(id).map(r => r.usuario_id));
  [ch.usuario_id, ch.operador_id, operadorAnterior].forEach(x => x && ids.add(x));
  ids.delete(u.id);
  const ins = db.prepare('INSERT INTO notificacoes(usuario_id,chamado_id,assentamento_id,acao,texto,criado_em) VALUES(?,?,?,?,?,?)');
  for (const uid of ids) {
    const d = db.prepare('SELECT id,nivel,area_id FROM usuarios WHERE id=? AND ativo=1').get(uid);
    if (!d || (privado && d.nivel > 2)) continue;
    const w = [], p = []; escopo(d, w, p);
    if (w.length && !db.prepare(`SELECT 1 FROM chamados c WHERE c.id=? AND ${w.join(' AND ')}`).get(id, ...p)) continue;
    ins.run(uid, id, ass, acao, `${u.nome} ${VERBO[acao] || 'atualizou o chamado'}`, agora());
  }
}

// ---------- dashboard / relatórios ----------
function dashboard(u) {
  const w = [], p = []; escopo(u, w, p);
  const base = w.length ? ' AND ' + w.join(' AND ') : '';
  const q = (sql, ...x) => db.prepare(sql).all(...p, ...x);
  const abertos = db.prepare(`SELECT COUNT(*) n FROM chamados c JOIN status s ON s.id=c.status_id WHERE s.tipo<>'encerrado'${base}`).get(...p).n;
  const semOperador = db.prepare(`SELECT COUNT(*) n FROM chamados c JOIN status s ON s.id=c.status_id WHERE s.tipo<>'encerrado' AND c.operador_id IS NULL${base}`).get(...p).n;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const abertosHoje = db.prepare(`SELECT COUNT(*) n FROM chamados c WHERE c.data_abertura>=?${base}`).get(hoje.toISOString(), ...p).n;
  const fechadosHoje = db.prepare(`SELECT COUNT(*) n FROM chamados c WHERE c.data_fechamento>=?${base}`).get(hoje.toISOString(), ...p).n;
  const abertosList = db.prepare(`${SEL_CH} WHERE s.tipo<>'encerrado'${base}`).all(...p).map(enriquece);
  return {
    abertos, semOperador, abertosHoje, fechadosHoje,
    slaEstourado: abertosList.filter(c => c.sla_solucao_estourado).length,
    meus: u.nivel < 3 ? abertosList.filter(c => c.operador_id === u.id).length : undefined,
    porStatus: q(`SELECT s.nome, s.cor, COUNT(*) n FROM chamados c JOIN status s ON s.id=c.status_id WHERE 1=1${base} GROUP BY s.id ORDER BY s.id`),
    porPrioridade: q(`SELECT pr.nome, pr.cor, COUNT(*) n FROM chamados c JOIN prioridades pr ON pr.id=c.prioridade_id JOIN status s ON s.id=c.status_id WHERE s.tipo<>'encerrado'${base} GROUP BY pr.id ORDER BY pr.ordem`),
    porArea: q(`SELECT a.nome, COUNT(*) n FROM chamados c JOIN areas a ON a.id=c.area_id JOIN status s ON s.id=c.status_id WHERE s.tipo<>'encerrado'${base} GROUP BY a.id ORDER BY n DESC`),
    recentes: db.prepare(`${SEL_CH}${w.length ? ' WHERE ' + w.join(' AND ') : ''} ORDER BY c.id DESC LIMIT 8`).all(...p).map(enriquece),
  };
}
function relatorio(u, q) {
  const w = [], p = []; escopo(u, w, p);
  if (q.de) { w.push('c.data_abertura>=?'); p.push(new Date(q.de + 'T00:00:00').toISOString()); }
  if (q.ate) { w.push('c.data_abertura<=?'); p.push(new Date(q.ate + 'T23:59:59.999').toISOString()); }
  if (q.area_id) { w.push('c.area_id=?'); p.push(+q.area_id); }
  const where = w.length ? ' WHERE ' + w.join(' AND ') : '';
  const grp = (join, col, extra = '') => db.prepare(`SELECT ${col} nome, COUNT(*) total, SUM(s.tipo='encerrado') encerrados,
    ROUND(AVG(CASE WHEN c.data_fechamento IS NOT NULL THEN (julianday(c.data_fechamento)-julianday(c.data_abertura))*24 END),1) media_solucao_h
    FROM chamados c JOIN status s ON s.id=c.status_id ${join}${where}${extra} GROUP BY ${col} ORDER BY total DESC`).all(...p);
  const todos = db.prepare(`${SEL_CH}${where}`).all(...p).map(enriquece);
  const fechados = todos.filter(c => c.status_tipo === 'encerrado');
  return {
    total: todos.length, encerrados: fechados.length,
    dentroSla: fechados.filter(c => !c.sla_solucao_estourado).length,
    foraSla: fechados.filter(c => c.sla_solucao_estourado).length,
    porArea: grp('JOIN areas a ON a.id=c.area_id', 'a.nome'),
    porProblema: grp('LEFT JOIN problemas pr ON pr.id=c.problema_id', "COALESCE(pr.nome,'(Sem tipo)')"),
    porOperador: grp('LEFT JOIN usuarios o ON o.id=c.operador_id', "COALESCE(o.nome,'(Sem operador)')"),
    porSolicitante: grp('JOIN usuarios us ON us.id=c.usuario_id', 'us.nome'),
    porStatus: grp('', 's.nome'),
  };
}

// ---------- roteador ----------
const rotas = [];
const rota = (m, re, fn) => rotas.push([m, new RegExp(`^${re}$`), fn]);

rota('POST', '/api/login', ({ body, req, res }) => {
  const login = String(body.login || '').trim().toLowerCase(), chave = `${req.socket.remoteAddress}|${login}`;
  const f = falhas.get(chave);
  if (f && f.n >= 5 && f.ate > Date.now()) throw erro(429, 'Muitas tentativas. Aguarde alguns minutos.');
  const row = db.prepare('SELECT * FROM usuarios WHERE lower(login)=? AND ativo=1').get(login);
  if (!row || !confereSenha(String(body.senha || ''), row.senha_hash)) {
    falhas.set(chave, { n: (f && f.ate > Date.now() ? f.n : 0) + 1, ate: Date.now() + 5 * 60e3 });
    throw erro(401, 'Login ou senha inválidos');
  }
  falhas.delete(chave);
  const t = randomBytes(32).toString('hex');
  const horas = Number(cfg('sessao_horas')) || 8;
  sessoes.set(t, { uid: row.id, exp: Date.now() + horas * 3600e3 });
  res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${horas * 3600}`);
  return { ok: true };
});
rota('POST', '/api/logout', ({ req, res }) => {
  const t = cookies(req).sid; if (t) sessoes.delete(t);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  return { ok: true };
});
rota('GET', '/api/me', ({ u }) => { exige(u); return { usuario: u, sistema: { nome: cfg('nome_sistema'), organizacao: cfg('organizacao'), anexos: cfg('permitir_anexos') === '1' } }; });
rota('GET', '/api/publico', () => ({ nome: cfg('nome_sistema'), organizacao: cfg('organizacao') }));
rota('POST', '/api/perfil', ({ u, body }) => {
  exige(u);
  const row = db.prepare('SELECT * FROM usuarios WHERE id=?').get(u.id);
  db.prepare('UPDATE usuarios SET nome=?, email=?, telefone=? WHERE id=?').run(String(body.nome || u.nome).trim() || u.nome, body.email || null, body.telefone || null, u.id);
  if (body.nova_senha) {
    if (!confereSenha(String(body.senha_atual || ''), row.senha_hash)) throw erro(400, 'Senha atual incorreta');
    if (String(body.nova_senha).length < 6) throw erro(400, 'A nova senha deve ter ao menos 6 caracteres');
    db.prepare('UPDATE usuarios SET senha_hash=? WHERE id=?').run(hashSenha(String(body.nova_senha)), u.id);
  }
  return { ok: true };
});
rota('GET', '/api/dashboard', ({ u }) => { exige(u); return dashboard(u); });
rota('GET', '/api/relatorios', ({ u, query }) => { exige(u, 2); return relatorio(u, query); });
rota('GET', '/api/chamados', ({ u, query }) => { exige(u); return listaChamados(u, query); });
rota('POST', '/api/chamados', ({ u, body }) => { exige(u); return { id: criaChamado(u, body) }; });
rota('GET', '/api/chamados/(\\d+)', ({ u, m }) => {
  exige(u);
  const c = carregaChamado(u, +m[1]);
  const ass = db.prepare(`SELECT a.*, us.nome usuario_nome FROM assentamentos a JOIN usuarios us ON us.id=a.usuario_id WHERE chamado_id=? ${u.nivel === 3 ? "AND a.tipo<>'privado'" : ''} ORDER BY a.id`).all(c.id);
  const anexos = db.prepare('SELECT id,nome,mime,tamanho,criado_em FROM anexos WHERE chamado_id=? ORDER BY id').all(c.id);
  return { chamado: c, assentamentos: ass, anexos };
});
rota('POST', '/api/chamados/(\\d+)/acao', ({ u, m, body }) => { exige(u); acaoChamado(u, +m[1], body); return { ok: true }; });
rota('GET', '/api/notificacoes', ({ u }) => {
  exige(u);
  const itens = db.prepare(`SELECT n.*, c.assunto FROM notificacoes n JOIN chamados c ON c.id=n.chamado_id WHERE n.usuario_id=? ORDER BY n.id DESC LIMIT 30`).all(u.id);
  return { itens, naoLidas: db.prepare('SELECT COUNT(*) n FROM notificacoes WHERE usuario_id=? AND lida=0').get(u.id).n };
});
rota('POST', '/api/notificacoes/lidas', ({ u, body }) => {
  exige(u);
  if (body.chamado_id) db.prepare('UPDATE notificacoes SET lida=1 WHERE usuario_id=? AND chamado_id=?').run(u.id, +body.chamado_id);
  else db.prepare('UPDATE notificacoes SET lida=1 WHERE usuario_id=?').run(u.id);
  return { ok: true };
});
rota('POST', '/api/notificacoes/(\\d+)/lida', ({ u, m }) => { exige(u); db.prepare('UPDATE notificacoes SET lida=1 WHERE id=? AND usuario_id=?').run(+m[1], u.id); return { ok: true }; });
rota('GET', '/api/anexos/(\\d+)', ({ u, m, res }) => {
  exige(u);
  const a = db.prepare('SELECT * FROM anexos WHERE id=?').get(+m[1]);
  if (!a) throw erro(404, 'Anexo não encontrado');
  carregaChamado(u, a.chamado_id);
  const seguro = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(a.mime);
  res.writeHead(200, {
    'Content-Type': seguro ? a.mime : 'application/octet-stream', 'Content-Length': a.dados.length,
    'Content-Disposition': `${seguro ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  res.end(Buffer.from(a.dados)); return null;
});
rota('GET', '/api/meta', ({ u }) => {
  exige(u);
  return {
    entidades: Object.fromEntries(Object.entries(ENT).map(([k, v]) => [k, { label: v.label, campos: v.campos, escrita: escrita[k] || 1 }])),
    areas: db.prepare('SELECT id,nome,atende FROM areas WHERE ativo=1 ORDER BY nome').all(),
    prioridades: db.prepare('SELECT id,nome,cor FROM prioridades ORDER BY ordem').all(),
    status: db.prepare('SELECT id,nome,cor,tipo FROM status ORDER BY id').all(),
    problemas: db.prepare('SELECT id,nome,area_id FROM problemas WHERE ativo=1 ORDER BY nome').all(),
    locais: db.prepare('SELECT id,nome FROM locais WHERE ativo=1 ORDER BY nome').all(),
    equipamentos: db.prepare('SELECT id,etiqueta,tipo,modelo FROM equipamentos ORDER BY etiqueta').all(),
    operadores: u.nivel < 3 ? db.prepare('SELECT id,nome,area_id FROM usuarios WHERE nivel<=2 AND ativo=1 ORDER BY nome').all() : [],
    usuarios: u.nivel < 3 ? db.prepare('SELECT id,nome,login FROM usuarios WHERE ativo=1 ORDER BY nome').all() : [],
  };
});
rota('GET', '/api/faq', ({ u, query }) => {
  exige(u);
  const t = `%${(query.busca || '').replace(/[%_]/g, m => '\\' + m)}%`;
  return db.prepare("SELECT f.*, p.nome problema_nome FROM faq f LEFT JOIN problemas p ON p.id=f.problema_id WHERE f.ativo=1 AND (f.titulo LIKE ? ESCAPE '\\' OR f.conteudo LIKE ? ESCAPE '\\') ORDER BY f.titulo").all(t, t);
});
rota('GET', '/api/config', ({ u }) => { exige(u, 1); return Object.fromEntries(db.prepare('SELECT chave,valor FROM config').all().map(r => [r.chave, r.valor])); });
rota('PUT', '/api/config', ({ u, body }) => {
  exige(u, 1);
  const ok = ['nome_sistema', 'organizacao', 'sessao_horas', 'permitir_anexos'];
  for (const k of ok) if (body[k] !== undefined) {
    let v = String(body[k]).trim();
    if (k === 'sessao_horas') { v = String(Math.min(168, Math.max(1, parseInt(v) || 8))); }
    if (k === 'permitir_anexos') v = body[k] === true || v === '1' ? '1' : '0';
    if (!v) throw erro(400, 'Valor vazio: ' + k);
    db.prepare('INSERT INTO config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor').run(k, v);
  }
  return { ok: true };
});

// CRUD genérico
const entOk = e => { if (!ENT[e]) throw erro(404, 'Cadastro inexistente'); };
rota('GET', '/api/cad/(\\w+)', ({ u, m }) => { entOk(m[1]); exige(u, m[1] === 'usuarios' ? 1 : 2); return db.prepare(`SELECT id,${colunas(m[1]).join(',')} FROM ${m[1]} ORDER BY id`).all(); });
rota('POST', '/api/cad/(\\w+)', ({ u, m, body }) => {
  entOk(m[1]); exige(u, escrita[m[1]] || 1);
  const v = validaEntidade(m[1], body, true), ks = Object.keys(v);
  try { return { id: Number(db.prepare(`INSERT INTO ${m[1]}(${ks.join(',')}) VALUES(${ks.map(() => '?').join(',')})`).run(...ks.map(k => v[k])).lastInsertRowid) }; }
  catch (e) { throw conv(e); }
});
rota('PUT', '/api/cad/(\\w+)/(\\d+)', ({ u, m, body }) => {
  entOk(m[1]); exige(u, escrita[m[1]] || 1);
  if (m[1] === 'usuarios' && +m[2] === u.id && body.ativo === false) throw erro(400, 'Você não pode desativar a si mesmo');
  if (m[1] === 'usuarios' && +m[2] === u.id && +body.nivel !== 1) throw erro(400, 'Você não pode rebaixar o próprio perfil');
  const v = validaEntidade(m[1], body, false), ks = Object.keys(v);
  if (!ks.length) return { ok: true };
  try { db.prepare(`UPDATE ${m[1]} SET ${ks.map(k => k + '=?').join(',')} WHERE id=?`).run(...ks.map(k => v[k]), +m[2]); return { ok: true }; }
  catch (e) { throw conv(e); }
});
rota('DELETE', '/api/cad/(\\w+)/(\\d+)', ({ u, m }) => {
  entOk(m[1]); exige(u, escrita[m[1]] || 1);
  if (m[1] === 'usuarios' && +m[2] === u.id) throw erro(400, 'Você não pode excluir a si mesmo');
  try { db.prepare(`DELETE FROM ${m[1]} WHERE id=?`).run(+m[2]); return { ok: true }; }
  catch (e) { if (/FOREIGN KEY/i.test(e.message)) throw erro(409, 'Registro em uso por outros dados. Desative-o em vez de excluir.'); throw conv(e); }
});
function conv(e) {
  if (/UNIQUE/i.test(e.message)) return erro(409, 'Já existe um registro com esse valor único (nome/login/etiqueta).');
  if (/FOREIGN KEY/i.test(e.message)) return erro(400, 'Referência inválida.');
  return e;
}

// ---------- servidor ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'" };

const json = (res, status, obj) => { const s = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC }); res.end(s); };

function lerCorpo(req) {
  return new Promise((ok, ko) => {
    let n = 0; const partes = [];
    req.on('data', d => { n += d.length; if (n > MAX_BODY) { ko(erro(413, 'Requisição muito grande')); req.destroy(); } else partes.push(d); });
    req.on('end', () => { try { ok(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch { ko(erro(400, 'JSON inválido')); } });
    req.on('error', ko);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      const r = rotas.find(([m, re]) => m === req.method && re.test(url.pathname));
      if (!r) {
        if (rotas.some(([, re]) => re.test(url.pathname))) throw erro(405, 'Método não permitido');
        throw erro(404, 'Rota não encontrada');
      }
      // proteção CSRF: mutações exigem mesma origem
      if (req.method !== 'GET') {
        const o = req.headers.origin;
        if (o && new URL(o).host !== req.headers.host) throw erro(403, 'Origem não permitida');
      }
      const body = req.method === 'GET' ? {} : await lerCorpo(req);
      const query = Object.fromEntries(url.searchParams);
      const out = r[2]({ req, res, u: usuarioDaSessao(req), body, query, m: url.pathname.match(r[1]) });
      if (out !== null) json(res, 200, out);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw erro(405, 'Método não permitido');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const arq = normalize(join(PUBLIC, rel));
    if (arq !== PUBLIC && !arq.startsWith(PUBLIC + '\\') && !arq.startsWith(PUBLIC + '/')) throw erro(403, 'Acesso negado');
    try {
      const data = await readFile(arq);
      res.writeHead(200, { 'Content-Type': MIME[extname(arq)] || 'application/octet-stream', ...SEC });
      res.end(data);
    } catch { throw erro(404, 'Arquivo não encontrado'); }
  } catch (e) {
    if (e instanceof HttpError) return json(res, e.status, { erro: e.message });
    console.error(e);
    json(res, 500, { erro: 'Erro interno do servidor' });
  }
});
server.listen(PORT, () => console.log(`Vinimon rodando em http://localhost:${PORT}`));
