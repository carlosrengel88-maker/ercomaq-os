require('dotenv').config();
const path = require('path');
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { sign, auth, requireProfile } = require('./auth');
const { notifyNovaOS, notifyEnvioCliente, notifyAprovacaoCliente, startReminderJob } = require('./notifications');
const { generateReportHTML } = require('./report');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const STATUS_FLOW = {
  rascunho: ['em_revisao', 'cancelada'],
  em_revisao: ['rascunho', 'aguardando_cliente', 'cancelada'],
  aguardando_cliente: ['aprovada', 'em_revisao', 'cancelada'],
  aprovada: ['cobrada', 'cancelada'],
  cobrada: ['recebida', 'cancelada'],
  recebida: ['cancelada'],
  cancelada: []
};
function nextNumero() {
  const r = db.prepare('SELECT MAX(id) AS m FROM os').get();
  return 'OS-' + String((r.m || 0) + 1).padStart(4, '0');
}
function addHistorico(osId, de, para, obs, userId) {
  db.prepare('INSERT INTO historico (os_id, status_anterior, status_novo, observacao, usuario_id) VALUES (?,?,?,?,?)')
    .run(osId, de || null, para, obs || null, userId || null);
}
/* ---------- Autenticação ---------- */
app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body || {};
  const user = db.prepare('SELECT * FROM usuarios WHERE email=? AND ativo=1').get(String(email || '').toLowerCase().trim());
  if (!user || !bcrypt.compareSync(senha || '', user.senha_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  }
  res.json({ token: sign(user), user: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil } });
});
app.get('/api/auth/me', auth, (req, res) => res.json(req.user));
/* ---------- Painel ---------- */
app.get('/api/dashboard', auth, (req, res) => {
  const statuses = db.prepare('SELECT status, COUNT(*) AS total FROM os GROUP BY status').all();
  const recentes = db.prepare(`SELECT o.id,o.numero,o.status,c.empresa AS cliente_nome,o.data_entrada
    FROM os o JOIN clientes c ON c.id=o.cliente_id ORDER BY o.id DESC LIMIT 8`).all();
  res.json({ statuses, recentes });
});
/* ---------- BI (Dashboard) ---------- */
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function mesLabel(m) {
  const p = String(m).split('-');
  return `${MESES_PT[Number(p[1]) - 1]}/${String(p[0]).slice(2)}`;
}
app.get('/api/bi', auth, requireProfile('admin'), (req, res) => {
  const { de, ate, cliente_id, tecnico_id } = req.query;
  const conds = ["o.data_encerramento IS NOT NULL"];
  const params = [];
  if (de) { conds.push('o.data_encerramento >= ?'); params.push(de + ' 00:00:00'); }
  if (ate) { conds.push('o.data_encerramento <= ?'); params.push(ate + ' 23:59:59'); }
  if (cliente_id) { conds.push('o.cliente_id = ?'); params.push(cliente_id); }
  if (tecnico_id) { conds.push('o.tecnico_id = ?'); params.push(tecnico_id); }
  const where = conds.join(' AND ');
  const rows = db.prepare(`SELECT o.*, c.empresa AS cliente_nome, u.nome AS tecnico_nome,
      (SELECT COALESCE(SUM(s.horas),0) FROM os_servicos s WHERE s.os_id=o.id AND s.garantia=1) AS horas_serv_gar,
      (SELECT COALESCE(SUM(s.horas),0) FROM os_servicos s WHERE s.os_id=o.id AND s.garantia=0) AS horas_serv_cob
    FROM os o JOIN clientes c ON c.id=o.cliente_id JOIN usuarios u ON u.id=o.tecnico_id
    WHERE ${where} ORDER BY o.data_encerramento`).all(...params);
  const kpis = { horas_garantia: 0, horas_cobranca: 0, horas_total: 0, valor_garantia: 0, valor_cobranca: 0, valor_total: 0, os_garantia: 0, os_cobranca: 0, os_total: rows.length };
  const mesesMap = new Map();
  const tecMap = new Map();
  const cliMap = new Map();
  for (const o of rows) {
    const hg = Number(o.horas_serv_gar) || 0;
    const hc = Number(o.horas_serv_cob) || 0;
    const vg = Number(o.valor_garantia) || 0;
    const vc = Number(o.valor_cobranca) || 0;
    kpis.horas_garantia += hg;
    kpis.horas_cobranca += hc;
    kpis.horas_total += hg + hc;
    kpis.valor_garantia += vg;
    kpis.valor_cobranca += vc;
    kpis.valor_total += vg + vc;
    if (o.tipo_assistencia === 'garantia') kpis.os_garantia++; else kpis.os_cobranca++;
    const mes = (o.data_encerramento || '').slice(0, 7);
    if (mes) {
      if (!mesesMap.has(mes)) mesesMap.set(mes, { mes, label: mesLabel(mes), horas_garantia: 0, horas_cobranca: 0, valor_garantia: 0, valor_cobranca: 0, os_garantia: 0, os_cobranca: 0, os_total: 0 });
      const m = mesesMap.get(mes);
      m.os_total++;
      m.horas_garantia += hg;
      m.horas_cobranca += hc;
      m.valor_garantia += vg;
      m.valor_cobranca += vc;
      if (o.tipo_assistencia === 'garantia') m.os_garantia++; else m.os_cobranca++;
    }
    if (!tecMap.has(o.tecnico_id)) tecMap.set(o.tecnico_id, { id: o.tecnico_id, nome: o.tecnico_nome, horas_garantia: 0, horas_cobranca: 0, horas_total: 0, valor_garantia: 0, valor_cobranca: 0, os_total: 0 });
    const t = tecMap.get(o.tecnico_id);
    t.horas_garantia += hg; t.horas_cobranca += hc; t.horas_total += hg + hc; t.valor_garantia += vg; t.valor_cobranca += vc; t.os_total++;
    if (!cliMap.has(o.cliente_id)) cliMap.set(o.cliente_id, { id: o.cliente_id, empresa: o.cliente_nome, valor_garantia: 0, valor_cobranca: 0, valor_total: 0, os_total: 0 });
    const c = cliMap.get(o.cliente_id);
    c.valor_garantia += vg; c.valor_cobranca += vc; c.valor_total += vg + vc; c.os_total++;
  }
  const meses = [...mesesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  const tecnicos = [...tecMap.values()].sort((a, b) => b.horas_total - a.horas_total);
  const clientes = [...cliMap.values()].sort((a, b) => b.valor_total - a.valor_total).slice(0, 10);
  // OS por origem — conta TODAS as OS com origem (não só encerradas)
  const origConds = ["origem_assistencia != ''", "status != 'cancelada'"];
  const origParams = [];
  if (de) { origConds.push('data_entrada >= ?'); origParams.push(de); }
  if (ate) { origConds.push('data_entrada <= ?'); origParams.push(ate); }
  if (cliente_id) { origConds.push('cliente_id = ?'); origParams.push(cliente_id); }
  if (tecnico_id) { origConds.push('tecnico_id = ?'); origParams.push(tecnico_id); }
  const porOrigem = db.prepare(`SELECT origem_assistencia AS origem, COUNT(*) AS os_total,
      COALESCE(SUM(valor_garantia + valor_cobranca),0) AS valor_total
    FROM os WHERE ${origConds.join(' AND ')}
    GROUP BY origem_assistencia ORDER BY os_total DESC`).all(...origParams);
  res.json({ kpis, meses, tecnicos, clientes, porOrigem });
});
/* ---------- Relatórios gerenciais ---------- */
function relatorioFiltros(de, ate, cliente_id, tecnico_id) {
  const conds = ["o.data_encerramento IS NOT NULL"];
  const params = [];
  if (de) { conds.push('o.data_encerramento >= ?'); params.push(de + ' 00:00:00'); }
  if (ate) { conds.push('o.data_encerramento <= ?'); params.push(ate + ' 23:59:59'); }
  if (cliente_id) { conds.push('o.cliente_id = ?'); params.push(cliente_id); }
  if (tecnico_id) { conds.push('o.tecnico_id = ?'); params.push(tecnico_id); }
  return { where: conds.join(' AND '), params };
}
function relatorioRows(filtros) {
  return db.prepare(`SELECT o.*, c.empresa AS cliente_nome, u.nome AS tecnico_nome,
      m.descricao AS maquina_descricao, m.numero_serie AS maquina_serie,
      (SELECT COALESCE(SUM(s.horas),0) FROM os_servicos s WHERE s.os_id=o.id AND s.garantia=1) AS horas_garantia,
      (SELECT COALESCE(SUM(s.horas),0) FROM os_servicos s WHERE s.os_id=o.id AND s.garantia=0) AS horas_cobranca
    FROM os o JOIN clientes c ON c.id=o.cliente_id JOIN usuarios u ON u.id=o.tecnico_id
    LEFT JOIN maquinas m ON m.id=o.maquina_id
    WHERE ${filtros.where} ORDER BY o.data_encerramento`).all(...filtros.params);
}
app.get('/api/relatorios/horas', auth, requireProfile('admin'), (req, res) => {
  const filtros = relatorioFiltros(req.query.de, req.query.ate, req.query.cliente_id, req.query.tecnico_id);
  const rows = relatorioRows(filtros).map(o => ({
    numero: o.numero,
    cliente: o.cliente_nome,
    tecnico: o.tecnico_nome,
    maquina: o.maquina_descricao || '',
    serie: o.maquina_serie || '',
    data_encerramento: o.data_encerramento,
    tipo_assistencia: o.tipo_assistencia,
    horas_apontadas: Number(o.horas_encerradas) || 0,
    horas_garantia: Number(o.horas_garantia) || 0,
    horas_cobranca: Number(o.horas_cobranca) || 0,
    horas_total: (Number(o.horas_garantia) || 0) + (Number(o.horas_cobranca) || 0),
    valor_garantia: Number(o.valor_garantia) || 0,
    valor_cobranca: Number(o.valor_cobranca) || 0,
    valor_total: (Number(o.valor_garantia) || 0) + (Number(o.valor_cobranca) || 0)
  }));
  const totais = rows.reduce((t, r) => {
    t.horas_apontadas += r.horas_apontadas;
    t.horas_garantia += r.horas_garantia;
    t.horas_cobranca += r.horas_cobranca;
    t.horas_total += r.horas_total;
    t.valor_garantia += r.valor_garantia;
    t.valor_cobranca += r.valor_cobranca;
    t.valor_total += r.valor_total;
    t.os_total++;
    return t;
  }, { horas_apontadas: 0, horas_garantia: 0, horas_cobranca: 0, horas_total: 0, valor_garantia: 0, valor_cobranca: 0, valor_total: 0, os_total: 0 });
  res.json({ rows, totais });
});
app.get('/api/relatorios/faturamento', auth, requireProfile('admin'), (req, res) => {
  const filtros = relatorioFiltros(req.query.de, req.query.ate, req.query.cliente_id, req.query.tecnico_id);
  const rows = relatorioRows(filtros).map(o => ({
    numero: o.numero,
    cliente: o.cliente_nome,
    tecnico: o.tecnico_nome,
    data_encerramento: o.data_encerramento,
    status: o.status,
    tipo_assistencia: o.tipo_assistencia,
    valor_garantia: Number(o.valor_garantia) || 0,
    valor_cobranca: Number(o.valor_cobranca) || 0,
    valor_total: (Number(o.valor_garantia) || 0) + (Number(o.valor_cobranca) || 0)
  }));
  const totais = rows.reduce((t, r) => {
    t.valor_garantia += r.valor_garantia;
    t.valor_cobranca += r.valor_cobranca;
    t.valor_total += r.valor_total;
    t.os_total++;
    return t;
  }, { valor_garantia: 0, valor_cobranca: 0, valor_total: 0, os_total: 0 });
  res.json({ rows, totais });
});
app.get('/api/relatorios/garantias', auth, requireProfile('admin'), (req, res) => {
  const filtros = relatorioFiltros(req.query.de, req.query.ate, req.query.cliente_id, req.query.tecnico_id);
  filtros.where += " AND o.tipo_assistencia='garantia'";
  const rows = relatorioRows(filtros).map(o => ({
    numero: o.numero,
    cliente: o.cliente_nome,
    tecnico: o.tecnico_nome,
    maquina: o.maquina_descricao || '',
    serie: o.maquina_serie || '',
    data_encerramento: o.data_encerramento,
    status: o.status,
    horas_apontadas: Number(o.horas_encerradas) || 0,
    horas_servicos: (Number(o.horas_garantia) || 0) + (Number(o.horas_cobranca) || 0),
    valor_garantia: Number(o.valor_garantia) || 0,
    valor_cobranca: Number(o.valor_cobranca) || 0,
    valor_total: (Number(o.valor_garantia) || 0) + (Number(o.valor_cobranca) || 0)
  }));
  const totais = rows.reduce((t, r) => {
    t.horas_apontadas += r.horas_apontadas;
    t.horas_servicos += r.horas_servicos;
    t.valor_garantia += r.valor_garantia;
    t.valor_cobranca += r.valor_cobranca;
    t.valor_total += r.valor_total;
    t.os_total++;
    return t;
  }, { horas_apontadas: 0, horas_servicos: 0, valor_garantia: 0, valor_cobranca: 0, valor_total: 0, os_total: 0 });
  res.json({ rows, totais });
});
// Relatório de OS por origem da assistência
app.get('/api/relatorios/origens', auth, requireProfile('admin'), (req, res) => {
  const { de, ate, cliente_id, tecnico_id } = req.query;
  const conds = ["o.origem_assistencia != ''", "o.status != 'cancelada'"];
  const params = [];
  if (de) { conds.push('o.data_entrada >= ?'); params.push(de); }
  if (ate) { conds.push('o.data_entrada <= ?'); params.push(ate); }
  if (cliente_id) { conds.push('o.cliente_id = ?'); params.push(cliente_id); }
  if (tecnico_id) { conds.push('o.tecnico_id = ?'); params.push(tecnico_id); }
  const rows = db.prepare(`SELECT o.origem_assistencia AS origem, COUNT(*) AS os_total,
      SUM(CASE WHEN o.tipo_assistencia='garantia' THEN 1 ELSE 0 END) AS os_garantia,
      SUM(CASE WHEN o.tipo_assistencia='cobranca' THEN 1 ELSE 0 END) AS os_cobranca,
      COALESCE(SUM(o.valor_garantia + o.valor_cobranca),0) AS valor_total
    FROM os o WHERE ${conds.join(' AND ')}
    GROUP BY o.origem_assistencia ORDER BY os_total DESC`).all(...params);
  const totais = rows.reduce((t, r) => {
    t.os_total += r.os_total; t.os_garantia += r.os_garantia; t.os_cobranca += r.os_cobranca;
    t.valor_total += Number(r.valor_total) || 0;
    return t;
  }, { os_total: 0, os_garantia: 0, os_cobranca: 0, valor_total: 0 });
  res.json({ rows, totais });
});
/* ---------- Clientes ---------- */
app.get('/api/clientes', auth, (req, res) => res.json(db.prepare('SELECT * FROM clientes ORDER BY empresa').all()));
app.post('/api/clientes', auth, (req, res) => {
  const b = req.body || {};
  if (!b.empresa) return res.status(400).json({ error: 'Informe a empresa' });
  const r = db.prepare(`INSERT INTO clientes (empresa,fantasia,contato,email,telefone,endereco,bairro,cidade,cep) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(b.empresa, b.fantasia || null, b.contato || null, b.email || null, b.telefone || null, b.endereco || null, b.bairro || null, b.cidade || null, b.cep || null);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/clientes/:id', auth, (req, res) => {
  const b = req.body || {};
  db.prepare(`UPDATE clientes SET empresa=?,fantasia=?,contato=?,email=?,telefone=?,endereco=?,bairro=?,cidade=?,cep=? WHERE id=?`)
    .run(b.empresa, b.fantasia || null, b.contato || null, b.email || null, b.telefone || null, b.endereco || null, b.bairro || null, b.cidade || null, b.cep || null, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/clientes/:id', auth, requireProfile('admin'), (req, res) => {
  db.prepare('DELETE FROM clientes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
/* ---------- Máquinas ---------- */
app.get('/api/maquinas', auth, (req, res) => {
  const { cliente_id } = req.query;
  const sql = cliente_id ? 'SELECT * FROM maquinas WHERE cliente_id=? ORDER BY descricao' : 'SELECT * FROM maquinas ORDER BY descricao';
  const params = cliente_id ? [cliente_id] : [];
  res.json(db.prepare(sql).all(...params));
});
app.post('/api/maquinas', auth, (req, res) => {
  const b = req.body || {};
  if (!b.cliente_id || !b.descricao) return res.status(400).json({ error: 'Informe cliente e descrição' });
  const r = db.prepare('INSERT INTO maquinas (cliente_id,descricao,numero_serie) VALUES (?,?,?)')
    .run(b.cliente_id, b.descricao, b.numero_serie || null);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/maquinas/:id', auth, (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE maquinas SET cliente_id=?,descricao=?,numero_serie=? WHERE id=?')
    .run(b.cliente_id, b.descricao, b.numero_serie || null, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/maquinas/:id', auth, requireProfile('admin'), (req, res) => {
  db.prepare('DELETE FROM maquinas WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
/* ---------- Catálogo de Serviços ---------- */
app.get('/api/catalogo-servicos', auth, (req, res) => res.json(db.prepare('SELECT * FROM catalogo_servicos ORDER BY descricao').all()));
app.post('/api/catalogo-servicos', auth, (req, res) => {
  const b = req.body || {};
  if (!b.codigo || !b.descricao) return res.status(400).json({ error: 'Informe código e descrição' });
  const r = db.prepare('INSERT INTO catalogo_servicos (codigo,descricao,unidade,valor_unitario) VALUES (?,?,?,?)')
    .run(b.codigo, b.descricao, b.unidade || 'h', Number(b.valor_unitario) || 0);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/catalogo-servicos/:id', auth, (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE catalogo_servicos SET codigo=?,descricao=?,unidade=?,valor_unitario=?,ativo=? WHERE id=?')
    .run(b.codigo, b.descricao, b.unidade || 'h', Number(b.valor_unitario) || 0, b.ativo ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
// Exclusão de serviço do catálogo — somente admin (desativa o serviço)
app.delete('/api/catalogo-servicos/:id', auth, requireProfile('admin'), (req, res) => {
  db.prepare('UPDATE catalogo_servicos SET ativo=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
/* ---------- Usuários ---------- */
app.get('/api/usuarios', auth, requireProfile('admin'), (req, res) =>
  res.json(db.prepare('SELECT id,nome,email,perfil,ativo,criado_em FROM usuarios ORDER BY nome').all()));
app.post('/api/usuarios', auth, requireProfile('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.nome || !b.email || !b.senha || !b.perfil) return res.status(400).json({ error: 'Preencha nome, e-mail, senha e perfil' });
  const r = db.prepare('INSERT INTO usuarios (nome,email,senha_hash,perfil) VALUES (?,?,?,?)')
    .run(b.nome, String(b.email).toLowerCase().trim(), bcrypt.hashSync(b.senha, 10), b.perfil);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/usuarios/:id', auth, requireProfile('admin'), (req, res) => {
  const b = req.body || {};
  if (b.senha) {
    db.prepare('UPDATE usuarios SET nome=?,email=?,perfil=?,ativo=?,senha_hash=? WHERE id=?')
      .run(b.nome, String(b.email).toLowerCase().trim(), b.perfil, b.ativo ? 1 : 0, bcrypt.hashSync(b.senha, 10), req.params.id);
  } else {
    db.prepare('UPDATE usuarios SET nome=?,email=?,perfil=?,ativo=? WHERE id=?')
      .run(b.nome, String(b.email).toLowerCase().trim(), b.perfil, b.ativo ? 1 : 0, req.params.id);
  }
  res.json({ ok: true });
});
app.delete('/api/usuarios/:id', auth, requireProfile('admin'), (req, res) => {
  db.prepare('UPDATE usuarios SET ativo=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
/* ---------- Ordens de Serviço ---------- */
app.get('/api/os', auth, (req, res) => {
  const { status, cliente_id, tecnico_id, q } = req.query;
  let sql = `SELECT o.*, c.empresa AS cliente_nome, u.nome AS tecnico_nome,
      (SELECT COALESCE(SUM(valor_total),0) FROM os_materiais m WHERE m.os_id=o.id) AS total_pecas,
      (SELECT COALESCE(SUM(valor_total),0) FROM os_servicos s WHERE s.os_id=o.id) AS total_servicos
    FROM os o JOIN clientes c ON c.id=o.cliente_id JOIN usuarios u ON u.id=o.tecnico_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND o.status=?'; params.push(status); }
  if (cliente_id) { sql += ' AND o.cliente_id=?'; params.push(cliente_id); }
  if (tecnico_id) { sql += ' AND o.tecnico_id=?'; params.push(tecnico_id); }
  if (q) { sql += ' AND (o.numero LIKE ? OR c.empresa LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY o.id DESC';
  res.json(db.prepare(sql).all(...params));
});
app.post('/api/os', auth, requireProfile('tecnico', 'revisor', 'admin'), (req, res) => {
  const b = req.body || {};
  if (!b.cliente_id) return res.status(400).json({ error: 'Informe o cliente' });
  const numero = nextNumero();
  const r = db.prepare(`INSERT INTO os (numero,cliente_id,maquina_id,tecnico_id,status,data_entrada,assunto,defeito,servico_realizado,observacoes,solicitante,tipo_assistencia)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    numero, b.cliente_id, b.maquina_id || null, req.user.id, 'rascunho',
    b.data_entrada || new Date().toISOString().slice(0, 10),
    b.assunto || null, b.defeito || null, b.servico_realizado || null, b.observacoes || null,
    b.solicitante || null, b.tipo_assistencia === 'garantia' ? 'garantia' : 'cobranca');
  addHistorico(r.lastInsertRowid, null, 'rascunho', 'OS criada', req.user.id);
  res.json({ id: r.lastInsertRowid, numero });
});
app.get('/api/os/:id', auth, (req, res) => {
  const os = db.prepare('SELECT * FROM os WHERE id=?').get(req.params.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  const cliente = db.prepare('SELECT * FROM clientes WHERE id=?').get(os.cliente_id);
  const maquina = os.maquina_id ? db.prepare('SELECT * FROM maquinas WHERE id=?').get(os.maquina_id) : null;
  const tecnico = db.prepare('SELECT id,nome,email FROM usuarios WHERE id=?').get(os.tecnico_id);
  const materiais = db.prepare('SELECT * FROM os_materiais WHERE os_id=? ORDER BY id').all(os.id);
  const servicos = db.prepare('SELECT * FROM os_servicos WHERE os_id=? ORDER BY id').all(os.id);
  const horas = db.prepare('SELECT * FROM os_horas WHERE os_id=? ORDER BY id').all(os.id);
  const vistos = db.prepare('SELECT * FROM vistos WHERE os_id=?').all(os.id);
  const historico = db.prepare(`SELECT h.*, u.nome AS usuario_nome FROM historico h
    LEFT JOIN usuarios u ON u.id=h.usuario_id WHERE h.os_id=? ORDER BY h.id DESC`).all(os.id);
  res.json({ os, cliente, maquina, tecnico, materiais, servicos, horas, vistos, historico });
});
app.put('/api/os/:id', auth, (req, res) => {
  const os = db.prepare('SELECT * FROM os WHERE id=?').get(req.params.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  const pode = ['admin', 'revisor'].includes(req.user.perfil) || (req.user.perfil === 'tecnico' && os.tecnico_id === req.user.id);
  if (!pode) return res.status(403).json({ error: 'Sem permissão para editar esta OS' });
  const b = req.body || {};
  db.prepare(`UPDATE os SET cliente_id=?,maquina_id=?,assunto=?,defeito=?,servico_realizado=?,observacoes=?,solicitante=?,tipo_assistencia=?,data_entrada=?,atualizado_em=? WHERE id=?`)
    .run(b.cliente_id || os.cliente_id, b.maquina_id || os.maquina_id, b.assunto ?? os.assunto, b.defeito ?? os.defeito,
      b.servico_realizado ?? os.servico_realizado, b.observacoes ?? os.observacoes, b.solicitante ?? os.solicitante,
      b.tipo_assistencia === 'garantia' ? 'garantia' : (os.tipo_assistencia || 'cobranca'), b.data_entrada || os.data_entrada, now(), os.id);
  res.json({ ok: true });
});
// Salvar origem da assistência (revisor/admin)
app.put('/api/os/:id/origem', auth, requireProfile('revisor', 'admin'), (req, res) => {
  const os = db.prepare('SELECT * FROM os WHERE id=?').get(req.params.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  const origem = ((req.body && req.body.origem) || '').trim();
  db.prepare('UPDATE os SET origem_assistencia=? WHERE id=?').run(origem, req.params.id);
  addHistorico(os.id, os.status, os.status, origem ? 'Origem da assistência: ' + origem : 'Origem da assistência removida', req.user.id);
  res.json({ ok: true });
});
app.post('/api/os/:id/status', auth, (req, res) => {
  const os = db.prepare('SELECT * FROM os WHERE id=?').get(req.params.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  const { status, observacao } = req.body || {};
  if (!STATUS_FLOW[os.status] || !STATUS_FLOW[os.status].includes(status)) {
    return res.status(400).json({ error: `Transição de ${os.status} para ${status} não permitida` });
  }
  const perms = {
    'rascunho->em_revisao': ['tecnico', 'admin'],
    'em_revisao->rascunho': ['revisor', 'admin'],
    'aguardando_cliente->aprovada': ['revisor', 'comercial', 'admin'],
    'aguardando_cliente->em_revisao': ['revisor', 'admin'],
    'aprovada->cobrada': ['comercial', 'admin'],
    'cobrada->recebida': ['revisor', 'admin'],
    '->cancelada': ['admin']
  };
  const key = `${os.status}->${status}`;
  const allowed = perms[key] || perms['->cancelada'];
  if (!allowed || !allowed.includes(req.user.perfil)) {
    return res.status(403).json({ error: 'Sem permissão para esta transição' });
  }
  if (status === 'em_revisao' && os.status === 'rascunho') {
    db.prepare("INSERT INTO vistos (os_id,tipo,status) VALUES (?, 'revisor','pendente')").run(os.id);
    db.prepare('UPDATE os SET data_hora_em_revisao=? WHERE id=?').run(now(), os.id);
  }
  if (status === 'aprovada') {
    const v = db.prepare("SELECT 1 FROM vistos WHERE os_id=? AND tipo='cliente'").get(os.id);
    if (v) db.prepare("UPDATE vistos SET status='aprovado', data_hora=? WHERE os_id=? AND tipo='cliente'").run(now(), os.id);
    else db.prepare("INSERT INTO vistos (os_id,tipo,status,data_hora) VALUES (?, 'cliente','aprovado',?)").run(os.id, now());
  }
  db.prepare('UPDATE os SET status=?, atualizado_em=? WHERE id=?').run(status, now(), os.id);
  addHistorico(os.id, os.status, status, observacao, req.user.id);
  if (status === 'em_revisao' && os.status === 'rascunho') {
    notifyNovaOS(db.prepare('SELECT * FROM os WHERE id=?').get(os.id));
  }
  res.json({ ok: true });
});
app.post('/api/os/:id/enviar', auth, requireProfile('revisor', 'admin'), (req, res) => {
  const os = db.prepare('SELECT * FROM os WHERE id=?').get(req.params.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  if (os.status !== 'em_revisao') return res.status(400).json({ error: 'A OS precisa estar em revisão para ser enviada' });
  const pendentes = db.prepare("SELECT COUNT(*) AS c FROM os_materiais WHERE os_id=? AND status_normalizacao='pendente'").get(os.id).c;
  const semValor = db.prepare('SELECT COUNT(*) AS c FROM os_materiais WHERE os_id=? AND (valor_unitario IS NULL OR valor_unitario<=0)').get(os.id).c;
  if (pendentes + semValor > 0) {
    return res.status(400).json({ error: `Envio bloqueado: ${pendentes + semValor} item(ns) de material sem código/valor normalizado` });
  }
  // Congela os valores e horas no momento do envio ao cliente (valor de encerramento)
  const vGarantia = db.prepare("SELECT COALESCE(SUM(valor_total),0) AS t FROM os_materiais WHERE os_id=? AND garantia=1").get(os.id).t
    + db.prepare("SELECT COALESCE(SUM(valor_total),0) AS t FROM os_servicos WHERE os_id=? AND garantia=1").get(os.id).t;
  const vCobranca = db.prepare("SELECT COALESCE(SUM(valor_total),0) AS t FROM os_materiais WHERE os_id=? AND garantia=0").get(os.id).t
    + db.prepare("SELECT COALESCE(SUM(valor_total),0) AS t FROM os_servicos WHERE os_id=? AND garantia=0").get(os.id).t;
  const horas = db.prepare(`SELECT tempo_total FROM os_horas WHERE os_id=? AND tempo_total IS NOT NULL AND tempo_total != ''`).all(os.id)
    .reduce((s, h) => {
      const p = h.tempo_total.split(':').map(Number);
      return s + (p[0] || 0) + (p[1] || 0) / 60;
    }, 0);
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(`UPDATE os SET status='aguardando_cliente', data_hora_envio=?, token_aprovacao=?, atualizado_em=?,
      valor_garantia=?, valor_cobranca=?, horas_encerradas=?, data_encerramento=? WHERE id=?`)
    .run(now(), token, now(), vGarantia, vCobranca, horas, now(), os.id);
  db.prepare("INSERT INTO vistos (os_id,tipo,status) VALUES (?, 'cliente','pendente')").run(os.id);
  addHistorico(os.id, os.status, 'aguardando_cliente', 'Relatório enviado ao cliente', req.user.id);
  const cliente = db.prepare('SELECT * FROM clientes WHERE id=?').get(os.cliente_id);
  const link = `${process.env.APP_URL || 'http://localhost:3000'}/#/aprovacao/${token}`;
  const b = req.body || {};
  const emailsCliente = (b.emails || '').split(',').map(e => e.trim()).filter(Boolean);
  notifyEnvioCliente(db.prepare('SELECT * FROM os WHERE id=?').get(os.id), cliente, link, emailsCliente);
  res.json({ ok: true, link });
});
// Reenviar e-mail ao cliente (revisor/admin) — mesmo link de aprovação
app.post('/api/os/:id/reenviar', auth, requireProfile('revisor', 'admin'), (req, res) => {
  const os = db.prepare('SELECT * FROM os WHERE id=?').get(req.params.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  if (os.status !== 'aguardando_cliente') {
    return res.status(400).json({ error: 'Só é possível reenviar o e-mail enquanto a OS aguarda aprovação do cliente' });
  }
  if (!os.token_aprovacao) {
    return res.status(400).json({ error: 'Esta OS ainda não foi enviada ao cliente' });
  }
  const cliente = db.prepare('SELECT * FROM clientes WHERE id=?').get(os.cliente_id);
  const link = `${process.env.APP_URL || 'http://localhost:3000'}/#/aprovacao/${os.token_aprovacao}`;
  const b = req.body || {};
  const emailsCliente = (b.emails || '').split(',').map(e => e.trim()).filter(Boolean);
  notifyEnvioCliente(os, cliente, link, emailsCliente);
  addHistorico(os.id, os.status, os.status, 'Relatório reenviado ao cliente', req.user.id);
  res.json({ ok: true, link });
});
/* ---------- Aprovação pública do cliente ---------- */
app.get('/api/public/os/:token', (req, res) => {
  const os = db.prepare('SELECT * FROM os WHERE token_aprovacao=?').get(req.params.token);
  if (!os) return res.status(404).json({ error: 'Link de aprovação inválido' });
  const cliente = db.prepare('SELECT empresa FROM clientes WHERE id=?').get(os.cliente_id);
  const total = (os.valor_cobranca || 0) + (os.valor_garantia || 0);
  res.json({ os: { numero: os.numero, cliente: cliente.empresa, status: os.status, total } });
});
app.post('/api/public/os/:token/aprovar', (req, res) => {
  const os = db.prepare('SELECT * FROM os WHERE token_aprovacao=?').get(req.params.token);
  if (!os) return res.status(404).json({ error: 'Link de aprovação inválido' });
  if (os.status !== 'aguardando_cliente') return res.status(400).json({ error: 'Esta OS não está aguardando aprovação' });
  db.prepare("UPDATE os SET status='aprovada', atualizado_em=? WHERE id=?").run(now(), os.id);
  db.prepare("UPDATE vistos SET status='aprovado', data_hora=? WHERE os_id=? AND tipo='cliente'").run(now(), os.id);
  addHistorico(os.id, os.status, 'aprovada', 'Aprovada pelo cliente (link de aprovação)', null);
  const cliente = db.prepare('SELECT * FROM clientes WHERE id=?').get(os.cliente_id);
  notifyAprovacaoCliente(db.prepare('SELECT * FROM os WHERE id=?').get(os.id), cliente);
  res.json({ ok: true });
});
/* ---------- Itens da OS ---------- */
app.post('/api/os/:id/materiais', auth, requireProfile('tecnico', 'revisor', 'admin'), (req, res) => {
  const b = req.body || {};
  if (!b.descricao_tecnico) return res.status(400).json({ error: 'Descreva o material' });
  db.prepare('INSERT INTO os_materiais (os_id,descricao_tecnico,quantidade,unidade,garantia) VALUES (?,?,?,?,?)')
    .run(req.params.id, b.descricao_tecnico, Number(b.quantidade) || 1, b.unidade || 'un', b.garantia ? 1 : 0);
  res.json({ ok: true });
});
app.put('/api/os/:id/materiais/:mid', auth, requireProfile('revisor', 'admin'), (req, res) => {
  const item = db.prepare('SELECT * FROM os_materiais WHERE id=? AND os_id=?').get(req.params.mid, req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });
  const b = req.body || {};
  const valor = Number(b.valor_unitario ?? item.valor_unitario ?? 0);
  const qtd = Number(b.quantidade ?? item.quantidade ?? 1);
  db.prepare(`UPDATE os_materiais SET codigo_erp=?,descricao_erp=?,valor_unitario=?,quantidade=?,unidade=?,garantia=?,valor_total=?,status_normalizacao='normalizado' WHERE id=?`)
    .run(b.codigo_erp || null, b.descricao_erp || null, valor, qtd, b.unidade || item.unidade || 'un', b.garantia ? 1 : 0, valor * qtd, item.id);
  res.json({ ok: true });
});
app.delete('/api/os/:id/materiais/:mid', auth, requireProfile('tecnico', 'revisor', 'admin'), (req, res) => {
  db.prepare('DELETE FROM os_materiais WHERE id=? AND os_id=?').run(req.params.mid, req.params.id);
  res.json({ ok: true });
});
app.post('/api/os/:id/servicos', auth, requireProfile('tecnico', 'revisor', 'admin'), (req, res) => {
  const b = req.body || {};
  const cat = db.prepare('SELECT * FROM catalogo_servicos WHERE id=? AND ativo=1').get(b.catalogo_id);
  if (!cat) return res.status(400).json({ error: 'Serviço do catálogo inválido' });
  const horas = Number(b.horas) || 1;
  db.prepare('INSERT INTO os_servicos (os_id,catalogo_id,descricao,horas,valor_unitario,valor_total,garantia) VALUES (?,?,?,?,?,?,?)')
    .run(req.params.id, cat.id, cat.descricao, horas, cat.valor_unitario, cat.valor_unitario * horas, b.garantia ? 1 : 0);
  res.json({ ok: true });
});
// Atualizar serviço da OS (usado pelo botão Salvar OS para o checkbox de garantia)
app.put('/api/os/:id/servicos/:sid', auth, requireProfile('revisor', 'admin'), (req, res) => {
  const item = db.prepare('SELECT * FROM os_servicos WHERE id=? AND os_id=?').get(req.params.sid, req.params.id);
  if (!item) return res.status(404).json({ error: 'Serviço não encontrado' });
  const b = req.body || {};
  const horas = Number(b.horas ?? item.horas ?? 1);
  const valorUnit = Number(b.valor_unitario ?? item.valor_unitario ?? 0);
  db.prepare('UPDATE os_servicos SET descricao=?,horas=?,valor_unitario=?,valor_total=?,garantia=? WHERE id=? AND os_id=?')
    .run(b.descricao ?? item.descricao, horas, valorUnit, valorUnit * horas, b.garantia ? 1 : 0, req.params.sid, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/os/:id/servicos/:sid', auth, requireProfile('tecnico', 'revisor', 'admin'), (req, res) => {
  db.prepare('DELETE FROM os_servicos WHERE id=? AND os_id=?').run(req.params.sid, req.params.id);
  res.json({ ok: true });
});
app.post('/api/os/:id/horas', auth, (req, res) => {
  const b = req.body || {};
  if (!b.colaborador) return res.status(400).json({ error: 'Informe o colaborador' });
  let tempo = '';
  if (b.entrada && b.saida) {
    const [h1, m1] = b.entrada.split(':').map(Number);
    const [h2, m2] = b.saida.split(':').map(Number);
    let diff = h2 * 60 + m2 - (h1 * 60 + m1);
    if (diff < 0) diff += 1440;
    tempo = String(Math.floor(diff / 60)).padStart(2, '0') + ':' + String(diff % 60).padStart(2, '0') + ':00';
  }
  db.prepare('INSERT INTO os_horas (os_id,data,colaborador,entrada,saida,tempo_total) VALUES (?,?,?,?,?,?)')
    .run(req.params.id, b.data || null, b.colaborador, b.entrada || null, b.saida || null, tempo);
  res.json({ ok: true });
});
app.put('/api/os/:id/horas/:hid', auth, (req, res) => {
  const item = db.prepare('SELECT * FROM os_horas WHERE id=? AND os_id=?').get(req.params.hid, req.params.id);
  if (!item) return res.status(404).json({ error: 'Registro não encontrado' });
  const b = req.body || {};
  let tempo = item.tempo_total || '';
  const entrada = b.entrada ?? item.entrada;
  const saida = b.saida ?? item.saida;
  if (entrada && saida) {
    const [h1, m1] = entrada.split(':').map(Number);
    const [h2, m2] = saida.split(':').map(Number);
    let diff = h2 * 60 + m2 - (h1 * 60 + m1);
    if (diff < 0) diff += 1440;
    tempo = String(Math.floor(diff / 60)).padStart(2, '0') + ':' + String(diff % 60).padStart(2, '0') + ':00';
  }
  db.prepare('UPDATE os_horas SET data=?,colaborador=?,entrada=?,saida=?,tempo_total=? WHERE id=? AND os_id=?')
    .run(b.data ?? item.data, b.colaborador ?? item.colaborador, entrada, saida, tempo, req.params.hid, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/os/:id/horas/:hid', auth, (req, res) => {
  db.prepare('DELETE FROM os_horas WHERE id=? AND os_id=?').run(req.params.hid, req.params.id);
  res.json({ ok: true });
});
/* ---------- Relatório ---------- */
app.get('/api/report/:id', auth, (req, res) => {
  const html = generateReportHTML(req.params.id);
  if (!html) return res.status(404).json({ error: 'OS não encontrada' });
  res.send(html);
});
/* ---------- Notificações ---------- */
app.get('/api/notificacoes', auth, requireProfile('admin', 'revisor'), (req, res) =>
  res.json(db.prepare('SELECT * FROM notificacoes ORDER BY id DESC LIMIT 200').all()));
/* ---------- Início ---------- */
const { init } = require('./db');
init().then(() => {
  startReminderJob();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Ercomaq OS rodando em http://localhost:${PORT}`));
}).catch(err => {
  console.error('Erro ao iniciar o banco de dados:', err);
  process.exit(1);
});