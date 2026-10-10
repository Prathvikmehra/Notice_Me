import 'dotenv/config';
import { isAlertConfigured, verifySmtpConnection, createMailTransport } from '../backend/src/services/alertService.js';

const recipient = process.argv[2];

console.log('='.repeat(60));
console.log(' Notice Me — SMTP Diagnostic & Verification Tool');
console.log('='.repeat(60));

const config = {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS ? '******** (masked)' : undefined,
  from: process.env.ALERT_FROM,
  secure: process.env.SMTP_SECURE || (Number(process.env.SMTP_PORT) === 465 ? 'true (SSL)' : 'false (STARTTLS)'),
  family: process.env.SMTP_FAMILY || '4 (IPv4)',
};

console.log('\n[Current Configuration]');
console.table(config);

if (!isAlertConfigured()) {
  console.error('\n❌ Incomplete SMTP configuration!');
  console.error('Required variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_FROM\n');
  process.exit(1);
}

async function run() {
  console.log(`\n⏳ Connecting to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} via IPv4...`);
  const startTime = Date.now();

  try {
    await verifySmtpConnection();
    const elapsed = Date.now() - startTime;
    console.log(`✅ SMTP connection & credentials verified successfully! (${elapsed}ms)`);

    if (recipient) {
      console.log(`\n📨 Dispatching test email to ${recipient}...`);
      const transport = createMailTransport();
      const info = await transport.sendMail({
        from: process.env.ALERT_FROM,
        to: recipient,
        subject: 'Notice Me — SMTP Test Alert',
        text: 'This is a test notification confirming that Notice Me SMTP email alerts are operating correctly.',
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 2px solid #172923; border-radius: 8px; background: #FAFDF7; max-width: 500px;">
            <h2 style="color: #172923; margin-top: 0;">Notice Me SMTP Test Alert</h2>
            <p>Your SMTP alert configuration is connected and verified.</p>
            <p style="color: #64748B; font-size: 13px;">Sent at: ${new Date().toISOString()}</p>
          </div>
        `,
      });
      console.log(`✅ Test email delivered successfully! Message ID: ${info.messageId}`);
    } else {
      console.log('\n💡 Tip: Run `node scripts/test-smtp.js your_email@example.com` to send a test email.');
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`\n❌ SMTP Verification Failed after ${elapsed}ms:`, err.message);

    if (err.message?.includes('timeout') || err.code === 'ETIMEDOUT') {
      console.log('\n🔍 Troubleshooting "Connection timeout":');
      console.log('1. On cloud hosts (e.g. Render), outbound port 587 can be blocked or throttled.');
      console.log('   👉 Try switching to port 465 (SSL): set SMTP_PORT=465 in your environment variables.');
      console.log('2. If using Gmail (smtp.gmail.com):');
      console.log('   👉 Make sure you generated a 16-character App Password (not your normal Gmail password).');
      console.log('      Go to: https://myaccount.google.com/apppasswords');
      console.log('3. If dual-stack IPv6 is causing packet drops on your server:');
      console.log('   👉 The Notice Me backend now automatically defaults to IPv4 (family: 4).');
    } else if (err.message?.includes('535') || err.message?.includes('Username and Password not accepted')) {
      console.log('\n🔍 Troubleshooting Authentication Failure:');
      console.log('1. For Gmail, your standard account password will NOT work if 2FA is enabled.');
      console.log('   👉 Generate an App Password: https://myaccount.google.com/apppasswords');
      console.log('2. Verify SMTP_USER matches the email associated with the App Password.');
    }
    process.exit(1);
  }
}

run();
