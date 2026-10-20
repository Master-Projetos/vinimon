// Vinimon - front-end SPA (JS puro, sem dependências)
const $app = document.getElementById('app');
let ME = null, SYS = {}, META = null, FOCO_NEXT = null;
let NOTIFS = [], NNAO = 0, NSEEN = null, ntimer = null;

// ---------- utilitários ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
class Raw { constructor(s) { this.s = s; } }
const raw = s => new Raw(s);
// template tag que escapa automaticamente os valores interpolados
const h = (strs, ...vals) => new Raw(strs.reduce((a, s, i) => a + s + (i < vals.length ? part(vals[i]) : ''), ''));
const part = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v);
const dt = s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const dur = h => h == null ? '—' : h < 48 ? `${h} h` : `${(h / 24).toFixed(1)} dias`;
const NIVEIS = { 1: 'Administrador', 2: 'Operador', 3: 'Usuário' };

async function api(path, opt = {}) {
  const r = await fetch('/api' + path, { method: opt.method || 'GET', headers: opt.body ? { 'Content-Type': 'application/json' } : {}, body: opt.body ? JSON.stringify(opt.body) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { ME = null; render(); throw new Error('Sessão expirada'); }
  if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
  return j;
}
let tt;
function toast(msg, bad) {
  const t = document.getElementById('toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(tt); tt = setTimeout(() => t.className = '', 3500);
}
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };
const tag = (txt, cor) => h`<span class="tag" style="background:${cor || '#888'}">${txt}</span>`;
const opts = (arr, sel, vk = 'id', lk = 'nome', vazio) => h`${vazio !== undefined ? h`<option value="">${vazio}</option>` : ''}${arr.map(o => h`<option value="${o[vk]}" ${String(o[vk]) === String(sel ?? '') ? raw('selected') : ''}>${typeof lk === 'function' ? lk(o) : o[lk]}</option>`)}`;
const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();
function download(nome, texto, mime = 'text/csv') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + texto], { type: mime + ';charset=utf-8' })); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCel = v => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
const fileB64 = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(f); });
const form = el => Object.fromEntries(new FormData(el).entries());

// ---------- rotas ----------
function rota() {
  const [path, q = ''] = (location.hash.slice(1) || '/dashboard').split('?');
  return { parts: path.split('/').filter(Boolean), q: Object.fromEntries(new URLSearchParams(q)) };
}
window.addEventListener('hashchange', () => render());

async function boot() {
  try { const r = await api('/me'); ME = r.usuario; SYS = r.sistema; META = await api('/meta'); } catch { ME = null; }
  clearInterval(ntimer); NSEEN = null; NOTIFS = []; NNAO = 0;
  if (ME) { ntimer = setInterval(pollNotifs, 15000); pollNotifs(); }
  render();
}

// ---------- notificações ----------
const ICO_BELL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>';
const ICO_SEARCH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const buscaForm = cls => h`<form class="js-busca search ${cls || ''}" role="search">${raw(ICO_SEARCH)}<input name="n" placeholder="Buscar chamado pelo nº (ex.: 125)…" autocomplete="off" aria-label="Buscar chamado pelo número"><button class="sm">Buscar</button></form>`;

async function pollNotifs() {
  if (!ME) return;
  try {
    const r = await api('/notificacoes');
    const novas = NSEEN ? r.itens.filter(n => !n.lida && !NSEEN.has(n.id)) : [];
    NSEEN = new Set(r.itens.map(n => n.id)); NOTIFS = r.itens; NNAO = r.naoLidas;
    pintaNotifs(); novas.slice(0, 3).forEach(popNotif);
  } catch { }
}
function pintaNotifs() {
  const b = document.getElementById('nbadge'); if (!b) return;
  b.hidden = !NNAO; b.textContent = NNAO > 99 ? '99+' : NNAO;
  document.getElementById('npanel').innerHTML = h`<div class="nhead"><b>Notificações</b>${NNAO ? h`<button class="ghost sm" data-act="notif-todas">Marcar todas como lidas</button>` : ''}</div>
    <div class="nlist">${NOTIFS.length ? NOTIFS.map(n => h`<button class="nit ${n.lida ? '' : 'novo'}" data-act="notif-go" data-id="${n.id}" data-ch="${n.chamado_id}" data-ass="${n.assentamento_id ?? ''}">
      <b>Chamado #${n.chamado_id} · ${n.assunto}</b><span>${n.texto}</span><small>${dt(n.criado_em)}</small></button>`) : h`<p class="mut nvazio">Nenhuma notificação.</p>`}</div>`.s;
}
function popNotif(n) {
  const el = document.createElement('button'); el.className = 'popit';
  el.innerHTML = h`<b>Chamado #${n.chamado_id} atualizado</b><span>${n.texto}</span><small>${n.assunto}</small>`.s;
  el.onclick = () => { el.remove(); abreNotif(n.id, n.chamado_id, n.assentamento_id); };
  document.getElementById('pop').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 9000);
}
function irChamado(ch, ass) {
  const alvo = `/chamado/${ch}${ass ? '?foco=' + ass : ''}`;
  if (location.hash === '#' + alvo) render(); else location.hash = alvo;
}
async function abreNotif(id, ch, ass) {
  document.getElementById('npanel')?.setAttribute('hidden', '');
  api(`/notificacoes/${id}/lida`, { method: 'POST', body: {} }).then(pollNotifs).catch(() => { });
  irChamado(ch, ass);
}

