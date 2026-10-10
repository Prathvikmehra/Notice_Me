import nodemailer from 'nodemailer';
import { getFrequencyLabel } from '../../../scripts/frequency.js';
import { classifyImpact } from '../../../scripts/diff-engine.js';

const SMTP_NAMES = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'ALERT_FROM'];

export function isAlertConfigured(env = process.env) {
  return SMTP_NAMES.every((name) => typeof env[name] === 'string' && env[name].trim());
}
function cleanExplanation(text) {
  if (!text || typeof text !== 'string') return '';
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^New result:|^Removed result:/i.test(l));
  
  if (lines.length > 0) return lines.join('\n');
  const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const newItems = rawLines.filter((l) => /^New result:/i.test(l)).map((l) => l.replace(/^New result:\s*/i, ''));
  const remItems = rawLines.filter((l) => /^Removed result:/i.test(l)).map((l) => l.replace(/^Removed result:\s*/i, ''));
  const parts = [];
  if (newItems.length > 0) parts.push(`Added sources: ${newItems.slice(0, 2).join('; ')}`);
  if (remItems.length > 0) parts.push(`Removed sources: ${remItems.slice(0, 2).join('; ')}`);
  return parts.join(' | ') || 'Crawler detected updated search records.';
}

function sanitizeTextValue(val) {
  if (!val || typeof val !== 'string') return null;
  let s = val.trim();
  if (s.includes('\n')) {
    const validLines = s
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^New result:|^Removed result:/i.test(l));
    s = validLines.length > 0 ? validLines[validLines.length - 1] : '';
  }
  s = s.replace(/^["'`]|["'`]$/g, '').trim();
  return s || null;
}

export function getTransportOptions(env = process.env) {
  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a valid port.');

  const isSecure = env.SMTP_SECURE !== undefined
    ? (String(env.SMTP_SECURE).toLowerCase() === 'true' || env.SMTP_SECURE === true)
    : port === 465;

  const options = {
    host: env.SMTP_HOST,
    port,
    secure: isSecure,
    requireTLS: port !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    family: Number(env.SMTP_FAMILY || 4),
    connectionTimeout: Number(env.SMTP_CONNECTION_TIMEOUT || 15000),
    greetingTimeout: Number(env.SMTP_GREETING_TIMEOUT || 15000),
    socketTimeout: Number(env.SMTP_SOCKET_TIMEOUT || 30000),
  };

  if (env.SMTP_SERVICE) {
    options.service = env.SMTP_SERVICE;
  }

  return options;
}

export function createMailTransport(env = process.env, createTransport = nodemailer.createTransport) {
  return createTransport(getTransportOptions(env));
}

export async function verifySmtpConnection({ env = process.env, createTransport = nodemailer.createTransport } = {}) {
  if (!isAlertConfigured(env)) {
    throw new Error(`Email delivery requires ${SMTP_NAMES.join(', ')}.`);
  }
  const transport = createMailTransport(env, createTransport);
  if (typeof transport.verify === 'function') {
    return await transport.verify();
  }
  return true;
}

export function parseDiffSummary(summary, topic = { name: 'Tracked Topic' }, sourceUrls = []) {
  if (typeof summary === 'string') {
    const trimmed = summary.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.headline === 'string') {
          parsed.before = sanitizeTextValue(parsed.before);
          parsed.after = sanitizeTextValue(parsed.after);
          parsed.explanation = cleanExplanation(parsed.explanation);
          return parsed;
        }
      } catch {}
    }
  }

  const text = String(summary || '').trim();
  const impact = classifyImpact(text);
  const isCritical = impact === 'HIGH';

  let before = null;
  let after = null;
  if (text.includes(' → ')) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const changeLine = lines.find((l) => l.includes(' → '));
    if (changeLine) {
      const parts = changeLine.split(' → ');
      const rawBefore = parts[0].includes(':')
        ? parts[0].slice(parts[0].lastIndexOf(':') + 1).trim()
        : parts[0].trim();
      const rawAfter = (parts[1] || '').split('\n')[0].trim();
      before = rawBefore.replace(/^.*:\s*/, '').replace(/^["'`]|["'`]$/g, '').trim() || null;
      after = rawAfter.replace(/^.*:\s*/, '').replace(/^["'`]|["'`]$/g, '').trim() || null;
    }
  }

  const explanation = cleanExplanation(text);

  const evidence = (sourceUrls || []).slice(0, 3).map((url) => {
    let domain = 'source';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}
    const isGov = /\.(gov|nic|ac|edu)\.in$|\.gov$|court|judicature/i.test(domain);
    return {
      title: `${topic.name || 'Topic'} Source`,
      url,
      domain,
      sourceType: isGov ? 'Official Portal' : 'Public Web Source',
      excerpt: explanation.slice(0, 180),
    };
  });

  return {
    headline: text.includes('\n') ? text.split('\n')[0].replace(/^.*:\s*/, '').slice(0, 90) : (text.slice(0, 90) || `${topic.name || 'Topic'} Changed`),
    explanation: explanation || 'Public notice radar detected a change.',
    before,
    after,
    whyItMatters: isCritical ? 'Directly alters important dates, eligibility, or required action.' : 'Updates official status and latest records.',
    whoIsAffected: `Individuals monitoring ${topic.name || 'this topic'}`,
    actionRequired: isCritical ? 'Check updated deadlines and verify instructions on the official website.' : null,
    impact,
    whyAmISeeingThis: [
      `Matches your monitored topic "${topic.name || 'Notice'}"`,
      evidence.some((e) => e.sourceType === 'Official Portal') ? 'Verified official source publication' : 'Detected in recent search & news crawl',
    ],
    evidence,
  };
}

/** Send a new Diff to the Topic's configured recipient; reject on any failure. */
export async function sendDiffAlert(topic, diff, { env = process.env, createTransport = nodemailer.createTransport } = {}) {
  if (!isAlertConfigured(env)) {
    throw new Error(`Email delivery requires ${SMTP_NAMES.join(', ')}.`);
  }
  if (!topic?.alertEmail || !diff?.summary || !Array.isArray(diff.sourceUrls)) {
    throw new Error('An alert requires a recipient, summary, and source URLs.');
  }
  const transport = createTransport(getTransportOptions(env));

  const subject = String(topic.name || 'Tracked topic').replace(/[\r\n]/g, ' ').trim();
  const structured = parseDiffSummary(diff.summary, topic, diff.sourceUrls);
  const impactIcon = structured.impact === 'HIGH' ? '🔴' : structured.impact === 'MEDIUM' ? '🟠' : '🟡';

  const frontendBaseUrl = (env.FRONTEND_URL || (env.FRONTEND_ORIGIN ? env.FRONTEND_ORIGIN.split(',')[0].trim() : 'http://localhost:5173')).replace(/\/+$/, '');
  const topicUrl = `${frontendBaseUrl}/?topic=${encodeURIComponent(topic.id || '')}`;

  const bodyLines = [
    `${impactIcon} NOTICE ME ALERT: ${subject.toUpperCase()} CHANGED`,
    '',
    `📌 What Changed: ${structured.headline}`,
    `${structured.explanation}`,
    '',
  ];

  if (structured.before || structured.after) {
    bodyLines.push(`BEFORE: ${structured.before || '(Previously reported)'}`);
    bodyLines.push(`AFTER:  ${structured.after || '(Updated state)'}`);
    bodyLines.push('');
  }

  bodyLines.push(`⚡ Impact Level: ${structured.impact}`);
  if (structured.whyItMatters) bodyLines.push(`💡 Why It Matters: ${structured.whyItMatters}`);
  if (structured.whoIsAffected) bodyLines.push(`👥 Who Is Affected: ${structured.whoIsAffected}`);
  if (structured.actionRequired) bodyLines.push(`⚠️ Action Required: ${structured.actionRequired}`);
  bodyLines.push('');

  if (Array.isArray(structured.whyAmISeeingThis) && structured.whyAmISeeingThis.length > 0) {
    bodyLines.push('❓ Why am I seeing this?');
    structured.whyAmISeeingThis.forEach((reason) => bodyLines.push(`✓ ${reason}`));
    bodyLines.push('');
  }

  bodyLines.push(`[View Change in Dashboard]: ${topicUrl}`);
  bodyLines.push('');
  bodyLines.push('Sources:');
  const sourceList = structured.evidence?.length > 0
    ? structured.evidence.map((e) => `- ${e.title || e.domain} (${e.url})`)
    : diff.sourceUrls.map((url) => `- ${url}`);
  bodyLines.push(...sourceList);
  bodyLines.push('');
  bodyLines.push('— Notice Me Public Notice Radar');

  const impactBg = structured.impact === 'HIGH' ? '#FEE2E2' : structured.impact === 'MEDIUM' ? '#FEF3C7' : '#E0F2FE';
  const impactText = structured.impact === 'HIGH' ? '#991B1B' : structured.impact === 'MEDIUM' ? '#92400E' : '#075985';
  const impactBorder = structured.impact === 'HIGH' ? '#EF4444' : structured.impact === 'MEDIUM' ? '#F59E0B' : '#0284C7';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #172923; max-width: 600px; border: 2px solid #172923; padding: 24px; border-radius: 8px; background: #FAFDF7;">
      <div style="display: inline-block; background: ${impactBg}; color: ${impactText}; border: 1.5px solid ${impactBorder}; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 12px;">
        ${impactIcon} ${structured.impact} IMPACT CHANGE
      </div>
      <h2 style="color: #172923; margin: 0 0 8px; border-bottom: 2px solid #172923; padding-bottom: 8px;">${subject}</h2>
      <h3 style="color: #1E293B; margin: 12px 0 6px; font-size: 18px;">${structured.headline}</h3>
      <p style="margin: 0 0 16px; font-size: 14px; color: #334155;">${structured.explanation}</p>

      ${(structured.before || structured.after) ? `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 16px 0; background: #FFFFFF; border: 1.5px solid #CBD5E1; border-radius: 6px; padding: 12px;">
          <div style="border-right: 1px solid #E2E8F0; padding-right: 10px;">
            <div style="font-size: 11px; font-weight: 800; color: #DC2626; text-transform: uppercase;">BEFORE</div>
            <div style="font-size: 13px; font-weight: 600; color: #475569; margin-top: 4px;">${structured.before || '—'}</div>
          </div>
          <div>
            <div style="font-size: 11px; font-weight: 800; color: #16A34A; text-transform: uppercase;">AFTER</div>
            <div style="font-size: 13px; font-weight: 700; color: #15803D; margin-top: 4px;">${structured.after || '—'}</div>
          </div>
        </div>
      ` : ''}

      ${structured.whyItMatters ? `
        <div style="background: #FFFFFF; border-left: 3px solid #10B981; padding: 10px 14px; border-radius: 4px; margin: 12px 0; font-size: 13px;">
          <strong>💡 Why It Matters:</strong> ${structured.whyItMatters}
        </div>
      ` : ''}

      ${structured.actionRequired ? `
        <div style="background: #FFFBEB; border-left: 3px solid #F59E0B; padding: 10px 14px; border-radius: 4px; margin: 12px 0; font-size: 13px; color: #92400E;">
          <strong>⚠️ Action Required:</strong> ${structured.actionRequired}
        </div>
      ` : ''}

      ${Array.isArray(structured.whyAmISeeingThis) && structured.whyAmISeeingThis.length > 0 ? `
        <div style="margin: 16px 0; font-size: 12px; color: #475569; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px 14px; border-radius: 6px;">
          <strong style="color: #1E293B;">Why am I seeing this?</strong>
          <ul style="margin: 4px 0 0; padding-left: 18px;">
            ${structured.whyAmISeeingThis.map((r) => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div style="margin: 20px 0;">
        <a href="${topicUrl}" style="display: inline-block; background: #C9E990; color: #172923; padding: 11px 22px; font-weight: 800; text-decoration: none; border: 2px solid #172923; border-radius: 6px; box-shadow: 2px 2px 0px #172923;">
          View Change in Dashboard ↗
        </a>
      </div>

      <div style="border-top: 1px solid #CBD5E1; padding-top: 12px; margin-top: 18px; font-size: 12px; color: #64748B;">
        <strong>Verified Sources:</strong>
        <div style="margin-top: 6px;">
          ${(structured.evidence?.length > 0 ? structured.evidence : diff.sourceUrls.map((u) => ({ url: u, domain: 'source' }))).map((src) => `
            <a href="${src.url}" style="color: #2563EB; text-decoration: underline; margin-right: 12px; display: inline-block;">${src.title || src.domain || src.url} ↗</a>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  const result = await transport.sendMail({
    from: env.ALERT_FROM,
    to: topic.alertEmail,
    subject: `Notice Me update: ${subject} — ${impactIcon} ${structured.headline || 'Change detected'}`,
    text: bodyLines.join('\n'),
    html,
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

  const transport = createTransport(getTransportOptions(env));

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

  const transport = createTransport(getTransportOptions(env));

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

