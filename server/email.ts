import nodemailer from 'nodemailer';
import { readDb, writeDb, addSystemLog } from './db.js';
import { EmailLog } from '../src/types.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && port && user && pass) {
      try {
        transporter = nodemailer.createTransport({
          host,
          port: parseInt(port),
          secure: parseInt(port) === 465,
          auth: { user, pass }
        });
        addSystemLog('info', `Nodemailer SMTP Transporter initialized successfully. Host: ${host}`);
      } catch (err: any) {
        addSystemLog('error', 'Failed to initialize Nodemailer SMTP Transporter', err?.message || String(err));
      }
    }
  }
  return transporter;
}

export async function sendNotificationEmail(
  toEmail: string,
  toName: string,
  subject: string,
  body: string,
  type: EmailLog['type']
): Promise<EmailLog> {
  // Read database to ensure we can log
  const db = readDb();

  const emailId = 'email_' + Math.random().toString(36).substr(2, 9);
  const log: EmailLog = {
    id: emailId,
    toEmail,
    toName,
    subject,
    body,
    sentAt: new Date().toISOString(),
    type,
    status: 'pending',
    retryCount: 0
  };

  const client = getTransporter();
  const from = process.env.SMTP_FROM || 'noreply@clinicmanager.com';

  if (client) {
    try {
      await client.sendMail({
        from: `"Clinic Manager" <${from}>`,
        to: `"${toName}" <${toEmail}>`,
        subject,
        text: body,
      });
      log.status = 'sent';
      addSystemLog('info', `Email notification sent successfully to ${toEmail}. Subject: ${subject}`);
    } catch (err: any) {
      log.status = 'failed';
      log.error = err?.message || String(err);
      addSystemLog('error', `Failed to send email to ${toEmail}. Simulating queue and log retry.`, log.error);
    }
  } else {
    // Simulated mode (no SMTP variables set)
    log.status = 'sent'; // in mock mode, mark as "sent" immediately for sandbox viewing
    addSystemLog('info', `Simulated Email Sent (SMTP Credentials not configured). Saved to Email Logs Sandbox for review. To: ${toEmail}`);
  }

  db.emailLogs.unshift(log);
  if (db.emailLogs.length > 300) {
    db.emailLogs = db.emailLogs.slice(0, 300);
  }
  await writeDb();
  return log;
}

export async function retryEmailLog(emailId: string): Promise<boolean> {
  const db = readDb();
  const index = db.emailLogs.findIndex(e => e.id === emailId);
  if (index === -1) return false;

  const log = db.emailLogs[index];
  log.retryCount += 1;
  log.status = 'pending';

  const client = getTransporter();
  const from = process.env.SMTP_FROM || 'noreply@clinicmanager.com';

  if (client) {
    try {
      await client.sendMail({
        from: `"Clinic Manager" <${from}>`,
        to: `"${log.toName}" <${log.toEmail}>`,
        subject: log.subject,
        text: log.body,
      });
      log.status = 'sent';
      log.error = undefined;
      addSystemLog('info', `Email ID ${emailId} successfully retried and sent to ${log.toEmail}`);
    } catch (err: any) {
      log.status = 'failed';
      log.error = err?.message || String(err);
      addSystemLog('error', `Email retry ID ${emailId} failed again: ${log.error}`);
    }
  } else {
    log.status = 'sent';
    log.error = undefined;
    addSystemLog('info', `Email retry ID ${emailId} simulated successfully in sandbox mode.`);
  }

  await writeDb();
  return log.status === 'sent';
}
