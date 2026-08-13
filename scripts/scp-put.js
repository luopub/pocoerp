// Usage: node scripts/scp-put.js <localFile> <remotePath>
// Uploads a file to the data server via SFTP (creds from MYDATASERVER_* env vars).
const { Client } = require('ssh2');

const [local, remote] = process.argv.slice(2);
if (!local || !remote) { console.log('usage: node scp-put.js <localFile> <remotePath>'); process.exit(1); }

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.log('SFTP_ERROR: ' + err.message); conn.end(); process.exit(1); }
    sftp.fastPut(local, remote, (e) => {
      if (e) { console.log('PUT_ERROR: ' + e.message); conn.end(); process.exit(1); }
      console.log(`uploaded: ${local} -> ${remote}`);
      conn.end();
    });
  });
});
conn.on('error', e => { console.log('SSH_ERROR: ' + e.message); process.exit(1); });
conn.connect({
  host: process.env.MYDATASERVER_IP,
  port: parseInt(process.env.MYDATASERVER_PORT || '22', 10),
  username: process.env.MYDATASERVER_SSH_USER,
  password: process.env.MYDATASERVER_SSH_PASSWORD || process.env.MYDATASERVER_PASSWORD,
  readyTimeout: 10000,
});