function render() {
  if (!ME) return telaLogin();
  const { parts } = rota(), p = parts[0] || 'dashboard';
  const adm = ME.nivel === 1, op = ME.nivel <= 2;
  const link = (href, txt) => h`<a href="#${href}" class="${('/' + p).startsWith(href.split('?')[0]) && !href.includes('?') ? 'on' : ''}">${txt}</a>`;
  const ents = META ? Object.entries(META.entidades).filter(([k, e]) => ME.nivel <= e.escrita && (k !== 'faq' && k !== 'equipamentos')) : [];
  $app.innerHTML = h`<div class="layout">
    <nav class="side" id="side"><div class="brand">${SYS.nome || 'Vinimon'}<small>${SYS.organizacao}</small></div>
      ${link('/dashboard', 'Painel')}${link('/novo', 'Abrir chamado')}${link('/chamados', op ? 'Chamados' : 'Meus chamados')}
      ${link('/faq', 'Base de conhecimento')}
      ${op ? h`<div class="sec">Operação</div>${link('/cad/equipamentos', 'Equipamentos')}${link('/relatorios', 'Relatórios')}` : ''}
      ${op ? link('/cad/faq', 'Gerenciar FAQ') : ''}
      ${adm ? h`<div class="sec">Administração</div>${ents.map(([k, e]) => link('/cad/' + k, e.label))}${link('/config', 'Configurações')}` : ''}
      <div class="sec">Conta</div>${link('/perfil', 'Meu perfil')}
    </nav>
    <div class="main"><div class="top"><button class="ghost sm menu" data-act="menu" aria-label="Menu">☰</button>${buscaForm('top-search')}
      <div class="who"><span class="mut uname">${ME.nome} · ${NIVEIS[ME.nivel]}</span>
        <div class="bellwrap"><button class="icon" data-act="notif" aria-label="Notificações">${raw(ICO_BELL)}<span id="nbadge" class="badge" hidden></span></button><div id="npanel" class="npanel" hidden></div></div>
        <button class="ghost sm" data-act="sair">Sair</button></div></div>
    <div class="content" id="content">Carregando…</div></div></div>`.s;
  pintaNotifs();
  const c = document.getElementById('content');
  const mapa = { dashboard: pgDashboard, novo: pgNovo, chamados: pgLista, chamado: pgChamado, cad: pgCad, relatorios: pgRelatorios, faq: pgFaq, config: pgConfig, perfil: pgPerfil };
  guard(async () => { await (mapa[p] || pgDashboard)(c, rota()); })();
}

