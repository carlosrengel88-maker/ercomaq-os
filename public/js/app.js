const STATUS = {
  rascunho: { label: 'Rascunho', cor: '#64748b' },
  em_revisao: { label: 'Em revisão', cor: '#f59e0b' },
  aguardando_cliente: { label: 'Aguardando cliente', cor: '#3b82f6' },
  aprovada: { label: 'Aprovada', cor: '#10b981' },
  cobrada: { label: 'Cobrada', cor: '#8b5cf6' },
  recebida: { label: 'Recebida', cor: '#06b6d4' },
  cancelada: { label: 'Cancelada', cor: '#ef4444' }
};
const PERFIS = { admin: 'Administrador', revisor: 'Revisor', tecnico: 'Técnico', comercial: 'Comercial' };
const ORIGENS = ['Problema de engenharia', 'Problema de usinagem', 'Problema de montagem', 'Problema de fornecedor', 'Problema elétrico', 'Problema mecânico', 'Problema eletrônico', 'Problema hidráulico', 'Problema pneumático', 'Problema de software / calibração', 'Problema de operação / uso indevido', 'Desgaste natural', 'Problema de instalação / transporte'];
let currentOsId = null;
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(v) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtDate(s) { if (!s) return ''; return new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR'); }
function fmtDateTime(s) { if (!s) return ''; return new Date(s + 'Z').toLocaleString('pt-BR'); }
function statusBadge(st) { const s = STATUS[st] || { label: st, cor: '#64748b' }; return `<span class="badge" style="background:${s.cor}">${s.label}</span>`; }
function can(...perfis) { return state.user && perfis.includes(state.user.perfil); }
function openModal(title, html) {
  const m = document.getElementById('modal');
  m.innerHTML = `<div class="modal-back"><div class="modal">
    <div class="modal-head"><h3>${title}</h3><button class="modal-close" onclick="closeModal()" title="Fechar">✕</button></div>
    <div class="modal-body">${html}</div>
  </div></div>`;
  m.style.display = 'block';
}
function closeModal() { document.getElementById('modal').style.display = 'none'; }
const state = { user: null };
function loginHTML() {
  return `<div class="login-page"><div class="login-card">
    <h1>ERCOMAQ</h1><p class="muted" style="text-align:center">Ordens de Serviço</p>
    <form onsubmit="doLogin(event)">
      <div class="form">
        <label>E-mail</label><input id="loginEmail" type="email" required placeholder="seu@email.com">
        <label>Senha</label><input id="loginSenha" type="password" required>
        <div class="row"><button class="btn btn-primary" style="width:100%">Entrar</button></div>
      </div>
    </form>
  </div></div>`;
}
async function doLogin(e) {
  e.preventDefault();
  try {
    const d = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('loginEmail').value, senha: document.getElementById('loginSenha').value }) });
    localStorage.setItem('token', d.token);
    state.user = d.user;
    location.hash = '#/';
    render();
  } catch (err) { alert(err.message); }
}
function logout() { localStorage.removeItem('token'); state.user = null; location.hash = '#/login'; render(); }
function layoutHTML() {
  const u = state.user;
  const h = location.hash.slice(1) || '/';
  const nav = `
    ${can('admin') ? `<a href="#/" class="${h === '/' ? 'active' : ''}">📊 Painel</a>` : ''}
    ${can('admin') ? `<a href="#/relatorios" class="${h.startsWith('/relatorios') ? 'active' : ''}">📈 Relatórios</a>` : ''}
    <a href="#/os" class="${h.startsWith('/os') && !h.startsWith('/os-form') ? 'active' : ''}">📋 Ordens de Serviço</a>
    <a href="#/clientes" class="${h.startsWith('/clientes') ? 'active' : ''}">🏢 Clientes</a>
    <a href="#/maquinas" class="${h.startsWith('/maquinas') ? 'active' : ''}">⚙️ Máquinas</a>
    ${can('admin') ? `<a href="#/usuarios" class="${h.startsWith('/usuarios') ? 'active' : ''}">👥 Usuários</a>` : ''}
    <a href="#/catalogo" class="${h.startsWith('/catalogo') ? 'active' : ''}">💰 Catálogo de Serviços</a>
    ${can('admin', 'revisor') ? `<a href="#/notificacoes" class="${h.startsWith('/notificacoes') ? 'active' : ''}">📧 Notificações</a>` : ''}`;
  return `<div class="layout">
    <aside class="sidebar">
      <div class="logo"><strong>ERCOMAQ</strong><span>Ordens de Serviço</span></div>
      <nav>${nav}</nav>
      <div class="user-box"><div><strong>${esc(u.nome)}</strong><span>${PERFIS[u.perfil]}</span></div><button class="btn btn-ghost" onclick="logout()">Sair</button></div>
    </aside>
    <main class="main"><div id="view"></div></main>
  </div>`;
}
async function render() {
  const h = location.hash.slice(1) || '/';
  if (h.startsWith('/aprovacao/')) { document.getElementById('app').innerHTML = ''; renderAprovacaoPublica(h.split('/')[2]); return; }
  if (!state.user && localStorage.getItem('token')) {
    try { state.user = await api('/auth/me'); } catch (e) { logout(); }
  }
  if (!state.user) { document.getElementById('app').innerHTML = loginHTML(); return; }
  document.getElementById('app').innerHTML = layoutHTML();
  if (h.startsWith('/os-form')) return renderOsForm(new URLSearchParams(h.split('?')[1] || '').get('id'));
  if (h.startsWith('/os/')) return renderOsDetail(h.split('/')[2]);
  if (h.startsWith('/os')) return renderOsList();
  if (h.startsWith('/relatorios') && !can('admin')) { location.hash = '#/os'; return; }
  if (h.startsWith('/clientes')) return renderClientes();
  if (h.startsWith('/maquinas')) return renderMaquinas();
  if (h.startsWith('/usuarios')) return renderUsuarios();
  if (h.startsWith('/catalogo')) return renderCatalogo();
  if (h.startsWith('/notificacoes')) return renderNotificacoes();
  if (h === '/' && !can('admin')) { location.hash = '#/os'; return; }
  return renderDashboard();
}
/* ---------- Painel (BI) ---------- */
let biCharts = {};
function destroyBiCharts() {
  Object.values(biCharts).forEach(c => { try { c.destroy(); } catch (e) {} });
  biCharts = {};
}
function fmtH(v) {
  return (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
}
function biPeriodoPadrao() {
  const hoje = new Date();
  const de = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
  const fmt = d => d.toISOString().slice(0, 10);
  return { de: fmt(de), ate: fmt(hoje) };
}
async function renderDashboard() {
  const v = document.getElementById('view');
  v.innerHTML = '<p class="muted">Carregando…</p>';
  const [clientes, osList] = await Promise.all([api('/clientes'), api('/os')]);
  const tecnicos = [...new Map(osList.map(o => [o.tecnico_id, { id: o.tecnico_id, nome: o.tecnico_nome }])).values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const p = biPeriodoPadrao();
  v.innerHTML = `<h1>Painel — BI</h1>
    <div class="bi-filtros">
      <label>De <input id="biDe" type="date" value="${p.de}"></label>
      <label>Até <input id="biAte" type="date" value="${p.ate}"></label>
      <label>Cliente <select id="biCliente"><option value="">Todos</option>${clientes.map(c => `<option value="${c.id}">${esc(c.empresa)}</option>`).join('')}</select></label>
      <label>Técnico <select id="biTecnico"><option value="">Todos</option>${tecnicos.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('')}</select></label>
      <button class="btn btn-primary" onclick="carregarBI()">Filtrar</button>
    </div>
    <div id="biKpis"></div>
    <div class="chart-grid" id="biCharts"></div>`;
  await carregarBI();
}
async function carregarBI() {
  const params = new URLSearchParams();
  const de = document.getElementById('biDe').value;
  const ate = document.getElementById('biAte').value;
  const cl = document.getElementById('biCliente').value;
  const tec = document.getElementById('biTecnico').value;
  if (de) params.set('de', de);
  if (ate) params.set('ate', ate);
  if (cl) params.set('cliente_id', cl);
  if (tec) params.set('tecnico_id', tec);
  const d = await api('/bi?' + params.toString());
  const k = d.kpis;
  document.getElementById('biKpis').innerHTML = `<div class="kpis">
    <div class="card kpi"><span class="badge" style="background:#1e293b">Total de horas</span><strong>${fmtH(k.horas_total)}</strong></div>
    <div class="card kpi"><span class="badge" style="background:#f59e0b">Horas em garantia</span><strong>${fmtH(k.horas_garantia)}</strong></div>
    <div class="card kpi"><span class="badge" style="background:#2563eb">Horas para cobrança</span><strong>${fmtH(k.horas_cobranca)}</strong></div>
    <div class="card kpi"><span class="badge" style="background:#f59e0b">Valor em garantia</span><strong>${money(k.valor_garantia)}</strong></div>
    <div class="card kpi"><span class="badge" style="background:#2563eb">Valor para cobrança</span><strong>${money(k.valor_cobranca)}</strong></div>
    <div class="card kpi"><span class="badge" style="background:#10b981">OS enviadas</span><strong>${k.os_total}</strong><span class="muted" style="font-size:11px">${k.os_garantia} garantia · ${k.os_cobranca} cobrança</span></div>
  </div>`;
  const box = document.getElementById('biCharts');
  box.innerHTML = `
    <div class="chart-box"><h3>Distribuição de horas</h3><canvas id="biChartDonut"></canvas></div>
    <div class="chart-box"><h3>Horas por mês</h3><canvas id="biChartHorasMes"></canvas></div>
    <div class="chart-box"><h3>Valores por mês</h3><canvas id="biChartValoresMes"></canvas></div>
    <div class="chart-box"><h3>Horas por técnico</h3><canvas id="biChartTecnicos"></canvas></div>
    <div class="chart-box"><h3>Top clientes por valor</h3><canvas id="biChartClientes"></canvas></div>
    <div class="chart-box"><h3>OS por mês (total × garantia × cobrança)</h3><canvas id="biChartTendencia"></canvas></div>
    <div class="chart-box"><h3>OS por origem da assistência</h3><canvas id="biChartOrigem"></canvas></div>`;
  if (typeof Chart === 'undefined') {
    box.innerHTML = '<p class="warn">⚠️ Chart.js não carregado. Verifique se o arquivo <b>js/chart.umd.min.js</b> existe em public/js.</p>';
    return;
  }
  destroyBiCharts();
  const COR_G = '#f59e0b', COR_C = '#2563eb';
  const labelsMes = d.meses.map(m => m.label);
  biCharts.donut = new Chart(document.getElementById('biChartDonut'), {
    type: 'doughnut',
    data: { labels: ['Garantia', 'Cobrança'], datasets: [{ data: [k.horas_garantia, k.horas_cobranca], backgroundColor: [COR_G, COR_C] }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
  biCharts.horasMes = new Chart(document.getElementById('biChartHorasMes'), {
    type: 'bar',
    data: { labels: labelsMes, datasets: [
      { label: 'Garantia', data: d.meses.map(m => m.horas_garantia), backgroundColor: COR_G },
      { label: 'Cobrança', data: d.meses.map(m => m.horas_cobranca), backgroundColor: COR_C }
    ] },
    options: { scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' } } }
  });
  biCharts.valoresMes = new Chart(document.getElementById('biChartValoresMes'), {
    type: 'bar',
    data: { labels: labelsMes, datasets: [
      { label: 'Garantia', data: d.meses.map(m => m.valor_garantia), backgroundColor: COR_G },
      { label: 'Cobrança', data: d.meses.map(m => m.valor_cobranca), backgroundColor: COR_C }
    ] },
    options: { scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + money(ctx.parsed.y) } } } }
  });
  biCharts.tecnicos = new Chart(document.getElementById('biChartTecnicos'), {
    type: 'bar',
    data: { labels: d.tecnicos.map(t => t.nome), datasets: [
      { label: 'Garantia', data: d.tecnicos.map(t => t.horas_garantia), backgroundColor: COR_G },
      { label: 'Cobrança', data: d.tecnicos.map(t => t.horas_cobranca), backgroundColor: COR_C }
    ] },
    options: { indexAxis: 'y', scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' } } }
  });
  biCharts.clientes = new Chart(document.getElementById('biChartClientes'), {
    type: 'bar',
    data: { labels: d.clientes.map(c => c.empresa), datasets: [
      { label: 'Garantia', data: d.clientes.map(c => c.valor_garantia), backgroundColor: COR_G },
      { label: 'Cobrança', data: d.clientes.map(c => c.valor_cobranca), backgroundColor: COR_C }
    ] },
    options: { indexAxis: 'y', scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + money(ctx.parsed.x) } } } }
  });
  biCharts.tendencia = new Chart(document.getElementById('biChartTendencia'), {
    type: 'line',
    data: { labels: labelsMes, datasets: [
      { label: 'Total', data: d.meses.map(m => m.os_total), borderColor: '#1e293b', backgroundColor: '#1e293b', fill: false, tension: 0.3 },
      { label: 'Garantia', data: d.meses.map(m => m.os_garantia), borderColor: COR_G, backgroundColor: COR_G, fill: false, tension: 0.3 },
      { label: 'Cobrança', data: d.meses.map(m => m.os_cobranca), borderColor: COR_C, backgroundColor: COR_C, fill: false, tension: 0.3 }
    ] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
  biCharts.origem = new Chart(document.getElementById('biChartOrigem'), {
    type: 'bar',
    data: { labels: (d.porOrigem || []).map(p => p.origem), datasets: [{ label: 'OS', data: (d.porOrigem || []).map(p => p.os_total), backgroundColor: COR_G }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } } }
  });
}
/* ---------- Relatórios gerenciais ---------- */
let relAbaAtiva = 'horas';
let relDados = null;
function relFiltrosParams() {
  const params = new URLSearchParams();
  const de = document.getElementById('relDe').value;
  const ate = document.getElementById('relAte').value;
  const cl = document.getElementById('relCliente').value;
  const tec = document.getElementById('relTecnico').value;
  if (de) params.set('de', de);
  if (ate) params.set('ate', ate);
  if (cl) params.set('cliente_id', cl);
  if (tec) params.set('tecnico_id', tec);
  return params;
}
function relPeriodoPadrao() {
  const hoje = new Date();
  const de = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
  const fmt = d => d.toISOString().slice(0, 10);
  return { de: fmt(de), ate: fmt(hoje) };
}
function relTipoLabel(t) {
  return t === 'garantia' ? 'Garantia' : 'Cobrança';
}
async function renderRelatorios() {
  const v = document.getElementById('view');
  v.innerHTML = '<p class="muted">Carregando…</p>';
  const [clientes, osList] = await Promise.all([api('/clientes'), api('/os')]);
  const tecnicos = [...new Map(osList.map(o => [o.tecnico_id, { id: o.tecnico_id, nome: o.tecnico_nome }])).values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const p = relPeriodoPadrao();
  v.innerHTML = `<h1>Relatórios gerenciais</h1>
    <div class="bi-filtros">
      <label>De <input id="relDe" type="date" value="${p.de}"></label>
      <label>Até <input id="relAte" type="date" value="${p.ate}"></label>
      <label>Cliente <select id="relCliente"><option value="">Todos</option>${clientes.map(c => `<option value="${c.id}">${esc(c.empresa)}</option>`).join('')}</select></label>
      <label>Técnico <select id="relTecnico"><option value="">Todos</option>${tecnicos.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('')}</select></label>
      <button class="btn btn-primary" onclick="carregarRelatorio()">Filtrar</button>
    </div>
    <div class="toolbar">
      <button class="btn ${relAbaAtiva === 'horas' ? 'btn-primary' : ''}" onclick="trocarAbaRel('horas')">⏱ Horas</button>
      <button class="btn ${relAbaAtiva === 'faturamento' ? 'btn-primary' : ''}" onclick="trocarAbaRel('faturamento')">💰 Faturamento</button>
      <button class="btn ${relAbaAtiva === 'garantias' ? 'btn-primary' : ''}" onclick="trocarAbaRel('garantias')">🛡 Garantias</button>
      <button class="btn ${relAbaAtiva === 'origens' ? 'btn-primary' : ''}" onclick="trocarAbaRel('origens')">🎯 Origens</button>
      <button class="btn" onclick="exportarRelatorioCSV()">⬇️ Exportar CSV</button>
    </div>
    <div class="card" id="relTable"></div>`;
  await carregarRelatorio();
}
function trocarAbaRel(aba) {
  relAbaAtiva = aba;
  const botoes = document.querySelectorAll('.toolbar .btn');
  botoes.forEach(b => { b.classList.remove('btn-primary'); });
  const alvo = [...botoes].find(b => b.textContent.includes(aba === 'horas' ? 'Horas' : aba === 'faturamento' ? 'Faturamento' : aba === 'garantias' ? 'Garantias' : 'Origens'));
  if (alvo) alvo.classList.add('btn-primary');
  carregarRelatorio();
}
async function carregarRelatorio() {
  const params = relFiltrosParams();
  const d = await api('/api/relatorios/' + relAbaAtiva + '?' + params.toString());
  relDados = d;
  const box = document.getElementById('relTable');
  const t = d.totais;
  if (relAbaAtiva === 'horas') {
    const rows = d.rows.map(r => `<tr>
      <td>${esc(r.numero)}</td><td>${esc(r.cliente)}</td><td>${esc(r.tecnico)}</td>
      <td>${esc(r.maquina || '—')}</td><td>${fmtDate(r.data_encerramento)}</td>
      <td>${relTipoLabel(r.tipo_assistencia)}</td>
      <td>${r.horas_apontadas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
      <td>${r.horas_garantia.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
      <td>${r.horas_cobranca.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
      <td>${money(r.valor_garantia)}</td><td>${money(r.valor_cobranca)}</td>
    </tr>`).join('');
    box.innerHTML = `<table><thead><tr><th>OS</th><th>Cliente</th><th>Técnico</th><th>Máquina</th><th>Encerramento</th><th>Tipo</th><th>Horas apontadas</th><th>Horas garantia</th><th>Horas cobrança</th><th>Valor garantia</th><th>Valor cobrança</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="11" class="muted">Nenhum registro no período</td></tr>'}</tbody></table>
      <p class="muted" style="margin-top:8px"><strong>Totais:</strong> ${t.os_total} OS · Horas apontadas: <strong>${t.horas_apontadas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</strong> · Garantia: <strong>${t.horas_garantia.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</strong> · Cobrança: <strong>${t.horas_cobranca.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</strong> · Valor garantia: <strong>${money(t.valor_garantia)}</strong> · Valor cobrança: <strong>${money(t.valor_cobranca)}</strong></p>`;
  } else if (relAbaAtiva === 'faturamento') {
    const rows = d.rows.map(r => `<tr>
      <td>${esc(r.numero)}</td><td>${esc(r.cliente)}</td><td>${esc(r.tecnico)}</td>
      <td>${fmtDate(r.data_encerramento)}</td><td>${statusBadge(r.status)}</td>
      <td>${relTipoLabel(r.tipo_assistencia)}</td>
      <td>${money(r.valor_garantia)}</td><td>${money(r.valor_cobranca)}</td><td>${money(r.valor_total)}</td>
    </tr>`).join('');
    box.innerHTML = `<table><thead><tr><th>OS</th><th>Cliente</th><th>Técnico</th><th>Encerramento</th><th>Status</th><th>Tipo</th><th>Valor garantia</th><th>Valor cobrança</th><th>Total</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="muted">Nenhum registro no período</td></tr>'}</tbody></table>
      <p class="muted" style="margin-top:8px"><strong>Totais:</strong> ${t.os_total} OS · Garantia: <strong>${money(t.valor_garantia)}</strong> · Cobrança: <strong>${money(t.valor_cobranca)}</strong> · Total: <strong>${money(t.valor_total)}</strong></p>`;
  } else if (relAbaAtiva === 'garantias') {
    const rows = d.rows.map(r => `<tr>
      <td>${esc(r.numero)}</td><td>${esc(r.cliente)}</td><td>${esc(r.tecnico)}</td>
      <td>${esc(r.maquina || '—')}</td><td>${fmtDate(r.data_encerramento)}</td><td>${statusBadge(r.status)}</td>
      <td>${r.horas_apontadas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
      <td>${r.horas_servicos.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
      <td>${money(r.valor_garantia)}</td><td>${money(r.valor_cobranca)}</td><td>${money(r.valor_total)}</td>
    </tr>`).join('');
    box.innerHTML = `<table><thead><tr><th>OS</th><th>Cliente</th><th>Técnico</th><th>Máquina</th><th>Encerramento</th><th>Status</th><th>Horas apontadas</th><th>Horas serviços</th><th>Valor garantia</th><th>Valor cobrança</th><th>Total</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="11" class="muted">Nenhuma assistência em garantia no período</td></tr>'}</tbody></table>
      <p class="muted" style="margin-top:8px"><strong>Totais:</strong> ${t.os_total} OS · Horas apontadas: <strong>${t.horas_apontadas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</strong> · Horas serviços: <strong>${t.horas_servicos.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</strong> · Valor garantia: <strong>${money(t.valor_garantia)}</strong> · Valor cobrança: <strong>${money(t.valor_cobranca)}</strong></p>`;
  } else if (relAbaAtiva === 'origens') {
    const rows = d.rows.map(r => `<tr>
      <td>${esc(r.origem)}</td><td>${r.os_total}</td><td>${r.os_garantia}</td><td>${r.os_cobranca}</td><td>${money(r.valor_total)}</td>
    </tr>`).join('');
    box.innerHTML = `<table><thead><tr><th>Origem da assistência</th><th>Total OS</th><th>Em garantia</th><th>Em cobrança</th><th>Valor total</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted">Nenhuma OS com origem classificada no período</td></tr>'}</tbody></table>
      <p class="muted" style="margin-top:8px"><strong>Totais:</strong> ${t.os_total} OS · Garantia: <strong>${t.os_garantia}</strong> · Cobrança: <strong>${t.os_cobranca}</strong> · Valor: <strong>${money(t.valor_total)}</strong></p>`;
  }
}
function relNumCSV(v) {
  return String((v || 0)).replace('.', ',');
}
function downloadCSV(nomeArquivo, headers, linhas) {
  const escCSV = s => {
    const str = String(s ?? '');
    return /[";\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  };
  const conteudo = [headers.map(escCSV).join(';'), ...linhas.map(l => l.map(escCSV).join(';'))].join('\r\n');
  const blob = new Blob(['\ufeff' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
function exportarRelatorioCSV() {
  if (!relDados) return alert('Carregue o relatório antes de exportar');
  const hoje = new Date().toISOString().slice(0, 10);
  const nome = `relatorio_${relAbaAtiva}_${hoje}.csv`;
  if (relAbaAtiva === 'horas') {
    downloadCSV(nome,
      ['OS', 'Cliente', 'Técnico', 'Máquina', 'Encerramento', 'Tipo', 'Horas apontadas', 'Horas garantia', 'Horas cobrança', 'Valor garantia', 'Valor cobrança'],
      relDados.rows.map(r => [r.numero, r.cliente, r.tecnico, r.maquina, r.data_encerramento, relTipoLabel(r.tipo_assistencia), relNumCSV(r.horas_apontadas), relNumCSV(r.horas_garantia), relNumCSV(r.horas_cobranca), relNumCSV(r.valor_garantia), relNumCSV(r.valor_cobranca)])
    );
  } else if (relAbaAtiva === 'faturamento') {
    downloadCSV(nome,
      ['OS', 'Cliente', 'Técnico', 'Encerramento', 'Status', 'Tipo', 'Valor garantia', 'Valor cobrança', 'Total'],
      relDados.rows.map(r => [r.numero, r.cliente, r.tecnico, r.data_encerramento, STATUS[r.status]?.label || r.status, relTipoLabel(r.tipo_assistencia), relNumCSV(r.valor_garantia), relNumCSV(r.valor_cobranca), relNumCSV(r.valor_total)])
    );
  } else if (relAbaAtiva === 'garantias') {
    downloadCSV(nome,
      ['OS', 'Cliente', 'Técnico', 'Máquina', 'Encerramento', 'Status', 'Horas apontadas', 'Horas serviços', 'Valor garantia', 'Valor cobrança', 'Total'],
      relDados.rows.map(r => [r.numero, r.cliente, r.tecnico, r.maquina, r.data_encerramento, STATUS[r.status]?.label || r.status, relNumCSV(r.horas_apontadas), relNumCSV(r.horas_servicos), relNumCSV(r.valor_garantia), relNumCSV(r.valor_cobranca), relNumCSV(r.valor_total)])
    );
  } else if (relAbaAtiva === 'origens') {
    downloadCSV(nome,
      ['Origem', 'Total OS', 'Em garantia', 'Em cobrança', 'Valor total'],
      relDados.rows.map(r => [r.origem, r.os_total, r.os_garantia, r.os_cobranca, relNumCSV(r.valor_total)])
    );
  }
}
/* ---------- Lista de OS ---------- */
async function renderOsList() {
  const v = document.getElementById('view');
  v.innerHTML = `<h1>Ordens de Serviço</h1>
    <div class="toolbar">
      <input id="fQ" placeholder="Buscar nº ou cliente…">
      <select id="fStatus"><option value="">Todos os status</option>${Object.keys(STATUS).map(s => `<option value="${s}">${STATUS[s].label}</option>`).join('')}</select>
      <select id="fCliente"><option value="">Todos os clientes</option></select>
      <button class="btn" onclick="loadOsList()">Filtrar</button>
      ${can('tecnico', 'revisor', 'admin') ? '<a class="btn btn-primary" href="#/os-form">+ Nova OS</a>' : ''}
    </div><div class="card" id="osTable"></div>`;
  const clientes = await api('/clientes');
  document.getElementById('fCliente').innerHTML += clientes.map(c => `<option value="${c.id}">${esc(c.empresa)}</option>`).join('');
  await loadOsList();
}
async function loadOsList() {
  const params = new URLSearchParams();
  const q = document.getElementById('fQ').value, st = document.getElementById('fStatus').value, cl = document.getElementById('fCliente').value;
  if (q) params.set('q', q); if (st) params.set('status', st); if (cl) params.set('cliente_id', cl);
  const list = await api('/os?' + params.toString());
  const rows = list.map(o => `<tr><td>${esc(o.numero)}</td><td>${esc(o.cliente_nome)}</td><td>${esc(o.tecnico_nome)}</td><td>${fmtDate(o.data_entrada)}</td><td>${statusBadge(o.status)}</td><td>${money((o.total_pecas || 0) + (o.total_servicos || 0))}</td><td><a class="btn btn-sm" href="#/os/${o.id}">Abrir</a></td></tr>`).join('');
  document.getElementById('osTable').innerHTML = `<table><thead><tr><th>Número</th><th>Cliente</th><th>Técnico</th><th>Entrada</th><th>Status</th><th>Total</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="muted">Nenhuma OS encontrada</td></tr>'}</tbody></table>`;
}
/* ---------- Formulário de OS ---------- */
async function renderOsForm(id) {
  const v = document.getElementById('view');
  const clientes = await api('/clientes');
  let os = null;
  if (id) { const d = await api('/os/' + id); os = d.os; }
  v.innerHTML = `<h1>${os ? 'Editar' : 'Nova'} OS</h1><div class="card form">
    <label>Cliente *</label><select id="osCliente">${clientes.map(c => `<option value="${c.id}" ${os && os.cliente_id === c.id ? 'selected' : ''}>${esc(c.empresa)}</option>`).join('')}</select>
    <label>Solicitante da assistência</label><input id="osSolicitante" value="${esc(os ? os.solicitante : '')}" placeholder="Nome de quem solicitou o atendimento">
    <label>Máquina</label><select id="osMaquina"><option value="">—</option></select>
    <label>Data de entrada</label><input id="osData" type="date" value="${os ? os.data_entrada : new Date().toISOString().slice(0, 10)}">
    <label>Assunto</label><input id="osAssunto" value="${esc(os ? os.assunto : '')}">
    <label>Defeito relatado</label><textarea id="osDefeito">${esc(os ? os.defeito : '')}</textarea>
    <label>Serviço realizado</label><textarea id="osServico">${esc(os ? os.servico_realizado : '')}</textarea>
    <label>Observações</label><textarea id="osObs">${esc(os ? os.observacoes : '')}</textarea>
    <label>Tipo de assistência</label><select id="osTipoAssistencia">
      <option value="cobranca" ${os && os.tipo_assistencia === 'garantia' ? '' : 'selected'}>Cobrança</option>
      <option value="garantia" ${os && os.tipo_assistencia === 'garantia' ? 'selected' : ''}>Garantia</option>
    </select>
    <div class="row"><button class="btn btn-primary" onclick="saveOs(${id || 'null'})">Salvar</button> <a class="btn" href="#/os">Cancelar</a></div>
  </div>`;
  const maquinas = await api('/maquinas');
  const sel = document.getElementById('osMaquina');
  const preencher = () => {
    const cid = document.getElementById('osCliente').value;
    sel.innerHTML = '<option value="">—</option>' + maquinas.filter(m => String(m.cliente_id) === cid).map(m => `<option value="${m.id}" ${os && os.maquina_id === m.id ? 'selected' : ''}>${esc(m.descricao)} (${esc(m.numero_serie || '')})</option>`).join('');
  };
  document.getElementById('osCliente').addEventListener('change', preencher);
  preencher();
}
async function saveOs(id) {
  const body = {
    cliente_id: document.getElementById('osCliente').value,
    solicitante: document.getElementById('osSolicitante').value,
    maquina_id: document.getElementById('osMaquina').value || null,
    data_entrada: document.getElementById('osData').value,
    assunto: document.getElementById('osAssunto').value,
    defeito: document.getElementById('osDefeito').value,
    servico_realizado: document.getElementById('osServico').value,
    observacoes: document.getElementById('osObs').value,
    tipo_assistencia: document.getElementById('osTipoAssistencia').value
  };
  try {
    if (id) { await api('/os/' + id, { method: 'PUT', body: JSON.stringify(body) }); location.hash = '#/os/' + id; }
    else { const d = await api('/os', { method: 'POST', body: JSON.stringify(body) }); location.hash = '#/os/' + d.id; }
  } catch (e) { alert(e.message); }
}
/* ---------- Detalhe da OS ---------- */
async function renderOsDetail(id) {
  currentOsId = id;
  const v = document.getElementById('view');
  v.innerHTML = '<p class="muted">Carregando…</p>';
  const d = await api('/os/' + id);
  const { os, cliente, maquina, tecnico, materiais, servicos, horas, vistos, historico } = d;
  const totalPecas = materiais.reduce((s, m) => s + (m.valor_total || 0), 0);
  const totalServicos = servicos.reduce((s, x) => s + (x.valor_total || 0), 0);
  const totalGeral = totalPecas + totalServicos;
  let vGarantia = materiais.filter(m => m.garantia).reduce((s, m) => s + (m.valor_total || 0), 0)
    + servicos.filter(s => s.garantia).reduce((s, x) => s + (x.valor_total || 0), 0);
  let vCobranca = totalGeral - vGarantia;
  const totalMinH = horas.reduce((s, h) => {
    if (!h.tempo_total) return s;
    const p = h.tempo_total.split(':').map(Number);
    return s + (p[0] || 0) * 60 + (p[1] || 0);
  }, 0);
  const totalHH = String(Math.floor(totalMinH / 60)).padStart(2, '0') + ':' + String(totalMinH % 60).padStart(2, '0');
  const totalHDec = (totalMinH / 60).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pendentes = materiais.filter(m => m.status_normalizacao === 'pendente' || !(m.valor_unitario > 0)).length;
  const matRows = materiais.map(m => `<tr>
    <td>${m.status_normalizacao === 'normalizado' ? esc(m.codigo_erp || '-') : '—'}</td>
    <td>${esc(m.descricao_erp || m.descricao_tecnico)}</td><td>${m.quantidade}</td><td>${esc(m.unidade)}</td>
    <td>${m.valor_unitario ? money(m.valor_unitario) : '—'}</td><td>${m.valor_total ? money(m.valor_total) : '—'}</td>
    <td>${can('tecnico', 'revisor', 'admin') ? `<input type="checkbox" id="matGar_${m.id}" ${m.garantia ? 'checked' : ''}>` : (m.garantia ? 'Sim' : 'Não')}</td>
    <td>${m.status_normalizacao === 'normalizado' ? '<span class="badge" style="background:#10b981">OK</span>' : '<span class="badge" style="background:#f59e0b">Pendente</span>'}</td>
    <td>${can('revisor', 'admin') ? `<button class="btn btn-sm" onclick="normalizarMaterial(${m.id})">${m.status_normalizacao === 'normalizado' ? 'Editar' : 'Normalizar'}</button>` : ''}
        ${can('tecnico', 'revisor', 'admin') ? `<button class="btn btn-sm btn-danger" onclick="removerMaterial(${m.id})">✕</button>` : ''}</td>
  </tr>`).join('') || '<tr><td colspan="9" class="muted">Nenhum material lançado</td></tr>';
  const servRows = servicos.map(s => `<tr><td>${esc(s.descricao)}</td><td>${s.horas}</td><td>${money(s.valor_unitario)}</td><td>${money(s.valor_total)}</td><td>${can('tecnico', 'revisor', 'admin') ? `<input type="checkbox" id="servGar_${s.id}" ${s.garantia ? 'checked' : ''}>` : (s.garantia ? 'Sim' : 'Não')}</td><td>${can('tecnico', 'revisor', 'admin') ? `<button class="btn btn-sm btn-danger" onclick="removerServico(${s.id})">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum serviço lançado</td></tr>';
  const horaRows = horas.map(h => `<tr><td>${h.data ? fmtDate(h.data) : '—'}</td><td>${esc(h.colaborador)}</td><td>${esc(h.entrada || '')}</td><td>${esc(h.saida || '')}</td><td>${esc(h.tempo_total || '')}</td><td><button class="btn btn-sm" onclick="editarHoras(${h.id})">Editar</button> <button class="btn btn-sm btn-danger" onclick="removerHoras(${h.id})">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum apontamento</td></tr>';
  const vistoRevisor = vistos.find(x => x.tipo === 'revisor');
  const vistoCliente = vistos.find(x => x.tipo === 'cliente');
  const histRows = historico.map(h => `<tr><td>${fmtDateTime(h.data_hora)}</td><td>${esc(h.status_anterior ? (STATUS[h.status_anterior]?.label || h.status_anterior) : '—')} → ${esc(STATUS[h.status_novo]?.label || h.status_novo)}</td><td>${esc(h.observacao || '')}</td><td>${esc(h.usuario_nome || '—')}</td></tr>`).join('');
  let acoes = '';
  if (can('revisor', 'admin') || (can('tecnico') && os.tecnico_id === state.user.id)) acoes += `<a class="btn" href="#/os-form?id=${os.id}">✏️ Editar</a>`;
  if (can('revisor', 'admin')) acoes += `<button class="btn btn-primary" onclick="salvarOS(${os.id})">💾 Salvar OS</button>`;
  if (os.status === 'rascunho' && can('tecnico', 'admin')) acoes += `<button class="btn btn-primary" onclick="mudarStatus(${os.id},'em_revisao')">Enviar para revisão</button>`;
  if (os.status === 'em_revisao' && can('revisor', 'admin')) {
    acoes += `<button class="btn btn-primary" onclick="enviarOS(${os.id})">Enviar ao cliente</button>`;
    acoes += `<button class="btn" onclick="mudarStatus(${os.id},'rascunho')">Devolver ao técnico</button>`;
  }
  if (os.status === 'aguardando_cliente' && can('revisor', 'comercial', 'admin')) acoes += `<button class="btn btn-primary" onclick="mudarStatus(${os.id},'aprovada')">Registrar aprovação do cliente</button>`;
  if (os.status === 'aguardando_cliente' && can('revisor', 'admin')) acoes += `<button class="btn" onclick="reenviarOS(${os.id})">📧 Reenviar e-mail</button>`;
  if (os.status === 'aguardando_cliente' && can('revisor', 'admin')) acoes += `<button class="btn" onclick="mudarStatus(${os.id},'em_revisao')">Devolver para revisão</button>`;
  if (os.status === 'aprovada' && can('comercial', 'admin')) acoes += `<button class="btn btn-primary" onclick="mudarStatus(${os.id},'cobrada')">Emitir cobrança</button>`;
  if (os.status === 'cobrada' && can('revisor', 'admin')) acoes += `<button class="btn btn-primary" onclick="mudarStatus(${os.id},'recebida')">Registrar recebimento</button>`;
  if (can('admin') && os.status !== 'cancelada') acoes += `<button class="btn btn-danger" onclick="mudarStatus(${os.id},'cancelada')">Cancelar OS</button>`;
  v.innerHTML = `<div class="os-head">
    <div><h1>${esc(os.numero)}</h1><p class="muted">${statusBadge(os.status)}${os.tipo_assistencia === 'garantia' ? ' <span class="badge" style="background:#f59e0b">Garantia</span>' : ''} · Entrada: ${fmtDate(os.data_entrada)}${os.data_saida ? ' · Saída: ' + fmtDate(os.data_saida) : ''}</p></div>
    <div class="row">${acoes} <a class="btn" href="/api/report/${os.id}?token=${localStorage.getItem('token')}" target="_blank">🖨️ Relatório</a></div>
  </div>
  <div class="grid2">
    <div class="card"><h3>Cliente</h3><p><strong>${esc(cliente.empresa)}</strong>${cliente.fantasia ? ' (' + esc(cliente.fantasia) + ')' : ''}<br>${os.solicitante ? 'Solicitante da assistência: <strong>' + esc(os.solicitante) + '</strong><br>' : ''}${esc(cliente.endereco || '')} ${esc(cliente.bairro || '')}<br>${esc(cliente.cidade || '')} ${esc(cliente.cep || '')}<br>${esc(cliente.contato || '')} ${esc(cliente.email || '')} ${esc(cliente.telefone || '')}</p></div>
    <div class="card"><h3>Equipamento</h3><p>${maquina ? esc(maquina.descricao) + '<br>Série: ' + esc(maquina.numero_serie || '—') : '—'}</p><h3>Técnico</h3><p>${esc(tecnico.nome)}</p></div>
  </div>
  <div class="card"><h3>Defeito relatado</h3><p>${esc(os.defeito || '—')}</p><h3>Serviço realizado</h3><p>${esc(os.servico_realizado || '—')}</p></div>
  <div class="card"><h3>Materiais utilizados</h3>
    <table><thead><tr><th>Código</th><th>Descrição</th><th>Qtd</th><th>Un</th><th>Vlr unit</th><th>Vlr total</th><th>Garantia</th><th>Status</th><th></th></tr></thead><tbody>${matRows}</tbody></table>
    ${can('tecnico', 'revisor', 'admin') ? `<div class="inline-form"><input id="matDesc" placeholder="Descreva o material (do seu jeito)"><input id="matQtd" type="number" value="1" style="width:70px"><input id="matUn" value="un" style="width:60px"><label><input id="matGar" type="checkbox" ${os.tipo_assistencia === 'garantia' ? 'checked' : ''}> Garantia</label><button class="btn btn-sm btn-primary" onclick="addMaterial(${os.id})">+ Material</button></div>` : ''}
    ${can('revisor', 'admin') && pendentes > 0 ? `<p class="warn">⚠️ ${pendentes} material(is) aguardando normalização (código + valor) antes do envio.</p>` : ''}
  </div>
  <div class="card"><h3>Mão de obra (serviços)</h3>
    <table><thead><tr><th>Serviço</th><th>Horas</th><th>Vlr unit</th><th>Vlr total</th><th>Garantia</th><th></th></tr></thead><tbody>${servRows}</tbody></table>
    ${can('tecnico', 'revisor', 'admin') ? `<div class="inline-form"><select id="servCat"><option value="">Escolha o serviço…</option></select><input id="servHoras" type="number" value="1" style="width:70px"><label><input id="servGar" type="checkbox" ${os.tipo_assistencia === 'garantia' ? 'checked' : ''}> Garantia</label><button class="btn btn-sm btn-primary" onclick="addServico(${os.id})">+ Serviço</button></div>` : ''}
  </div>
  <div class="card"><h3>Relatório de horas</h3>
    <table><thead><tr><th>Data</th><th>Colaborador</th><th>Entrada</th><th>Saída</th><th>Tempo</th><th></th></tr></thead><tbody>${horaRows}</tbody></table>
    <p><strong>Tempo total:</strong> ${totalHH} · <strong>Decimal:</strong> ${totalHDec} h</p>
    <div class="inline-form"><input id="hrData" type="date" value="${new Date().toISOString().slice(0, 10)}"><input id="hrCol" placeholder="Colaborador"><input id="hrEnt" type="time"><input id="hrSai" type="time"><button class="btn btn-sm btn-primary" onclick="addHoras(${os.id})">+ Horas</button></div>
  </div>
  <div class="card"><h3>Totais</h3><p>Peças: <strong>${money(totalPecas)}</strong> · Serviços: <strong>${money(totalServicos)}</strong><br>Valor em garantia: <strong>${money(vGarantia)}</strong> · Valor para cobrança: <strong>${money(vCobranca)}</strong><br>Total geral: <strong>${money(totalGeral)}</strong>${os.tipo_assistencia === 'garantia' ? ' · <span class="badge" style="background:#f59e0b">Assistência em garantia</span>' : ''}</p></div>
  ${can('revisor', 'admin') ? `<div class="card"><h3>Origem da assistência</h3>
    <div class="inline-form"><select id="origemAssistencia"><option value="">— Selecione —</option>${ORIGENS.map(o => `<option ${os.origem_assistencia === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
    <button class="btn btn-sm btn-primary" onclick="salvarOrigem(${os.id})">Salvar origem</button></div>
    <p class="muted" style="font-size:11px">Classificação da causa da assistência (ex.: problema de engenharia, usinagem, fornecedor…).</p>
  </div>` : ''}
  <div class="card"><h3>Vistos</h3>
    <p>Revisor: ${vistoRevisor ? (vistoRevisor.status === 'aprovado' ? '✅ ' + fmtDateTime(vistoRevisor.data_hora) : '⏳ Pendente') : '—'}</p>
    <p>Cliente: ${vistoCliente ? (vistoCliente.status === 'aprovado' ? '✅ ' + fmtDateTime(vistoCliente.data_hora) : '⏳ Pendente') : '—'}</p>
  </div>
  <div class="card"><h3>Histórico</h3><table><thead><tr><th>Data/hora</th><th>Transição</th><th>Observação</th><th>Usuário</th></tr></thead><tbody>${histRows || '<tr><td colspan="4" class="muted">Sem histórico</td></tr>'}</tbody></table></div>`;
  const catalogo = await api('/catalogo-servicos');
  document.getElementById('servCat').innerHTML = '<option value="">Escolha o serviço…</option>' + catalogo.filter(c => c.ativo).map(c => `<option value="${c.id}">${esc(c.codigo)} — ${esc(c.descricao)} (${money(c.valor_unitario)})</option>`).join('');
}
/* ---------- Ações da OS ---------- */
async function mudarStatus(id, status) {
  const obs = prompt('Observação (opcional):');
  if (obs === null) return;
  try { await api(`/os/${id}/status`, { method: 'POST', body: JSON.stringify({ status, observacao: obs }) }); renderOsDetail(id); }
  catch (e) { alert(e.message); }
}
async function enviarOS(id) {
  const d = await api('/os/' + id);
  const clienteEmail = (d.cliente && d.cliente.email) || '';
  openModal('Enviar ao cliente', `<div class="form">
    <p class="muted">O envio só ocorre com todos os itens normalizados.</p>
    <label>E-mail(s) do cliente *</label>
    <input id="envEmail" value="${esc(clienteEmail)}" placeholder="email@cliente.com.br">
    <p class="muted" style="font-size:11px">Para enviar a mais de um destinatário, separe os e-mails com vírgula.</p>
    <div class="row"><button class="btn btn-primary" onclick="confirmarEnvioOS(${id})">Confirmar envio</button><button class="btn" onclick="closeModal()">Cancelar</button></div>
  </div>`);
}
async function confirmarEnvioOS(id) {
  const emails = document.getElementById('envEmail').value.trim();
  if (!emails) return alert('Informe o e-mail do cliente');
  try {
    const d = await api(`/os/${id}/enviar`, { method: 'POST', body: JSON.stringify({ emails }) });
    closeModal();
    alert('OS enviada! Link de aprovação do cliente:\n' + d.link);
    renderOsDetail(id);
  } catch (e) { alert(e.message); }
}
async function reenviarOS(id) {
  const d = await api('/os/' + id);
  const clienteEmail = (d.cliente && d.cliente.email) || '';
  openModal('Reenviar e-mail ao cliente', `<div class="form">
    <p class="muted">O e-mail será reenviado com o mesmo link de aprovação (o link não muda).</p>
    <label>E-mail(s) do cliente *</label>
    <input id="envEmail" value="${esc(clienteEmail)}" placeholder="email@cliente.com.br">
    <p class="muted" style="font-size:11px">Para enviar a mais de um destinatário, separe os e-mails com vírgula.</p>
    <div class="row"><button class="btn btn-primary" onclick="confirmarReenvioOS(${id})">Confirmar reenvio</button><button class="btn" onclick="closeModal()">Cancelar</button></div>
  </div>`);
}
async function confirmarReenvioOS(id) {
  const emails = document.getElementById('envEmail').value.trim();
  if (!emails) return alert('Informe o e-mail do cliente');
  try {
    const d = await api(`/os/${id}/reenviar`, { method: 'POST', body: JSON.stringify({ emails }) });
    closeModal();
    alert('E-mail reenviado! Link de aprovação:\n' + d.link);
    renderOsDetail(id);
  } catch (e) { alert(e.message); }
}
async function salvarOrigem(id) {
  const origem = document.getElementById('origemAssistencia').value;
  try {
    await api(`/os/${id}/origem`, { method: 'PUT', body: JSON.stringify({ origem }) });
    alert('Origem salva!');
    renderOsDetail(id);
  } catch (e) { alert(e.message); }
}
async function salvarOS(id) {
  try {
    const d = await api('/os/' + id);
    const updates = [];
    for (const m of d.materiais) {
      const cb = document.getElementById('matGar_' + m.id);
      if (cb && cb.checked !== !!m.garantia) {
        updates.push(api(`/os/${id}/materiais/${m.id}`, { method: 'PUT', body: JSON.stringify({ garantia: cb.checked }) }));
      }
    }
    for (const s of d.servicos) {
      const cb = document.getElementById('servGar_' + s.id);
      if (cb && cb.checked !== !!s.garantia) {
        updates.push(api(`/os/${id}/servicos/${s.id}`, { method: 'PUT', body: JSON.stringify({ garantia: cb.checked }) }));
      }
    }
    if (!updates.length) return alert('Nenhuma alteração para salvar');
    await Promise.all(updates);
    alert('OS salva! Totais recalculados.');
    renderOsDetail(id);
  } catch (e) { alert(e.message); }
}
async function addMaterial(osId) {
  const desc = document.getElementById('matDesc').value.trim();
  if (!desc) return alert('Descreva o material');
  try {
    await api(`/os/${osId}/materiais`, { method: 'POST', body: JSON.stringify({ descricao_tecnico: desc, quantidade: Number(document.getElementById('matQtd').value || 1), unidade: document.getElementById('matUn').value || 'un', garantia: document.getElementById('matGar').checked }) });
    renderOsDetail(osId);
  } catch (e) { alert(e.message); }
}
async function removerMaterial(mid) {
  if (!confirm('Remover este material?')) return;
  await api(`/os/${currentOsId}/materiais/${mid}`, { method: 'DELETE' });
  renderOsDetail(currentOsId);
}
async function normalizarMaterial(mid) {
  const d = await api('/os/' + currentOsId);
  const m = d.materiais.find(x => x.id === mid);
  openModal('Normalizar material', `<div class="form">
    <label>Código ERP</label><input id="nmCod" value="${esc(m.codigo_erp || '')}">
    <label>Descrição (ERP)</label><input id="nmDesc" value="${esc(m.descricao_erp || m.descricao_tecnico)}">
    <label>Valor unitário (R$) *</label><input id="nmVal" type="number" step="0.01" value="${m.valor_unitario || ''}">
    <label>Quantidade</label><input id="nmQtd" type="number" step="0.01" value="${m.quantidade}">
    <label>Unidade</label><input id="nmUn" value="${esc(m.unidade)}">
    <label><input id="nmGar" type="checkbox" ${m.garantia ? 'checked' : ''}> Garantia</label>
    <div class="row"><button class="btn btn-primary" onclick="salvarNormalizacao(${mid})">Salvar</button><button class="btn" onclick="closeModal()">Cancelar</button></div>
  </div>`);
}
async function salvarNormalizacao(mid) {
  try {
    await api(`/os/${currentOsId}/materiais/${mid}`, { method: 'PUT', body: JSON.stringify({
      codigo_erp: document.getElementById('nmCod').value,
      descricao_erp: document.getElementById('nmDesc').value,
      valor_unitario: Number(document.getElementById('nmVal').value),
      quantidade: Number(document.getElementById('nmQtd').value),
      unidade: document.getElementById('nmUn').value,
      garantia: document.getElementById('nmGar').checked
    }) });
    closeModal(); renderOsDetail(currentOsId);
  } catch (e) { alert(e.message); }
}
async function addServico(osId) {
  const cat = document.getElementById('servCat').value;
  if (!cat) return alert('Escolha um serviço do catálogo');
  try {
    await api(`/os/${osId}/servicos`, { method: 'POST', body: JSON.stringify({ catalogo_id: cat, horas: Number(document.getElementById('servHoras').value || 1), garantia: document.getElementById('servGar').checked }) });
    renderOsDetail(osId);
  } catch (e) { alert(e.message); }
}
async function removerServico(sid) {
  if (!confirm('Remover este serviço?')) return;
  await api(`/os/${currentOsId}/servicos/${sid}`, { method: 'DELETE' });
  renderOsDetail(currentOsId);
}
async function addHoras(osId) {
  const col = document.getElementById('hrCol').value.trim();
  if (!col) return alert('Informe o colaborador');
  try {
    await api(`/os/${osId}/horas`, { method: 'POST', body: JSON.stringify({ data: document.getElementById('hrData').value, colaborador: col, entrada: document.getElementById('hrEnt').value, saida: document.getElementById('hrSai').value }) });
    renderOsDetail(osId);
  } catch (e) { alert(e.message); }
}
async function editarHoras(hid) {
  const d = await api('/os/' + currentOsId);
  const h = d.horas.find(x => x.id === hid);
  if (!h) return alert('Registro não encontrado');
  openModal('Editar horas', `<div class="form">
    <label>Data</label><input id="hrDataE" type="date" value="${h.data || ''}">
    <label>Colaborador *</label><input id="hrColE" value="${esc(h.colaborador)}">
    <label>Entrada</label><input id="hrEntE" type="time" value="${esc(h.entrada || '')}">
    <label>Saída</label><input id="hrSaiE" type="time" value="${esc(h.saida || '')}">
    <div class="row"><button class="btn btn-primary" onclick="salvarHoras(${hid})">Salvar</button><button class="btn" onclick="closeModal()">Cancelar</button></div>
  </div>`);
}
async function salvarHoras(hid) {
  const col = document.getElementById('hrColE').value.trim();
  if (!col) return alert('Informe o colaborador');
  try {
    await api(`/os/${currentOsId}/horas/${hid}`, { method: 'PUT', body: JSON.stringify({ data: document.getElementById('hrDataE').value, colaborador: col, entrada: document.getElementById('hrEntE').value, saida: document.getElementById('hrSaiE').value }) });
    closeModal(); renderOsDetail(currentOsId);
  } catch (e) { alert(e.message); }
}
async function removerHoras(hid) {
  if (!confirm('Excluir este apontamento de horas?')) return;
  try { await api(`/os/${currentOsId}/horas/${hid}`, { method: 'DELETE' }); renderOsDetail(currentOsId); }
  catch (e) { alert(e.message); }
}
/* ---------- Catálogo de Serviços (com Excluir — somente admin) ---------- */
async function renderCatalogo() {
  const v = document.getElementById('view');
  v.innerHTML = '<p class="muted">Carregando…</p>';
  const lista = await api('/catalogo-servicos');
  const rows = lista.map(s => `<tr>
    <td>${esc(s.codigo)}</td><td>${esc(s.descricao)}</td><td>${esc(s.unidade)}</td><td>${money(s.valor_unitario)}</td>
    <td>${s.ativo ? '<span class="badge" style="background:#10b981">Ativo</span>' : '<span class="badge" style="background:#64748b">Inativo</span>'}</td>
    <td>
      ${can('admin') ? `<button class="btn btn-sm" onclick="editarServicoCatalogo(${s.id})">Editar</button>` : ''}
      ${can('admin') ? `<button class="btn btn-sm btn-danger" onclick="excluirServicoCatalogo(${s.id})">Excluir</button>` : ''}
    </td>
  </tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum serviço cadastrado</td></tr>';
  v.innerHTML = `<h1>Catálogo de Serviços</h1>
    ${can('admin') ? `<div class="toolbar"><button class="btn btn-primary" onclick="novoServicoCatalogo()">+ Novo serviço</button></div>` : ''}
    <div class="card"><table><thead><tr><th>Código</th><th>Descrição</th><th>Un</th><th>Valor unitário</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
function novoServicoCatalogo() {
  openModal('Novo serviço', `<div class="form">
    <label>Código *</label><input id="scCod" placeholder="ex.: SVC006">
    <label>Descrição *</label><input id="scDesc" placeholder="Descrição do serviço">
    <label>Unidade</label><input id="scUn" value="h">
    <label>Valor unitário (R$) *</label><input id="scVal" type="number" step="0.01">
    <div class="row"><button class="btn btn-primary" onclick="salvarServicoCatalogo()">Salvar</button><button class="btn" onclick="closeModal()">Cancelar</button></div>
  </div>`);
}
async function salvarServicoCatalogo() {
  const codigo = document.getElementById('scCod').value.trim();
  const descricao = document.getElementById('scDesc').value.trim();
  if (!codigo || !descricao) return alert('Informe código e descrição');
  try {
    await api('/catalogo-servicos', { method: 'POST', body: JSON.stringify({ codigo, descricao, unidade: document.getElementById('scUn').value || 'h', valor_unitario: Number(document.getElementById('scVal').value) || 0 }) });
    closeModal(); renderCatalogo();
  } catch (e) { alert(e.message); }
}
async function editarServicoCatalogo(id) {
  const lista = await api('/catalogo-servicos');
  const s = lista.find(x => x.id === id);
  if (!s) return alert('Serviço não encontrado');
  openModal('Editar serviço', `<div class="form">
    <label>Código *</label><input id="scCod" value="${esc(s.codigo)}">
    <label>Descrição *</label><input id="scDesc" value="${esc(s.descricao)}">
    <label>Unidade</label><input id="scUn" value="${esc(s.unidade)}">
    <label>Valor unitário (R$) *</label><input id="scVal" type="number" step="0.01" value="${s.valor_unitario}">
    <label><input id="scAtivo" type="checkbox" ${s.ativo ? 'checked' : ''}> Ativo</label>
    <div class="row"><button class="btn btn-primary" onclick="salvarServicoCatalogoEdit(${id})">Salvar</button><button class="btn" onclick="closeModal()">Cancelar</button></div>
  </div>`);
}
async function salvarServicoCatalogoEdit(id) {
  try {
    await api('/catalogo-servicos/' + id, { method: 'PUT', body: JSON.stringify({
      codigo: document.getElementById('scCod').value.trim(),
      descricao: document.getElementById('scDesc').value.trim(),
      unidade: document.getElementById('scUn').value || 'h',
      valor_unitario: Number(document.getElementById('scVal').value) || 0,
      ativo: document.getElementById('scAtivo').checked
    }) });
    closeModal(); renderCatalogo();
  } catch (e) { alert(e.message); }
}
async function excluirServicoCatalogo(id) {
  if (!confirm('Excluir este serviço do catálogo? Ele deixará de aparecer em novas OS (as OS já criadas não são afetadas).')) return;
  try {
    await api('/catalogo-servicos/' + id, { method: 'DELETE' });
    renderCatalogo();
  } catch (e) { alert(e.message); }
}
/* ---------- Aprovação pública do cliente ---------- */
async function renderAprovacaoPublica(token) {
  const app = document.getElementById('app');
  try {
    const d = await api('/public/os/' + token);
    const o = d.os;
    app.innerHTML = `<div class="public-page"><div class="card">
      <h1>ERCOMAQ</h1><p class="muted">Aprovação de Ordem de Serviço</p>
      <p style="margin-top:12px">OS <strong>${esc(o.numero)}</strong><br>Cliente: <strong>${esc(o.cliente)}</strong><br>Total: <strong>${money(o.total)}</strong></p>
      ${o.status === 'aguardando_cliente' ? `<div class="row" style="justify-content:center"><button class="btn btn-primary" onclick="aprovarPublica('${token}')">✅ Aprovar OS</button></div>` : `<p>${o.status === 'aprovada' ? 'Esta OS já foi aprovada.' : 'Esta OS não está aguardando aprovação.'}</p>`}
    </div></div>`;
  } catch (e) {
    app.innerHTML = `<div class="public-page"><div class="card"><p>${esc(e.message)}</p></div></div>`;
  }
}
async function aprovarPublica(token) {
  try { await api('/public/os/' + token + '/aprovar', { method: 'POST' }); renderAprovacaoPublica(token); }
  catch (e) { alert(e.message); }
}
window.addEventListener('hashchange', render);
render();