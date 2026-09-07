/* ---------- Clientes ---------- */
async function renderClientes() {
  const v = document.getElementById('view');
  v.innerHTML = `<h1>Clientes</h1><div class="toolbar"><button class="btn btn-primary" onclick="novoCliente()">+ Cliente</button></div><div class="card" id="cliWrap"></div>`;
  const list = await api('/clientes');
  document.getElementById('cliWrap').innerHTML = `<table><thead><tr><th>Empresa</th><th>Fantasia</th><th>Contato</th><th>E-mail</th><th>Telefone</th><th>Cidade</th><th></th></tr></thead>
    <tbody>${list.map(c => `<tr><td>${esc(c.empresa)}</td><td>${esc(c.fantasia || '')}</td><td>${esc(c.contato || '')}</td><td>${esc(c.email || '')}</td><td>${esc(c.telefone || '')}</td><td>${esc(c.cidade || '')}</td><td><button class="btn btn-sm" onclick="editarCliente(${c.id})">Editar</button> ${can('admin') ? `<button class="btn btn-sm btn-danger" onclick="excluirCliente(${c.id})">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhum cliente</td></tr>'}</tbody></table>`;
}
function novoCliente() { openModal('Novo cliente', clienteFormHTML(null)); }
async function editarCliente(id) {
  const list = await api('/clientes');
  const c = list.find(x => x.id === id);
  openModal('Editar cliente', clienteFormHTML(c));
}
function clienteFormHTML(c) {
  return `<div class="form">
    <label>Empresa *</label><input id="cEmpresa" value="${esc(c ? c.empresa : '')}">
    <label>Nome fantasia</label><input id="cFantasia" value="${esc(c ? c.fantasia : '')}">
    <label>Contato</label><input id="cContato" value="${esc(c ? c.contato : '')}">
    <label>E-mail</label><input id="cEmail" value="${esc(c ? c.email : '')}">
    <label>Telefone</label><input id="cTelefone" value="${esc(c ? c.telefone : '')}">
    <label>Endereço</label><input id="cEndereco" value="${esc(c ? c.endereco : '')}">
    <label>Bairro</label><input id="cBairro" value="${esc(c ? c.bairro : '')}">
    <label>Cidade</label><input id="cCidade" value="${esc(c ? c.cidade : '')}">
    <label>CEP</label><input id="cCep" value="${esc(c ? c.cep : '')}">
    <div class="row"><button class="btn btn-primary" onclick="salvarCliente(${c ? c.id : 'null'})">Salvar</button><button class="btn" onclick="closeModal()">Cancelar</button></div>
  </div>`;
}
async function salvarCliente(id) {
  const body = {
    empresa: document.getElementById('cEmpresa').value,
    fantasia: document.getElementById('cFantasia').value,
    contato: document.getElementById('cContato').value,
    email: document.getElementById('cEmail').value,
    telefone: document.getElementById('cTelefone').value,
    endereco: document.getElementById('cEndereco').value,
    bairro: document.getElementById('cBairro').value,
    cidade: document.getElementById('cCidade').value,
    cep: document.getElementById('cCep').value
  };
  try {
    if (id) await api('/clientes/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/clientes', { method: 'POST', body: JSON.stringify(body) });
    closeModal(); renderClientes();
  } catch (e) { alert(e.message); }
}
async function excluirCliente(id) {
  if (!confirm('Excluir este cliente?')) return;
  await api('/clientes/' + id, { method: 'DELETE' });
  renderClientes();
}
/* ---------- Máquinas ---------- */
async function renderMaquinas() {
  const v = document.getElementById('view');
  v.innerHTML = `<h1>Máquinas</h1><div class="toolbar"><button class="btn btn-primary" onclick="novaMaquina()">+ Máquina</button></div><div class="card" id="maqWrap"></div>`;
  const [maquinas, clientes] = await Promise.all([api('/maquinas'), api('/clientes')]);
  const nomeCli = id => { const c = clientes.find(x => x.id === id); return c ? c.empresa : '—'; };
  document.getElementById('maqWrap').innerHTML = `<table><thead><tr><th>Máquina</th><th>Nº série</th><th>Cliente</th><th></th></tr></thead>
    <tbody>${maquinas.map(m => `<tr><td>${esc(m.descricao)}</td><td>${esc(m.numero_serie || '')}</td><td>${esc(nomeCli(m.cliente_id))}</td><td><button class="btn btn-sm" onclick="editarMaquina(${m.id})">Editar</button> ${can('admin') ? `<button class="btn btn-sm btn-danger" onclick="excluirMaquina(${m.id})">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhuma máquina</td></tr>'}</tbody></table>`;
}
async function novaMaquina() {
  const clientes = await api('/clientes');
  openModal('Nova máquina', maquinaFormHTML(null, clientes));
}
async function editarMaquina(id) {
  const [maquinas, clientes] = await Promise.all([api('/maquinas'), api('/clientes')]);
  const m = maquinas.find(x => x.id === id);
  openModal('Editar máquina', maquinaFormHTML(m, clientes));
}
function maquinaFormHTML(m, clientes) {
  return `<div class="form">
    <label>Cliente *</label><select id="mCliente">${clientes.map(c => `<option value="${c.id}" ${m && m.cliente_id === c.id ? 'selected' : ''}>${esc(c.empresa)}</option>`).join('')}</select>
    <label>Máquina *</label><input id="mDesc" value="${esc(m ? m.descricao : '')}">
    <label>Número de série</label><input id="mSerie" value="${esc(m ? m.numero_serie : '')}">
    <div class="row"><button class="btn btn-primary" onclick="salvarMaquina(${m ? m.id : 'null'})">Salvar</button><button class="btn" onclick="closeModal()">Cancelar</button></div>
  </div>`;
}
async function salvarMaquina(id) {
  const body = { cliente_id: Number(document.getElementById('mCliente').value), descricao: document.getElementById('mDesc').value, numero_serie: document.getElementById('mSerie').value };
  try {
    if (id) await api('/maquinas/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/maquinas', { method: 'POST', body: JSON.stringify(body) });
    closeModal(); renderMaquinas();
  } catch (e) { alert(e.message); }
}
async function excluirMaquina(id) {
  if (!confirm('Excluir esta máquina?')) return;
  await api('/maquinas/' + id, { method: 'DELETE' });
  renderMaquinas();
}
/* ---------- Usuários ---------- */
async function renderUsuarios() {
  const v = document.getElementById('view');
  v.innerHTML = `<h1>Usuários</h1><div class="toolbar"><button class="btn btn-primary" onclick="novoUsuario()">+ Usuário</button></div><div class="card" id="usrWrap"></div>`;
  const list = await api('/usuarios');
  document.getElementById('usrWrap').innerHTML = `<table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(u => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td>${PERFIS[u.perfil] || u.perfil}</td><td>${u.ativo ? '<span class="badge" style="background:#10b981">Ativo</span>' : '<span class="badge" style="background:#ef4444">Inativo</span>'}</td><td><button class="btn btn-sm" onclick="editarUsuario(${u.id})">Editar</button></td></tr>`).join('')}</tbody></table>`;
}
function novoUsuario() { openModal('Novo usuário', usuarioFormHTML(null)); }
async function editarUsuario(id) {
  const list = await api('/usuarios');
  const u = list.find(x => x.id === id);
  openModal('Editar usuário', usuarioFormHTML(u));
}
function usuarioFormHTML(u) {
  return `<div class="form">
    <label>Nome *</label><input id="uNome" value="${esc(u ? u.nome : '')}">
    <label>E-mail *</label><input id="uEmail" type="email" value="${esc(u ? u.email : '')}">
    <label>Perfil *</label><select id="uPerfil">${Object.keys(PERFIS).map(p => `<option value="${p}" ${u && u.perfil === p ? 'selected' : ''}>${PERFIS[p]}</option>`).join('')}</select>
    <label>Senha ${u ? '(deixe em branco para manter)' : '*'}</label><input id="uSenha" type="password">
    ${u ? `<label><input id="uAtivo" type="checkbox" ${u.ativo ? 'checked' : ''}> Ativo</label>` : ''}
    <div class="row"><button class="btn btn-primary" onclick="salvarUsuario(${u ? u.id : 'null'})">Salvar</button><button class="btn" onclick="closeModal()">Cancelar</button></div>
  </div>`;
}
async function salvarUsuario(id) {
  const body = { nome: document.getElementById('uNome').value, email: document.getElementById('uEmail').value, perfil: document.getElementById('uPerfil').value, senha: document.getElementById('uSenha').value };
  if (id) body.ativo = document.getElementById('uAtivo').checked;
  try {
    if (id) await api('/usuarios/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/usuarios', { method: 'POST', body: JSON.stringify(body) });
    closeModal(); renderUsuarios();
  } catch (e) { alert(e.message); }
}
/* ---------- Catálogo de Serviços ---------- */
async function renderCatalogo() {
  const v = document.getElementById('view');
  v.innerHTML = `<h1>Catálogo de Serviços</h1><p class="muted">Valores fixos de mão de obra — o técnico escolhe o serviço e o valor já vem preenchido.</p>
    <div class="toolbar" style="margin-top:10px"><button class="btn btn-primary" onclick="novoServico()">+ Serviço</button></div><div class="card" id="catWrap"></div>`;
  const list = await api('/catalogo-servicos');
  document.getElementById('catWrap').innerHTML = `<table><thead><tr><th>Código</th><th>Descrição</th><th>Unidade</th><th>Valor unitário</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(s => `<tr><td>${esc(s.codigo)}</td><td>${esc(s.descricao)}</td><td>${esc(s.unidade)}</td><td>${money(s.valor_unitario)}</td><td>${s.ativo ? '<span class="badge" style="background:#10b981">Ativo</span>' : '<span class="badge" style="background:#ef4444">Inativo</span>'}</td><td><button class="btn btn-sm" onclick="editarServico(${s.id})">Editar</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum serviço cadastrado</td></tr>'}</tbody></table>`;
}
function novoServico() { openModal('Novo serviço', servicoFormHTML(null)); }
async function editarServico(id) {
  const list = await api('/catalogo-servicos');
  const s = list.find(x => x.id === id);
  openModal('Editar serviço', servicoFormHTML(s));
}
function servicoFormHTML(s) {
  return `<div class="form">
    <label>Código *</label><input id="sCodigo" value="${esc(s ? s.codigo : '')}">
    <label>Descrição *</label><input id="sDesc" value="${esc(s ? s.descricao : '')}">
    <label>Unidade</label><input id="sUn" value="${esc(s ? s.unidade : 'h')}">
    <label>Valor unitário (R$) *</label><input id="sValor" type="number" step="0.01" value="${s ? s.valor_unitario : ''}">
    ${s ? `<label><input id="sAtivo" type="checkbox" ${s.ativo ? 'checked' : ''}> Ativo</label>` : ''}
    <div class="row"><button class="btn btn-primary" onclick="salvarServico(${s ? s.id : 'null'})">Salvar</button><button class="btn" onclick="closeModal()">Cancelar</button></div>
  </div>`;
}
async function salvarServico(id) {
  const body = { codigo: document.getElementById('sCodigo').value, descricao: document.getElementById('sDesc').value, unidade: document.getElementById('sUn').value, valor_unitario: Number(document.getElementById('sValor').value || 0) };
  if (id) body.ativo = document.getElementById('sAtivo').checked;
  try {
    if (id) await api('/catalogo-servicos/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/catalogo-servicos', { method: 'POST', body: JSON.stringify(body) });
    closeModal(); renderCatalogo();
  } catch (e) { alert(e.message); }
}
/* ---------- Notificações ---------- */
async function renderNotificacoes() {
  const v = document.getElementById('view');
  v.innerHTML = '<h1>Notificações</h1><p class="muted">E-mails automáticos disparados pelo sistema.</p><div class="card" id="notWrap"></div>';
  const list = await api('/notificacoes');
  const tipoLabel = { nova_os_revisor: 'Nova OS para revisor', lembrete_2_dias: 'Lembrete de 2 dias', envio_cliente: 'Envio ao cliente', envio_comercial: 'Envio ao comercial' };
  document.getElementById('notWrap').innerHTML = `<table><thead><tr><th>Data</th><th>Tipo</th><th>Destinatário</th><th>Assunto</th><th>Status</th></tr></thead>
    <tbody>${list.map(n => `<tr><td>${fmtDateTime(n.data_envio)}</td><td>${tipoLabel[n.tipo] || n.tipo}</td><td>${esc(n.destinatario || '')}</td><td>${esc(n.detalhes || '')}</td><td>${n.status === 'enviada' ? '<span class="badge" style="background:#10b981">Enviada</span>' : '<span class="badge" style="background:#f59e0b">Registrada</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhuma notificação</td></tr>'}</tbody></table>`;
}