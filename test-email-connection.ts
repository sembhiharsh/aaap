import './env';
import Imap from 'imap';

const user = process.env.ICLOUD_USER || 'taxi2bcn@icloud.com';
const password = process.env.ICLOUD_APP_PASSWORD || process.env.ICLOUD_PASS || '';

console.log(`Connecting to iCloud IMAP for ${user}...`);

const imap = new Imap({
  user,
  password,
  host: 'imap.mail.me.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

imap.once('ready', () => {
  console.log('✅ Successfully connected and authenticated to iCloud IMAP email server!');
  imap.openBox('INBOX', true, (err, box) => {
    if (err) {
      console.error('Error opening INBOX:', err);
    } else {
      console.log(`✅ INBOX opened successfully. Total messages in inbox: ${box.messages.total}`);
    }
    imap.end();
  });
});

imap.once('error', (err: any) => {
  console.error('❌ IMAP Connection Error:', err.message);
});

imap.once('end', () => {
  console.log('IMAP connection closed.');
});

imap.connect();
