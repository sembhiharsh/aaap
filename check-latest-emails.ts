import './env';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

const imapConfig = {
  user:     process.env.GMAIL_USER || 'SEMbhiharsh@gmail.com',
  password: process.env.GMAIL_APP_PASSWORD || 'xovg pknz gxyk qpcc',
  host:     'imap.gmail.com',
  port:     993,
  tls:      true,
  tlsOptions: { rejectUnauthorized: false }
};

const imap = new Imap(imapConfig);

imap.once('ready', () => {
  imap.openBox('INBOX', false, (err, box) => {
    if (err) throw err;
    
    imap.search([['HEADER', 'SUBJECT', 'Cancelled Booking']], (searchErr, results) => {
      if (searchErr) throw searchErr;
      
      if (!results || results.length === 0) {
        console.log('No cancellation emails found.');
        imap.end();
        return;
      }
      
      const f = imap.fetch(results.slice(-1), { bodies: '' }); // Fetch latest
      
      f.on('message', (msg, seqno) => {
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
      
      f.once('end', () => {
        setTimeout(() => imap.end(), 2000);
      });
    });
  });
});

imap.connect();