document.addEventListener('submit', guard(async e => {
  const f = e.target.closest('.js-busca'); if (!f) return;
  e.preventDefault();
  const v = f.elements.n.value.trim().replace(/^#/, ''); if (!v) return;
  if (/^\d+$/.test(v)) { await api('/chamados/' + v); f.reset(); location.hash = '/chamado/' + v; }
  else location.hash = '/chamados?' + qs({ busca: v });
}));
document.addEventListener('click', guard(async e => {
  if (!e.target.closest('.bellwrap')) document.getElementById('npanel')?.setAttribute('hidden', '');
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'sair') { await api('/logout', { method: 'POST', body: {} }); ME = null; clearInterval(ntimer); render(); }
  else if (act === 'notif') { const p = document.getElementById('npanel'); p.hidden = !p.hidden; }
  else if (act === 'notif-todas') { await api('/notificacoes/lidas', { method: 'POST', body: {} }); await pollNotifs(); }
  else if (act === 'notif-go') await abreNotif(a.dataset.id, a.dataset.ch, a.dataset.ass);
  else if (act === 'menu') document.getElementById('side').classList.toggle('open');
  else if (act === 'ir') location.hash = a.dataset.href;
  else if (act === 'modal-x') document.querySelector('.modal')?.remove();
}));
document.addEventListener('click', e => { const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button')) location.hash = tr.dataset.href; });

// ---------- login ----------
async function telaLogin() {
  let nome = 'Vinimon'; try { const p = await api('/publico'); nome = p.nome; } catch { }
  $app.innerHTML = h`<div class="login"><h1>${nome}</h1><p>Gestão de demandas e chamados</p>
    <form class="card" id="f"><label for="l">Login</label><input id="l" name="login" autocomplete="username" required autofocus>
    <label for="s">Senha</label><input id="s" name="senha" type="password" autocomplete="current-password" required>
    <div class="err" id="e"></div><button style="width:100%;margin-top:6px">Entrar</button></form></div>`.s;
  document.getElementById('f').onsubmit = async ev => {
    ev.preventDefault();
    try { await api('/login', { method: 'POST', body: form(ev.target) }); await boot(); }
    catch (er) { document.getElementById('e').textContent = er.message; }
  };
}

// ---------- dashboard ----------
function barras(rows, cor) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return rows.length ? h`${rows.map(r => h`<div class="hbar"><span class="l" title="${r.nome}">${r.nome}</span><span class="b" style="width:${(r.n / max) * 55}%;background:${r.cor || cor || 'var(--pri)'}"></span><span class="n">${r.n}</span></div>`)}` : h`<p class="mut">Sem dados.</p>`;
}
const linhasChamados = (itens, op = true) => h`<div class="tw"><table><thead><tr><th>#</th><th>Assunto</th>${op ? h`<th>Solicitante</th>` : ''}<th>Área</th><th>Prioridade</th><th>Status</th><th>Operador</th><th>Abertura</th></tr></thead><tbody>
  ${itens.length ? itens.map(c => h`<tr class="click" data-href="/chamado/${c.id}"><td><a href="#/chamado/${c.id}">${c.id}</a></td><td>${c.assunto}${c.status_tipo !== 'encerrado' && c.sla_solucao_estourado ? h` <span class="sla" title="SLA de solução vencido">⚠ SLA</span>` : ''}</td>${op ? h`<td>${c.solicitante_nome}</td>` : ''}<td>${c.area_nome}</td><td>${tag(c.prioridade_nome, c.prioridade_cor)}</td><td>${tag(c.status_nome, c.status_cor)}</td><td>${c.operador_nome || '—'}</td><td>${dt(c.data_abertura)}</td></tr>`) : h`<tr><td colspan="8" class="mut">Nenhum chamado encontrado.</td></tr>`}
  </tbody></table></div>`;

async function pgDashboard(c) {
  const d = await api('/dashboard'), op = ME.nivel <= 2;
  const k = (n, t, cls, href) => h`<div class="card kpi ${cls}" ${href ? raw(`data-act="ir" data-href="${esc(href)}" style="cursor:pointer"`) : ''}><b>${n}</b><span>${t}</span></div>`;
  c.innerHTML = h`<div class="pghead"><h1>Painel</h1>${buscaForm('hero')}</div>
    <div class="grid g4">${k(d.abertos, 'Chamados em aberto', '', '/chamados?status_tipo=abertos')}
      ${op ? k(d.semOperador, 'Sem operador', 'amber', '/chamados?status_tipo=abertos&operador_id=0') : ''}
      ${op ? k(d.meus, 'Atribuídos a mim', '', '/chamados?status_tipo=abertos&meus=1') : ''}
      ${k(d.slaEstourado, 'SLA de solução vencido', 'red')}${k(d.abertosHoje, 'Abertos hoje', 'amber')}${k(d.fechadosHoje, 'Encerrados hoje', 'green')}</div>
    <div class="card"><h2>Chamados recentes</h2>${linhasChamados(d.recentes, op)}</div>
    <div class="grid g2"><div class="card"><h2>Por status</h2>${barras(d.porStatus)}</div>
      <div class="card"><h2>Em aberto por prioridade</h2>${barras(d.porPrioridade)}</div>
      ${op ? h`<div class="card"><h2>Em aberto por área</h2>${barras(d.porArea)}</div>` : ''}</div>`.s;
}

// ---------- abrir chamado ----------
async function pgNovo(c) {
  const m = META, op = ME.nivel <= 2, atend = m.areas.filter(a => a.atende);
  c.innerHTML = h`<h1>Abrir chamado</h1><form class="card" id="f" style="max-width:760px">
    ${op ? h`<label>Solicitante</label><select name="usuario_id">${opts(m.usuarios, ME.id, 'id', u => `${u.nome} (${u.login})`)}</select>` : ''}
    <div class="row"><div><label>Área de atendimento *</label><select name="area_id" id="area" required>${opts(atend, '', 'id', 'nome', 'Selecione…')}</select></div>
      <div><label>Tipo de problema</label><select name="problema_id" id="prob">${opts(m.problemas, '', 'id', 'nome', 'Selecione…')}</select></div></div>
    <label>Assunto *</label><input name="assunto" required maxlength="150">
    <label>Descrição *</label><textarea name="descricao" required></textarea>
    <div id="sug"></div>
    <div class="row"><div><label>Prioridade</label><select name="prioridade_id">${opts(m.prioridades, m.prioridades[1]?.id)}</select></div>
      <div><label>Local</label><select name="local_id">${opts(m.locais, '', 'id', 'nome', '—')}</select></div>
      <div><label>Equipamento</label><select name="equipamento_id">${opts(m.equipamentos, '', 'id', e => `${e.etiqueta} · ${e.tipo || ''} ${e.modelo || ''}`, '—')}</select></div></div>
    <div class="row"><div><label>Contato</label><input name="contato" value="${ME.nome}"></div><div><label>Telefone</label><input name="telefone" value="${ME.telefone || ''}"></div></div>
    ${SYS.anexos ? h`<label>Anexos (até 5 MB cada)</label><input type="file" id="arq" multiple>` : ''}
    <p><button>Abrir chamado</button></p></form>`.s;
  const prob = c.querySelector('#prob'), area = c.querySelector('#area');
  prob.onchange = () => { const p = m.problemas.find(x => x.id == prob.value); if (p) area.value = p.area_id; };
  c.querySelector('#f').onsubmit = guard(async ev => {
    ev.preventDefault();
    const body = form(ev.target); body.anexos = [];
    for (const f of c.querySelector('#arq')?.files || []) {
      if (f.size > 5 * 1024 * 1024) throw new Error(`"${f.name}" excede 5 MB`);
      body.anexos.push({ nome: f.name, mime: f.type, dados: await fileB64(f) });
    }
    const r = await api('/chamados', { method: 'POST', body }); toast('Chamado #' + r.id + ' aberto'); location.hash = '/chamado/' + r.id;
  });
  // sugestão de FAQ enquanto digita o assunto
  let t; c.querySelector('[name=assunto]').oninput = ev => {
    clearTimeout(t); t = setTimeout(guard(async () => {
      const v = ev.target.value.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] || '';
      const box = c.querySelector('#sug'); if (v.length < 4) { box.innerHTML = ''; return; }
      const r = (await api('/faq?' + qs({ busca: v }))).slice(0, 3);
      box.innerHTML = r.length ? h`<div class="card" style="background:#d9a40014"><b>Isto pode ajudar:</b>${r.map(f => h`<p><b>${f.titulo}</b><br>${f.conteudo}</p>`)}</div>`.s : '';
    }), 400);
  };
}

