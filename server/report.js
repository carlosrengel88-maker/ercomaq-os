const db = require('./db');
const fs = require('fs');
const path = require('path');

function money(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function brDate(s) {
  if (!s) return '';
  return new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR');
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Lê o logo e converte para base64, para o relatório funcionar também fora do servidor (anexo de e-mail)
function logoDataURI() {
  try {
    const p = path.join(__dirname, '..', 'public', 'logo-ercomaq.png');
    if (!fs.existsSync(p)) return '';
    return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
  } catch (e) {
    return '';
  }
}

function generateReportHTML(osId) {
  const os = db.prepare('SELECT * FROM os WHERE id=?').get(osId);
  if (!os) return null;
  const cliente = db.prepare('SELECT * FROM clientes WHERE id=?').get(os.cliente_id);
  const maquina = os.maquina_id ? db.prepare('SELECT * FROM maquinas WHERE id=?').get(os.maquina_id) : null;
  const tecnico = db.prepare('SELECT nome FROM usuarios WHERE id=?').get(os.tecnico_id);
  const materiais = db.prepare('SELECT * FROM os_materiais WHERE os_id=? ORDER BY id').all(osId);
  const servicos = db.prepare('SELECT s.*, c.codigo AS catalogo_codigo FROM os_servicos s LEFT JOIN catalogo_servicos c ON c.id = s.catalogo_id WHERE s.os_id=? ORDER BY s.id').all(osId);
  const horas = db.prepare('SELECT * FROM os_horas WHERE os_id=? ORDER BY id').all(osId);
  const logo = logoDataURI();

  const statusLabel = {
    rascunho: 'Rascunho', em_revisao: 'Em revisão', aguardando_cliente: 'Aguardando cliente',
    aprovada: 'Aprovada', cobrada: 'Cobrada', recebida: 'Recebida', cancelada: 'Cancelada'
  };
  const tipoLabel = { cobranca: 'Cobrança', garantia: 'Garantia' };
  const totalPecas = materiais.reduce((s, m) => s + (m.valor_total || 0), 0);
  const totalServicos = servicos.reduce((s, x) => s + (x.valor_total || 0), 0);

  // Valores de garantia/cobrança: usa os congelados no envio ao cliente (valor de encerramento);
  // se a OS ainda não foi enviada, calcula direto dos itens (sempre pelo checkbox de cada item)
  const congelado = !!os.data_encerramento;
  const vGarantia = congelado
    ? (os.valor_garantia || 0)
    : materiais.filter(m => m.garantia).reduce((s, m) => s + (m.valor_total || 0), 0)
      + servicos.filter(s => s.garantia).reduce((s, x) => s + (x.valor_total || 0), 0);
  const vCobranca = congelado
    ? (os.valor_cobranca || 0)
    : materiais.filter(m => !m.garantia).reduce((s, m) => s + (m.valor_total || 0), 0)
      + servicos.filter(s => !s.garantia).reduce((s, x) => s + (x.valor_total || 0), 0);
  const totalGeral = vGarantia + vCobranca;

  const totalMinH = horas.reduce((s, h) => {
    if (!h.tempo_total) return s;
    const p = h.tempo_total.split(':').map(Number);
    return s + (p[0] || 0) * 60 + (p[1] || 0);
  }, 0);
  const totalHH = String(Math.floor(totalMinH / 60)).padStart(2, '0') + ':' + String(totalMinH % 60).padStart(2, '0');
  const totalHDec = (totalMinH / 60).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>OS ${os.numero}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; padding: 24px; }
  .no-print { margin-bottom: 12px; }
  button { padding: 8px 14px; font-size: 13px; cursor: pointer; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 16px; gap: 16px; }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .logo { height: 64px; width: auto; display: block; }
  .empresa { font-size: 12px; line-height: 1.5; color: #333; }
  .empresa strong { font-size: 14px; color: #1e3a8a; display: block; margin-bottom: 2px; }
  .doc { text-align: right; }
  .doc h1 { font-size: 19px; color: #1e3a8a; }
  .garantia-banner { background: #f59e0b; color: #fff; font-weight: bold; text-align: center; padding: 8px; font-size: 14px; letter-spacing: 1px; margin-bottom: 12px; border-radius: 4px; }
  .box { border: 1px solid #999; margin-bottom: 12px; }
  .box h3 { background: #e2e8f0; padding: 4px 8px; font-size: 11px; text-transform: uppercase; }
  .box .body { padding: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
  th { background: #e2e8f0; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .totais { display: flex; justify-content: flex-end; gap: 24px; margin-top: 8px; flex-wrap: wrap; }
  .total-horas { margin-top: 6px; font-weight: bold; }
  .vistos { display: flex; justify-content: space-between; margin-top: 40px; }
  .visto { border-top: 1px solid #333; width: 40%; padding-top: 4px; text-align: center; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
<div class="no-print"><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
<div class="header">
  <div class="header-left">
    ${logo ? `<img src="${logo}" alt="Ercomaq Soluções Industriais Ltda." class="logo">` : ''}
    <div class="empresa">
      <strong>Ercomaq Soluções Industriais Ltda.</strong>
      CNPJ: 07.683.194/0001-16<br>
      Elizeu Grasselli, 387 - Universitário<br>
      Bento Gonçalves/RS - CEP 95705-358<br>
      Tel: (54) 3454-6647 · suporte@ercomaq.com.br<br>
      www.ercomaq.com.br
    </div>
  </div>
  <div class="doc">
    <h1>ORDEM DE SERVIÇO ${os.numero}</h1>
    <p>Status: ${statusLabel[os.status]} · Entrada: ${brDate(os.data_entrada)}${os.data_saida ? ' · Saída: ' + brDate(os.data_saida) : ''}</p>
    ${os.tipo_assistencia ? `<p>Tipo de assistência: ${tipoLabel[os.tipo_assistencia] || os.tipo_assistencia}</p>` : ''}
    ${os.origem_assistencia ? `<p>Origem da assistência: ${esc(os.origem_assistencia)}</p>` : ''}
    ${os.assunto ? `<p>Assunto: ${esc(os.assunto)}</p>` : ''}
    <p>Anotado por: ${tecnico.nome}</p>
  </div>
</div>
${os.tipo_assistencia === 'garantia' ? '<div class="garantia-banner">ASSISTÊNCIA EM GARANTIA</div>' : ''}
<div class="grid2">
  <div class="box"><h3>Cliente</h3><div class="body">
    <strong>${esc(cliente.empresa)}</strong>${cliente.fantasia ? ' (' + esc(cliente.fantasia) + ')' : ''}<br>
    ${os.solicitante ? 'Solicitante da assistência: <strong>' + esc(os.solicitante) + '</strong><br>' : ''}
    ${esc(cliente.endereco || '')} ${esc(cliente.bairro || '')}<br>
    ${esc(cliente.cidade || '')} ${esc(cliente.cep || '')}<br>
    ${esc(cliente.contato || '')} ${esc(cliente.email || '')} ${esc(cliente.telefone || '')}
  </div></div>
  <div class="box"><h3>Equipamento</h3><div class="body">
    ${maquina ? esc(maquina.descricao) + '<br>Série: ' + esc(maquina.numero_serie || '—') : '—'}
  </div></div>
</div>
<div class="box"><h3>Defeito relatado</h3><div class="body">${esc(os.defeito || '—')}</div></div>
<div class="box"><h3>Serviço realizado</h3><div class="body">${esc(os.servico_realizado || '—')}</div></div>
<div class="box"><h3>Materiais utilizados</h3><div class="body">
  <table><thead><tr><th>Código</th><th>Descrição</th><th>Qtd</th><th>Un</th><th>Vlr unit</th><th>Vlr total</th><th>Garantia</th></tr></thead>
  <tbody>${materiais.map(m => `<tr><td>${esc(m.codigo_erp || '')}</td><td>${esc(m.descricao_erp || m.descricao_tecnico)}</td><td>${m.quantidade}</td><td>${esc(m.unidade)}</td><td>${m.valor_unitario ? money(m.valor_unitario) : ''}</td><td>${m.valor_total ? money(m.valor_total) : ''}</td><td>${m.garantia ? 'Sim' : 'Não'}</td></tr>`).join('') || '<tr><td colspan="7">—</td></tr>'}</tbody></table>
</div></div>
<div class="box"><h3>Mão de obra / Serviços</h3><div class="body">
  <table><thead><tr><th>Código</th><th>Descrição</th><th>Horas</th><th>Vlr unit</th><th>Vlr total</th><th>Garantia</th></tr></thead>
  <tbody>${servicos.map(s => `<tr><td>${esc(s.catalogo_codigo || '')}</td><td>${esc(s.descricao)}</td><td>${s.horas}</td><td>${money(s.valor_unitario)}</td><td>${money(s.valor_total)}</td><td>${s.garantia ? 'Sim' : 'Não'}</td></tr>`).join('') || '<tr><td colspan="6">—</td></tr>'}</tbody></table>
</div></div>
<div class="box"><h3>Relatório de horas</h3><div class="body">
  <table><thead><tr><th>Data</th><th>Colaborador</th><th>Entrada</th><th>Saída</th><th>Tempo</th></tr></thead>
  <tbody>${horas.map(h => `<tr><td>${h.data ? brDate(h.data) : '—'}</td><td>${esc(h.colaborador)}</td><td>${esc(h.entrada || '')}</td><td>${esc(h.saida || '')}</td><td>${esc(h.tempo_total || '')}</td></tr>`).join('') || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
  <p class="total-horas">Tempo total: ${totalHH} · Decimal: ${totalHDec} h</p>
</div></div>
<div class="box"><h3>Observações</h3><div class="body">${esc(os.observacoes || '—')}</div></div>
<div class="box"><h3>Totais</h3><div class="body">
  <div class="totais">
    <span>Peças: <strong>${money(totalPecas)}</strong></span>
    <span>Serviços: <strong>${money(totalServicos)}</strong></span>
    <span>Valor em garantia: <strong>${money(vGarantia)}</strong></span>
    <span>Valor para cobrança: <strong>${money(vCobranca)}</strong></span>
    <span>Total geral: <strong>${money(totalGeral)}</strong></span>
  </div>
  ${os.tipo_assistencia === 'garantia' ? '<p style="margin-top:6px"><strong>Assistência em garantia</strong> — os valores cobertos são os itens marcados como garantia.</p>' : ''}
</div></div>
<div class="vistos"><div class="visto">Visto — Revisor</div><div class="visto">Visto — Cliente</div></div>
</body>
</html>`;
}

module.exports = { generateReportHTML };