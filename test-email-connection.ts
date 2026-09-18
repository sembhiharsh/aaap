import './env';
import Imap from 'imap';

const user = process.env.GMAIL_USER || process.env.EMAIL_USER || '';
const password = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_APP_PASSWORD || '';

if (!user || !password) {
  console.error('? Missing GMAIL_USER / GMAIL_APP_PASSWORD in .env.local');
  process.exit(1);
}

const isIcloud = user.toLowerCase().endsWith('@icloud.com') || user.toLowerCase().endsWith('@me.com');
const host = isIcloud ? 'imap.mail.me.com' : 'imap.gmail.com';

console.log(`Connecting to IMAP (${host}) for ${user}...`);

const imap = new Imap({
  user,
  password,
  host,
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

imap.once('ready', () => {
  console.log(`? Successfully connected and authenticated to ${host}!`);
  imap.openBox('INBOX', true, (err, box) => {
    if (err) {
      console.error('Error opening INBOX:', err);
    } else {
      console.log(`? INBOX opened successfully. Total messages: ${box.messages.total}`);
    }
    imap.end();
  });
});

imap.once('error', (err: any) => {
  console.error('? IMAP Connection Error:', err.message);
});

imap.once('end', () => {
  console.log('IMAP connection closed.');
});

imap.connect();