// ---------- lista ----------
async function pgLista(c, { q }) {
  const m = META, op = ME.nivel <= 2;
  const f = { busca: '', status_tipo: '', status_id: '', area_id: '', prioridade_id: '', operador_id: '', meus: '', de: '', ate: '', ordem: 'id', dir: 'desc', pagina: 1, ...q };
  const r = await api('/chamados?' + qs(f));
  const pgs = Math.max(1, Math.ceil(r.total / r.por));
  c.innerHTML = h`<h1>${op ? 'Chamados' : 'Meus chamados'} <span class="mut" style="font-size:14px">(${r.total})</span></h1>
    <form class="card bar" id="f">
      <div style="flex:2"><label>Busca</label><input name="busca" value="${f.busca}" placeholder="nº, assunto, descrição, solicitante"></div>
      <div><label>Situação</label><select name="status_tipo">${opts([{ id: 'abertos', nome: 'Em aberto' }, { id: 'encerrado', nome: 'Encerrados' }], f.status_tipo, 'id', 'nome', 'Todas')}</select></div>
      <div><label>Status</label><select name="status_id">${opts(m.status, f.status_id, 'id', 'nome', 'Todos')}</select></div>
      ${op ? h`<div><label>Área</label><select name="area_id">${opts(m.areas.filter(a => a.atende), f.area_id, 'id', 'nome', 'Todas')}</select></div>
      <div><label>Operador</label><select name="operador_id">${opts([{ id: 0, nome: '(Sem operador)' }, ...m.operadores], f.operador_id, 'id', 'nome', 'Todos')}</select></div>` : ''}
      <div><label>Prioridade</label><select name="prioridade_id">${opts(m.prioridades, f.prioridade_id, 'id', 'nome', 'Todas')}</select></div>
      <div><label>De</label><input type="date" name="de" value="${f.de}"></div><div><label>Até</label><input type="date" name="ate" value="${f.ate}"></div>
      <div style="min-width:0"><button>Filtrar</button> <button type="button" class="ghost" data-act="ir" data-href="/chamados">Limpar</button></div></form>
    <div class="card">${linhasChamados(r.itens, op)}
      <div class="pag"><button class="ghost sm" id="ant" ${f.pagina <= 1 ? raw('disabled') : ''}>« Anterior</button><span>Página ${r.pagina} de ${pgs}</span><button class="ghost sm" id="prox" ${r.pagina >= pgs ? raw('disabled') : ''}>Próxima »</button></div></div>`.s;
  const ir = extra => location.hash = '/chamados?' + qs({ ...f, ...extra });
  c.querySelector('#f').onsubmit = ev => { ev.preventDefault(); ir({ ...form(ev.target), meus: ev.target.operador_id?.value ? '' : f.meus, pagina: 1 }); };
  c.querySelector('#ant').onclick = () => ir({ pagina: +f.pagina - 1 });
  c.querySelector('#prox').onclick = () => ir({ pagina: +f.pagina + 1 });
}

