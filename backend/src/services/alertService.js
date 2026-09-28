import nodemailer from 'nodemailer';

const SMTP_NAMES = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'ALERT_FROM'];

export function isAlertConfigured(env = process.env) {
  return SMTP_NAMES.every((name) => typeof env[name] === 'string' && env[name].trim());
}

/** Send a new Diff to the Topic's configured recipient; reject on any failure. */
export async function sendDiffAlert(topic, diff, { env = process.env, createTransport = nodemailer.createTransport } = {}) {
  if (!isAlertConfigured(env)) {
    throw new Error(`Email delivery requires ${SMTP_NAMES.join(', ')}.`);
  }
  if (!topic?.alertEmail || !diff?.summary || !Array.isArray(diff.sourceUrls)) {
    throw new Error('An alert requires a recipient, summary, and source URLs.');
  }
  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a valid port.');

  const transport = createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  const subject = String(topic.name || 'Tracked topic').replace(/[\r\n]/g, ' ').trim();
  const body = [
    `Notice Me detected a change for ${subject}.`,
    '',
    diff.summary,
    '',
    'Sources:',
    ...diff.sourceUrls.map((url) => `- ${url}`),
    '',
    'You receive this because alerts are enabled for this topic.',
  ].join('\n');
  const result = await transport.sendMail({
    from: env.ALERT_FROM,
    to: topic.alertEmail,
    subject: `Notice Me update: ${subject}`,
    text: body,
  });
  if (!Array.isArray(result?.accepted) || !result.accepted.includes(topic.alertEmail) ||
      (Array.isArray(result?.rejected) && result.rejected.length > 0)) {
    throw new Error('SMTP server did not accept the alert recipient.');
  }
  return true;
}
