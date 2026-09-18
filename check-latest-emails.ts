import './env';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

const user = process.env.GMAIL_USER || process.env.EMAIL_USER || '';
const password = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_APP_PASSWORD || '';

if (!user || !password) {
  console.error('? Missing GMAIL_USER / GMAIL_APP_PASSWORD');
  process.exit(1);
}

const isIcloud = user.toLowerCase().endsWith('@icloud.com') || user.toLowerCase().endsWith('@me.com');
const host = isIcloud ? 'imap.mail.me.com' : 'imap.gmail.com';

const imap = new Imap({
  user,
  password,
  host,
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

imap.once('ready', () => {
  imap.openBox('INBOX', false, (err, box) => {
    if (err) throw err;
    imap.search([['HEADER', 'SUBJECT', 'Booking']], (searchErr, results) => {
      if (searchErr || !results || results.length === 0) {
        console.log('No booking emails found.');
        imap.end();
        return;
      }
      const f = imap.fetch(results.slice(-1), { bodies: '' });
      f.on('message', (msg) => {
        msg.on('body', (stream) => {
          simpleParser(stream, (err, parsed) => {
            if (err) return;
            console.log(`Subject: ${parsed.subject}`);
            console.log('-----------------------------------');
            console.log(parsed.text);
            console.log('===================================');
          });
        });
      });
      f.once('end', () => setTimeout(() => imap.end(), 2000));
    });
  });
});

imap.connect();