// ---------- detalhe do chamado ----------
async function pgChamado(c, { parts, q }) {
  const id = parts[1], d = await api('/chamados/' + id), ch = d.chamado, m = META;
  const op = ME.nivel <= 2, enc = ch.status_tipo === 'encerrado', dono = ch.usuario_id === ME.id;
  const acao = guard(async body => { await api(`/chamados/${id}/acao`, { method: 'POST', body }); toast('Atualizado'); FOCO_NEXT = 'last'; render(); });
  const campo = (rot, v) => h`<div class="f"><dt>${rot}</dt><dd>${v}</dd></div>`;
  const bloco = (tit, corpo, cls = '') => h`<section class="card blk ${cls}"><h2>${tit}</h2>${corpo}</section>`;
  const sla = (lim, est, rot) => lim ? campo(rot, h`${dt(lim)} ${est ? h`<span class="sla">⚠ vencido</span>` : h`<span class="mut">(no prazo)</span>`}`) : '';
  const temSla = ch.sla_resposta_limite || ch.sla_solucao_limite;
  c.innerHTML = h`<div class="detail">
    <p class="crumb"><a href="#/chamados">‹ Voltar aos chamados</a></p>
    <header class="chead"><div><span class="num">Chamado #${ch.id}</span><h1>${ch.assunto}</h1></div>
      <div class="chips">${tag(ch.status_nome, ch.status_cor)}${tag(ch.prioridade_nome, ch.prioridade_cor)}${!enc && ch.sla_solucao_estourado ? h`<span class="sla">⚠ SLA vencido</span>` : ''}</div></header>
    ${bloco('Resumo do atendimento', h`<dl class="kv">${campo('Status', tag(ch.status_nome, ch.status_cor))}${campo('Prioridade', tag(ch.prioridade_nome, ch.prioridade_cor))}
      ${campo('Operador', ch.operador_nome || '—')}${campo('Abertura', dt(ch.data_abertura))}${campo('1ª resposta', dt(ch.data_primeira_resposta))}
      ${ch.data_agendamento ? campo('Agendado para', dt(ch.data_agendamento)) : ''}${enc ? campo('Encerramento', dt(ch.data_fechamento)) : ''}</dl>`)}
    ${bloco('Descrição', h`<div class="tx">${ch.descricao}</div>`)}
    ${enc && ch.solucao ? bloco('Solução', h`<div class="tx">${ch.solucao}</div>`) : ''}
    ${bloco('Solicitante', h`<dl class="kv">${campo('Nome', ch.solicitante_nome)}${campo('Contato', ch.contato || '—')}${campo('Telefone', ch.telefone || '—')}</dl>`)}
    ${bloco('Classificação', h`<dl class="kv">${campo('Área', ch.area_nome)}${campo('Tipo de problema', ch.problema_nome || '—')}${campo('Local', ch.local_nome || '—')}${campo('Equipamento', ch.equipamento_etiqueta || '—')}</dl>`)}
    ${temSla ? bloco('Prazos (SLA)', h`<dl class="kv">${sla(ch.sla_resposta_limite, ch.sla_resposta_estourado, 'Prazo de resposta')}${sla(ch.sla_solucao_limite, ch.sla_solucao_estourado, 'Prazo de solução')}</dl>`) : ''}
    ${bloco('Anexos', h`${d.anexos.length ? d.anexos.map(a => h`<div class="anx"><a href="/api/anexos/${a.id}" target="_blank" rel="noopener">${a.nome}</a> <span class="mut">${Math.ceil(a.tamanho / 1024)} KB · ${dt(a.criado_em)}</span></div>`) : h`<span class="mut">Nenhum anexo.</span>`}
      ${SYS.anexos && !enc ? h`<p><input type="file" id="anx"></p>` : ''}`)}
    ${bloco('Histórico', h`<div class="tl">${d.assentamentos.map(a => h`<div class="it ${a.tipo}" id="a-${a.id}"><b>${a.usuario_nome}</b> <span class="mut">${dt(a.criado_em)}${a.tipo === 'privado' ? ' · privado (só operadores)' : ''}</span><div class="tx">${a.texto}</div></div>`)}</div>`)}
    ${enc ? bloco('Chamado encerrado', op || dono ? h`<form id="reabrir"><label>Motivo da reabertura</label><input name="texto"><p><button>Reabrir chamado</button></p></form>` : h`<span class="mut">Este chamado foi encerrado.</span>`) : h`
    ${bloco('Comentário', h`<form id="coment"><label>Novo comentário</label><textarea name="texto" required></textarea>
        <p class="actions">${op ? h`<label class="chk"><input type="checkbox" name="privado"> Privado (invisível ao solicitante)</label>` : ''}<button>Comentar</button></p></form>`)}
    ${op ? bloco('Atualizar chamado', h`<div class="row">
        <form id="st"><label>Alterar status</label><select name="status_id">${opts(m.status.filter(s => s.tipo !== 'encerrado'), ch.status_id)}</select><p><button class="ghost sm">Aplicar</button></p></form>
        <form id="pr"><label>Alterar prioridade</label><select name="prioridade_id">${opts(m.prioridades, ch.prioridade_id)}</select><p><button class="ghost sm">Aplicar</button></p></form>
        <form id="ag"><label>Agendar atendimento</label><input type="datetime-local" name="data" required><p><button class="ghost sm">Agendar</button></p></form></div>
        <h3>Encaminhamento</h3><form id="enc" class="row"><div><label>Encaminhar para área</label><select name="area_id">${opts(m.areas.filter(a => a.atende), ch.area_id)}</select></div>
          <div><label>Operador</label><select name="operador_id">${opts(m.operadores, ch.operador_id, 'id', 'nome', '(nenhum)')}</select></div>
          <div class="end"><button class="ghost sm">Encaminhar</button></div></form>
        ${ch.operador_id !== ME.id ? h`<p><button id="assumir">Assumir chamado</button></p>` : ''}`) : ''}
    ${bloco(op ? 'Solução / encerramento' : 'Encerrar meu chamado', h`<form id="fim"><label>${op ? 'Descreva a solução aplicada' : 'Informe o motivo do encerramento'}</label><textarea name="texto" required></textarea><p><button class="dan">Encerrar chamado</button></p></form>`)}`}
    </div>`.s;
  const on = (sel, fn) => { const el = c.querySelector(sel); if (el) el.onsubmit = ev => { ev.preventDefault(); fn(form(ev.target), ev.target); }; };
  on('#coment', (b, f) => acao({ acao: 'comentar', texto: b.texto, privado: !!f.privado?.checked }));
  on('#st', b => acao({ acao: 'status', status_id: b.status_id }));
  on('#pr', b => acao({ acao: 'prioridade', prioridade_id: b.prioridade_id }));
  on('#ag', b => acao({ acao: 'agendar', data: new Date(b.data).toISOString() }));
  on('#enc', b => acao({ acao: 'encaminhar', area_id: b.area_id, operador_id: b.operador_id }));
  on('#fim', b => confirm('Encerrar este chamado?') && acao({ acao: 'encerrar', texto: b.texto }));
  on('#reabrir', b => acao({ acao: 'reabrir', texto: b.texto }));
  c.querySelector('#assumir')?.addEventListener('click', () => acao({ acao: 'assumir' }));
  c.querySelector('#anx')?.addEventListener('change', guard(async ev => {
    const f = ev.target.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) throw new Error('Anexo excede 5 MB');
    await acao({ acao: 'anexar', anexo: { nome: f.name, mime: f.type, dados: await fileB64(f) } });
  }));
  // notificações deste chamado passam a lidas
  api('/notificacoes/lidas', { method: 'POST', body: { chamado_id: id } }).then(pollNotifs).catch(() => { });
  // destaca (centralizado, com glow suave) a última informação adicionada ou a indicada pela notificação
  const foco = q.foco || FOCO_NEXT; FOCO_NEXT = null;
  if (foco) {
    const alvo = foco === 'last' ? d.assentamentos.at(-1)?.id : String(foco).replace(/\D/g, '');
    const el = alvo && c.querySelector('#a-' + alvo);
    if (el) requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('glow'); setTimeout(() => el.classList.remove('glow'), 4200);
    });
    if (q.foco) history.replaceState(null, '', '#/chamado/' + id);
  }
}

