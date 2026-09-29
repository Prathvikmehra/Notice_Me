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

/** Send an initial intelligence briefing and confirmation email to the topic's recipient. */
export async function sendInitialAlert(topic, snapshot, { env = process.env, createTransport = nodemailer.createTransport } = {}) {
  if (!isAlertConfigured(env)) {
    throw new Error(`Email delivery requires ${SMTP_NAMES.join(', ')}.`);
  }
  if (!topic?.alertEmail) {
    throw new Error('An alert requires a recipient email.');
  }

  const raw = snapshot?.rawData || snapshot || {};
  const searchResults = raw.search || [];
  const newsResults = raw.news || [];
  const briefing = raw.aiBriefing;
  const overviewText = briefing?.coreStatus || raw.overview?.text || searchResults[0]?.snippet || `Live tracking active for ${topic.name}.`;
  const sources = [
    ...newsResults.slice(0, 3).map((n) => n.link),
    ...searchResults.slice(0, 2).map((s) => s.link),
  ].filter(Boolean);

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
  const alertHour = topic.alertHour ?? 12;
  const hourLabel = alertHour === 12 ? '12:00 PM' : alertHour === 0 ? '12:00 AM' : (alertHour > 12 ? `${alertHour - 12}:00 PM` : `${alertHour}:00 AM`);

  const extraPoints = [];
  if (Array.isArray(briefing?.keyPoints) && briefing.keyPoints.length > 0) {
    extraPoints.push('Key Highlights:', ...briefing.keyPoints.map((k) => `• [${k.badge}] ${k.text}`), '');
  }
  if (Array.isArray(briefing?.deadlines) && briefing.deadlines.length > 0) {
    extraPoints.push('Important Deadlines:', ...briefing.deadlines.map((d) => `• ${d.title}: ${d.date} (${d.urgency || 'Important'})`), '');
  }
  if (briefing?.actionRequired) {
    extraPoints.push('Recommended Action:', briefing.actionRequired, '');
  }

  const body = [
    `Notice Me has activated tracking for ${subject}.`,
    '',
    `Current Intelligence Briefing:`,
    overviewText,
    '',
    ...extraPoints,
    ...(sources.length > 0 ? ['Verified Sources:', ...sources.map((url) => `- ${url}`), ''] : []),
    `Schedule Details:`,
    `Starting tomorrow, scheduled alerts will be delivered at ${hourLabel} on weekdays when new changes are detected.`,
  ].join('\n');

  const result = await transport.sendMail({
    from: env.ALERT_FROM,
    to: topic.alertEmail,
    subject: `Notice Me Intelligence: ${subject}`,
    text: body,
  });

  if (!Array.isArray(result?.accepted) || !result.accepted.includes(topic.alertEmail) ||
      (Array.isArray(result?.rejected) && result.rejected.length > 0)) {
    throw new Error('SMTP server did not accept the alert recipient.');
  }
  return true;
}
