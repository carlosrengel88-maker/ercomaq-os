const nodemailer = require('nodemailer');
const db = require('./db');

const SMTP_HOST = process.env.SMTP_HOST || 'vultrplesk3.agencianet.net.br';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || 'suporte@ercomaq.com.br';
const SMTP_PASS = process.env.SMTP_PASS || 'pfyq%eBXKFoUh7';
const EMAIL_FROM = process.env.EMAIL_FROM || 'suporte@ercomaq.com.br';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // 465 = SSL direto; 587 = STARTTLS
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

function registrar(osId, tipo, to, status, detalhes) {
  try {
    db.prepare('INSERT INTO notificacoes (os_id,tipo,destinatario,data_envio,status,detalhes) VALUES (?,?,?,?,?,?)')
      .run(osId || null, tipo || null, to || null,
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        status || 'registrada', detalhes || null);
  } catch (e) { /* não deixa o envio quebrar se o registro falhar */ }
}

async function enviarEmail({ to, osId, tipo, subject, html, attachments }) {
  const destinatarios = String(to || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const dest of destinatarios) {
    try {
      await transporter.sendMail({
        from: `"Ercomaq" <${EMAIL_FROM}>`,
        to: dest,
        subject,
        html,
        attachments: attachments || []
      });
      registrar(osId, tipo, dest, 'enviada', subject);
    } catch (e) {
      registrar(osId, tipo, dest, 'falha', (e && e.message) || 'Erro no envio');
    }
  }
}

module.exports = { enviarEmail };