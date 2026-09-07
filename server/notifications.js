const db = require('./db');
const { enviarEmail } = require('./email');
const { generateReportHTML } = require('./report');

const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

// Destinatários fixos por perfil (definidos pela Ercomaq)
const EMAILS = {
  admin: ['carlos@ercomaq.com.br'],
  revisor: ['carlos@ercomaq.com.br', 'eliseu@ercomaq.com.br'],
  tecnico: ['eletrica@ercomaq.com.br', 'producao@ercomaq.com.br', 'eliseu@ercomaq.com.br'],
  comercial: ['carlos@ercomaq.com.br', 'comercial@ercomaq.com.br', 'eliseu@ercomaq.com.br']
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Gera o relatório da OS como anexo (arquivo HTML)
function anexoRelatorio(os) {
  try {
    const html = generateReportHTML(os.id);
    if (!html) return [];
    return [{ filename: `${os.numero}.html`, content: html }];
  } catch (e) {
    return [];
  }
}

// Texto de abertura do e-mail ao cliente, considerando o tipo de assistência
function textoAssistencia(os, equipamento) {
  if (os.tipo_assistencia === 'garantia') {
    return `Você está recebendo a OS referente aos serviços realizados pela equipe da Ercomaq no equipamento <b>${equipamento}</b>, em <b>assistência de garantia</b>.`;
  }
  return `Você está recebendo a OS referente aos serviços realizados pela equipe da Ercomaq no equipamento <b>${equipamento}</b>.`;
}

function notifyNovaOS(os) {
  const link = `${APP_URL()}/#/os/${os.id}`;
  EMAILS.revisor.forEach(to => {
    enviarEmail({
      to, osId: os.id, tipo: 'nova_os_revisor',
      subject: `[Ercomaq] Nova OS ${os.numero} aguardando revisão`,
      html: `<p>Uma nova Ordem de Serviço <b>${os.numero}</b> foi lançada e aguarda revisão.</p><p><a href="${link}">Abrir OS</a></p>`
    });
  });
}

function notifyLembreteRevisao(os) {
  const link = `${APP_URL()}/#/os/${os.id}`;
  EMAILS.revisor.forEach(to => {
    enviarEmail({
      to, osId: os.id, tipo: 'lembrete_2_dias',
      subject: `[Ercomaq] OS ${os.numero} há 2 dias aguardando revisão`,
      html: `<p>A OS <b>${os.numero}</b> está há mais de 2 dias sem finalização da revisão.</p><p><a href="${link}">Revisar agora</a></p>`
    });
  });
}

function notifyEnvioCliente(os, cliente, linkAprovacao, emailsCliente) {
  const anexo = anexoRelatorio(os);
  // Busca o equipamento do cadastro (nome + número de série)
  const maquina = os.maquina_id ? db.prepare('SELECT * FROM maquinas WHERE id=?').get(os.maquina_id) : null;
  const equipamento = maquina
    ? `${esc(maquina.descricao)}${maquina.numero_serie ? ' · Série: ' + esc(maquina.numero_serie) : ''}`
    : '—';
  const tipoLabel = os.tipo_assistencia === 'garantia' ? ' (garantia)' : '';
  // E-mails do cliente: padrão do cadastro + os digitados no momento do envio
  const listaCliente = [...new Set([
    (cliente.email || '').trim(),
    ...(emailsCliente || []).map(e => e.trim())
  ].filter(Boolean))].join(', ');
  if (listaCliente) {
    enviarEmail({
      to: listaCliente, osId: os.id, tipo: 'envio_cliente',
      subject: `[Ercomaq] Relatório da OS ${os.numero}${tipoLabel} para aprovação`,
      html: `<p>${textoAssistencia(os, equipamento)}</p>
        <p>Segue em anexo o relatório da OS <b>${os.numero}</b>.</p>
        <p>Para aprovar, acesse: <a href="${linkAprovacao}">${linkAprovacao}</a></p>
        <p>Responder este e-mail também confirma a aprovação.</p>`,
      attachments: anexo
    });
  }
  // Comercial acompanha o envio e recebe o relatório em anexo
  EMAILS.comercial.forEach(c => {
    enviarEmail({
      to: c, osId: os.id, tipo: 'envio_comercial',
      subject: `[Ercomaq] OS ${os.numero}${tipoLabel} enviada ao cliente`,
      html: `<p>A OS <b>${os.numero}</b>${os.tipo_assistencia === 'garantia' ? ' (<b>assistência em garantia</b>)' : ''} foi enviada ao cliente e aguarda aprovação.</p><p>Relatório em anexo.</p>`,
      attachments: anexo
    });
  });
}

// Avisa admin, revisor e comercial quando o cliente aprova a OS
function notifyAprovacaoCliente(os, cliente) {
  const link = `${APP_URL()}/#/os/${os.id}`;
  const destinatarios = [...new Set([...EMAILS.admin, ...EMAILS.revisor, ...EMAILS.comercial])];
  destinatarios.forEach(to => {
    enviarEmail({
      to, osId: os.id, tipo: 'aprovacao_cliente',
      subject: `[Ercomaq] OS ${os.numero} aprovada pelo cliente`,
      html: `<p>A OS <b>${os.numero}</b> foi <b>aprovada</b> pelo cliente <b>${cliente.empresa}</b>.</p>
        <p>O departamento comercial já pode emitir a cobrança.</p>
        <p><a href="${link}">Abrir OS</a></p>`
    });
  });
}

function checkReminders() {
  const limite = new Date(Date.now() - 48 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const rows = db.prepare(`SELECT * FROM os WHERE status='em_revisao' AND data_hora_em_revisao IS NOT NULL AND data_hora_em_revisao < ?`).all(limite);
  rows.forEach(os => {
    const ultimo = db.prepare(`SELECT MAX(data_envio) AS d FROM notificacoes WHERE os_id=? AND tipo='lembrete_2_dias'`).get(os.id);
    if (!ultimo.d || ultimo.d < limite) notifyLembreteRevisao(os);
  });
}

function startReminderJob() {
  checkReminders();
  setInterval(checkReminders, 30 * 60 * 1000); // verifica a cada 30 min
}

module.exports = { notifyNovaOS, notifyLembreteRevisao, notifyEnvioCliente, notifyAprovacaoCliente, startReminderJob };