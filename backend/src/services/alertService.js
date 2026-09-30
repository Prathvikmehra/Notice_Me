import nodemailer from 'nodemailer';
import { getFrequencyLabel } from '../../../scripts/frequency.js';

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

/** Send an immediate confirmation email when a user enables or updates alerts for a topic. */
export async function sendAlertConfirmationEmail(topic, { env = process.env, createTransport = nodemailer.createTransport } = {}) {
  if (!isAlertConfigured(env)) {
    return false;
  }
  if (!topic?.alertEmail) {
    throw new Error('An alert confirmation requires a recipient email.');
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
  const alertHour = topic.alertHour ?? 12;
  const hourLabel = alertHour === 12 ? '12:00 PM' : alertHour === 0 ? '12:00 AM' : (alertHour > 12 ? `${alertHour - 12}:00 PM` : `${alertHour}:00 AM`);
  const freqLabel = getFrequencyLabel(topic.alertFrequency || '3h');
  const daysLabel = topic.alertDays === 'all'
    ? 'Every day (including weekends)'
    : topic.alertDays === 'weekdays'
    ? 'Weekdays (Monday through Friday)'
    : `On ${String(topic.alertDays || 'scheduled days').toUpperCase()}`;
  const tz = topic.timezone || 'Asia/Kolkata';

  const isIntraday = ['1h', '3h'].includes(String(topic.alertFrequency).toLowerCase().trim());
  const intervalDescription = isIntraday
    ? `Continuous monitoring interval: ${freqLabel.toUpperCase()} (checked around the clock).`
    : `Scheduled interval: ${freqLabel.toUpperCase()} at ${hourLabel} (${daysLabel}, Timezone: ${tz}).`;

  const frontendBaseUrl = (env.FRONTEND_URL || (env.FRONTEND_ORIGIN ? env.FRONTEND_ORIGIN.split(',')[0].trim() : 'http://localhost:5173')).replace(/\/+$/, '');
  const topicUrl = `${frontendBaseUrl}/?topic=${encodeURIComponent(topic.id || '')}`;

  const body = [
    `Notice Me — Alert Activation Confirmation`,
    '',
    `Hello,`,
    '',
    `You have successfully enabled email notifications for:`,
    `📌 Topic: ${subject}`,
    `🔍 Monitored Query: "${topic.query}"`,
    `🔗 Topic Link: ${topicUrl}`,
    '',
    `⏰ Alert Delivery Schedule & Interval:`,
    `• ${intervalDescription}`,
    `• Verified intelligence updates and diff notices will be delivered directly to ${topic.alertEmail} whenever new official announcements or web changes are verified.`,
    '',
    `View intelligence, timelines, or adjust settings anytime:`,
    `${topicUrl}`,
    '',
    `— Notice Me Public Notice Radar`,
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #172923; max-width: 580px; border: 2px solid #172923; padding: 24px; border-radius: 8px; background: #FAFDF7;">
      <h2 style="color: #172923; margin-top: 0; border-bottom: 2px solid #172923; padding-bottom: 8px;">Notice Me — Alert Activation Confirmation</h2>
      <p>Hello,</p>
      <p>You have successfully enabled email notifications for <strong>${subject}</strong>.</p>
      <div style="background: #FFFFFF; border: 1px solid #D1D5DB; padding: 14px; border-radius: 6px; margin: 16px 0;">
        <p style="margin: 4px 0;">📌 <strong>Topic:</strong> ${subject}</p>
        <p style="margin: 4px 0;">🔍 <strong>Query:</strong> <em>“${topic.query}”</em></p>
        <p style="margin: 4px 0;">⏰ <strong>Interval:</strong> ${intervalDescription}</p>
      </div>
      <p style="margin: 20px 0;">
        <a href="${topicUrl}" style="display: inline-block; background: #C9E990; color: #172923; padding: 11px 20px; font-weight: 800; text-decoration: none; border: 2px solid #172923; border-radius: 6px; box-shadow: 2px 2px 0px #172923;">
          Open Topic in Dashboard ↗
        </a>
      </p>
      <p style="font-size: 12px; color: #64748B; margin-top: 24px;">Direct Link: <a href="${topicUrl}" style="color: #2563EB;">${topicUrl}</a></p>
    </div>
  `;

  const result = await transport.sendMail({
    from: env.ALERT_FROM,
    to: topic.alertEmail,
    subject: `Notice Me: Email Alerts Activated for “${subject}”`,
    text: body,
    html,
  });

  if (!Array.isArray(result?.accepted) || !result.accepted.includes(topic.alertEmail) ||
      (Array.isArray(result?.rejected) && result.rejected.length > 0)) {
    throw new Error('SMTP server did not accept the alert confirmation recipient.');
  }
  return true;
}

