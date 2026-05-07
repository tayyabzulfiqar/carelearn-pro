const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const TABLES = ['users', 'enrollments', 'assessment_attempts', 'progress', 'certificates'];

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnv(path.resolve('apps/api/.env.local'));
  const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing Neon DB URL (NEON_DATABASE_URL or DATABASE_URL)');

  const outDir = path.resolve(process.argv[2] || 'scripts/db-migration/vps/out/export');
  fs.mkdirSync(outDir, { recursive: true });
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  const summary = {};
  try {
    for (const table of TABLES) {
      const res = await pool.query(`SELECT * FROM public."${table}" ORDER BY 1`);
      const file = path.join(outDir, `${table}.json`);
      fs.writeFileSync(file, JSON.stringify(res.rows, null, 2), 'utf8');
      summary[table] = res.rowCount;
    }
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.log(`Exported Neon dataset -> ${outDir}`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
