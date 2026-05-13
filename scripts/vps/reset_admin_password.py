import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
host='187.127.105.253'; user='root'; pw='Abbasi@3155093759'
script=r'''#!/usr/bin/env bash
set -e
docker exec -i carelearn-api node - <<'NODE'
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
(async () => {
  const hash = await bcrypt.hash('Admin1234!', 12);
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('update users set password_hash=$1, updated_at=now() where email=$2', [hash, 'admin@carelearn.pro']);
  const r = await c.query("select email, role from users where email='admin@carelearn.pro'");
  console.log(r.rows[0]);
  await c.end();
})();
NODE
'''
t=paramiko.Transport((host,22)); t.connect(username=user,password=pw); t.set_keepalive(30)
ch=t.open_session(); ch.set_combine_stderr(True); ch.exec_command('bash -s'); ch.sendall(script.encode()); ch.shutdown_write()
while True:
    if ch.recv_ready(): print(ch.recv(8192).decode('utf-8','replace'), end='')
    if ch.exit_status_ready():
        while ch.recv_ready(): print(ch.recv(8192).decode('utf-8','replace'), end='')
        break
    time.sleep(0.2)
print(f"\nexit={ch.recv_exit_status()}")
t.close()
