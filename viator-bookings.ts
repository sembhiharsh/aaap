import './env';
import Imap from 'imap';

const user = process.env.GMAIL_USER || process.env.EMAIL_USER || '';
const password = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_APP_PASSWORD || '';

const isIcloud = user.toLowerCase().endsWith('@icloud.com') || user.toLowerCase().endsWith('@me.com');
const host = isIcloud ? 'imap.mail.me.com' : 'imap.gmail.com';

export const imapConfig = {
  user,
  password,
  host,
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
};
