// Usage: node ssh-run.js "command1" "command2" ...
// Runs commands on the data server via SSH (creds from MYDATASERVER_* env vars).
const { Client } = require('ssh2');

const conn = new Client();
const cmds = process.argv.slice(2);

conn.on('ready', () => {
  const script = cmds.join(' && echo "---OK---" && ');
  conn.exec(script, (err, stream) => {
    if (err) { console.log('EXEC_ERROR: ' + err.message); conn.end(); process.exit(1); }
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stdout.write('[stderr] ' + d));
    stream.on('close', code => { console.log('\nEXIT_CODE=' + code); conn.end(); });
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
