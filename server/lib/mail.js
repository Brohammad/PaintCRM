const nodemailer = require('nodemailer');

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  if (!isSmtpConfigured()) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendMail({ to, subject, text, html }) {
  const transport = createTransport();
  if (!transport) {
    throw new Error('SMTP is not configured');
  }

  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  return transport.sendMail({ from, to, subject, text, html });
}

module.exports = { sendMail, isSmtpConfigured, createTransport };