// ---------- cadastros (CRUD genérico) ----------
async function pgCad(c, { parts }) {
  const ent = parts[1], def = META.entidades[ent];
  if (!def || ME.nivel > def.escrita) { c.innerHTML = '<p>Sem permissão.</p>'; return; }
  const rows = await api('/cad/' + ent);
  const refNome = (ref, id) => { const l = ref === 'areas' ? META.areas : ref === 'locais' ? META.locais : ref === 'problemas' ? META.problemas : []; return l.find(x => x.id == id)?.nome ?? '—'; };
  const mostra = (cp, r) => {
    const [k, , tipo, , o] = cp, v = r[k];
    if (tipo === 'bool') return v ? 'Sim' : 'Não';
    if (tipo === 'color') return tag(v, v);
    if (tipo.startsWith('ref:')) return refNome(tipo.slice(4), v);
    if (tipo === 'select') return o.find(x => String(x[0]) === String(v))?.[1] ?? v ?? '—';
    return tipo === 'textarea' ? String(v ?? '').slice(0, 80) : (v ?? '—');
  };
  const cols = def.campos.filter(cp => cp[2] !== 'password' && cp[2] !== 'textarea' || cp[0] === 'conteudo' && false);
  c.innerHTML = h`<h1>${def.label}</h1><p><button id="novo">+ Novo</button></p><div class="card tw"><table><thead><tr>${cols.map(cp => h`<th>${cp[1]}</th>`)}<th></th></tr></thead><tbody>
    ${rows.length ? rows.map(r => h`<tr>${cols.map(cp => h`<td>${mostra(cp, r)}</td>`)}<td class="right" style="white-space:nowrap"><button class="ghost sm" data-e="${r.id}">Editar</button> <button class="ghost sm dan-t" data-d="${r.id}">Excluir</button></td></tr>`) : h`<tr><td colspan="${cols.length + 1}" class="mut">Nenhum registro.</td></tr>`}</tbody></table></div>`.s;
  const refList = ref => ref === 'areas' ? META.areas : ref === 'locais' ? META.locais : META.problemas;
  const editor = row => {
    const campo = ([k, rot, tipo, obr, o]) => {
      const v = row?.[k];
      let inp;
      if (tipo === 'bool') inp = h`<input type="checkbox" name="${k}" ${(row ? v : true) ? raw('checked') : ''}>`;
      else if (tipo === 'textarea') inp = h`<textarea name="${k}" ${obr ? raw('required') : ''}>${v ?? ''}</textarea>`;
      else if (tipo === 'select') inp = h`<select name="${k}">${o.map(x => h`<option value="${x[0]}" ${String(x[0]) === String(v ?? o[o.length - 1][0]) ? raw('selected') : ''}>${x[1]}</option>`)}</select>`;
      else if (tipo.startsWith('ref:')) inp = h`<select name="${k}" ${obr ? raw('required') : ''}>${opts(refList(tipo.slice(4)), v, 'id', 'nome', '—')}</select>`;
      else if (tipo === 'color') inp = h`<input type="color" name="${k}" value="${v || '#1f5fbf'}">`;
      else if (tipo === 'password') inp = h`<input type="password" name="${k}" autocomplete="new-password" ${!row ? raw('required') : ''} placeholder="${row ? 'Deixe em branco para manter' : ''}">`;
      else inp = h`<input type="${tipo === 'number' ? 'number' : 'text'}" name="${k}" value="${v ?? ''}" ${obr ? raw('required') : ''}>`;
      return h`<label>${rot}${obr ? ' *' : ''}</label>${inp}`;
    };
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = h`<form class="card"><h2>${row ? 'Editar' : 'Novo'} · ${def.label}</h2>${def.campos.map(campo)}<p><button>Salvar</button> <button type="button" class="ghost" data-act="modal-x">Cancelar</button></p></form>`.s;
    document.body.appendChild(m);
    m.querySelector('form').onsubmit = guard(async ev => {
      ev.preventDefault(); const b = form(ev.target);
      def.campos.filter(cp => cp[2] === 'bool').forEach(cp => b[cp[0]] = ev.target[cp[0]].checked);
      if (ent === 'usuarios' && !b.senha) delete b.senha;
      await api('/cad/' + ent + (row ? '/' + row.id : ''), { method: row ? 'PUT' : 'POST', body: b });
      m.remove(); toast('Salvo'); render();
    });
  };
  c.querySelector('#novo').onclick = () => editor(null);
  c.querySelectorAll('[data-e]').forEach(b => b.onclick = () => editor(rows.find(r => r.id == b.dataset.e)));
  c.querySelectorAll('[data-d]').forEach(b => b.onclick = guard(async () => {
    if (!confirm('Excluir este registro?')) return;
    await api(`/cad/${ent}/${b.dataset.d}`, { method: 'DELETE' }); toast('Excluído'); render();
  }));
}

// ---------- relatórios ----------
async function pgRelatorios(c, { q }) {
  const f = { de: '', ate: '', area_id: '', ...q }, r = await api('/relatorios?' + qs(f));
  const tabela = (tit, rows) => h`<div class="card"><h2>${tit}</h2><div class="tw"><table><thead><tr><th>Nome</th><th>Total</th><th>Encerrados</th><th>Tempo médio de solução</th></tr></thead><tbody>
    ${rows.length ? rows.map(x => h`<tr><td>${x.nome}</td><td>${x.total}</td><td>${x.encerrados}</td><td>${dur(x.media_solucao_h)}</td></tr>`) : h`<tr><td colspan="4" class="mut">Sem dados.</td></tr>`}</tbody></table></div></div>`;
  c.innerHTML = h`<h1>Relatórios</h1><form class="card bar" id="f"><div><label>De</label><input type="date" name="de" value="${f.de}"></div><div><label>Até</label><input type="date" name="ate" value="${f.ate}"></div>
    <div><label>Área</label><select name="area_id">${opts(META.areas.filter(a => a.atende), f.area_id, 'id', 'nome', 'Todas')}</select></div>
    <div style="min-width:0"><button>Gerar</button> <button type="button" class="ghost" id="csv">Exportar CSV</button> <button type="button" class="ghost" id="prt">Imprimir</button></div></form>
    <div class="grid g4"><div class="card kpi"><b>${r.total}</b><span>Chamados no período</span></div><div class="card kpi green"><b>${r.encerrados}</b><span>Encerrados</span></div>
      <div class="card kpi green"><b>${r.dentroSla}</b><span>Encerrados dentro do SLA</span></div><div class="card kpi red"><b>${r.foraSla}</b><span>Encerrados fora do SLA</span></div></div>
    <div class="grid g2" style="margin-top:14px">${tabela('Por status', r.porStatus)}${tabela('Por área', r.porArea)}${tabela('Por tipo de problema', r.porProblema)}${tabela('Por operador', r.porOperador)}${tabela('Por solicitante', r.porSolicitante)}</div>`.s;
  c.querySelector('#f').onsubmit = ev => { ev.preventDefault(); location.hash = '/relatorios?' + qs(form(ev.target)); };
  c.querySelector("#prt").onclick = () => print();
  c.querySelector("#csv").onclick = guard(async () => {
    const all = await api('/chamados?' + qs({ ...f, por: 200, ordem: 'id', dir: 'asc' }));
    const head = ['Nº', 'Assunto', 'Solicitante', 'Área', 'Tipo', 'Prioridade', 'Status', 'Operador', 'Abertura', 'Encerramento'];
    download('chamados.csv', [head, ...all.itens.map(x => [x.id, x.assunto, x.solicitante_nome, x.area_nome, x.problema_nome, x.prioridade_nome, x.status_nome, x.operador_nome, dt(x.data_abertura), dt(x.data_fechamento)])].map(l => l.map(csvCel).join(';')).join('\r\n'));
    if (all.total > 200) toast(`Exportados os 200 primeiros de ${all.total}. Refine o período.`);
  });
}

// ---------- FAQ ----------
async function pgFaq(c) {
  c.innerHTML = h`<h1>Base de conhecimento</h1><div class="card"><input id="b" placeholder="Pesquisar soluções…"></div><div id="res"></div>`.s;
  const busca = guard(async () => {
    const r = await api('/faq?' + qs({ busca: c.querySelector('#b').value }));
    c.querySelector('#res').innerHTML = r.length ? r.map(f => h`<div class="card"><h2>${f.titulo}</h2><div style="white-space:pre-wrap">${f.conteudo}</div>${f.problema_nome ? h`<p class="mut">Categoria: ${f.problema_nome}</p>` : ''}</div>`).map(x => x.s).join('') : '<p class="mut">Nada encontrado.</p>';
  });
  let t; c.querySelector('#b').oninput = () => { clearTimeout(t); t = setTimeout(busca, 300); }; busca();
}

// ---------- configurações ----------
async function pgConfig(c) {
  if (ME.nivel !== 1) { c.innerHTML = '<p>Sem permissão.</p>'; return; }
  const k = await api('/config');
  c.innerHTML = h`<h1>Configurações</h1><form class="card" id="f" style="max-width:520px">
    <label>Nome do sistema</label><input name="nome_sistema" value="${k.nome_sistema}" required><label>Organização</label><input name="organizacao" value="${k.organizacao}" required>
    <label>Duração da sessão (horas)</label><input type="number" min="1" max="168" name="sessao_horas" value="${k.sessao_horas}">
    <label><input type="checkbox" name="permitir_anexos" ${k.permitir_anexos === '1' ? raw('checked') : ''}> Permitir anexos nos chamados</label><p><button>Salvar</button></p></form>`.s;
  c.querySelector('#f').onsubmit = guard(async ev => {
    ev.preventDefault(); const b = form(ev.target); b.permitir_anexos = ev.target.permitir_anexos.checked;
    await api('/config', { method: 'PUT', body: b }); const r = await api('/me'); SYS = r.sistema; toast('Configurações salvas'); render();
  });
}

// ---------- perfil ----------
async function pgPerfil(c) {
  c.innerHTML = h`<h1>Meu perfil</h1><form class="card" id="f" style="max-width:520px"><p class="mut">Login: ${ME.login} · ${NIVEIS[ME.nivel]}</p>
    <label>Nome</label><input name="nome" value="${ME.nome}" required><label>E-mail</label><input name="email" type="email" value="${ME.email || ''}"><label>Telefone</label><input name="telefone" value="${ME.telefone || ''}">
    <h2 style="margin-top:18px">Alterar senha</h2><label>Senha atual</label><input type="password" name="senha_atual" autocomplete="current-password"><label>Nova senha (mín. 6)</label><input type="password" name="nova_senha" autocomplete="new-password">
    <p><button>Salvar</button></p></form>`.s;
  c.querySelector('#f').onsubmit = guard(async ev => {
    ev.preventDefault(); await api('/perfil', { method: 'POST', body: form(ev.target) });
    ME = (await api('/me')).usuario; toast('Perfil atualizado'); render();
  });
}

boot();
