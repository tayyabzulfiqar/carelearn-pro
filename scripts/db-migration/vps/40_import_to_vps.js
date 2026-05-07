const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const TABLES = ['users', 'enrollments', 'assessment_attempts', 'progress', 'certificates'];

function normalizePgValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function buildInsertSql(table, columns, schema = 'migration_stage_runtime') {
  const colSql = columns.map((c) => `"${c}"`).join(', ');
  const valSql = columns.map((_, i) => `$${i + 1}`).join(', ');
  return `INSERT INTO ${schema}."${table}" (${colSql}) VALUES (${valSql})`;
}

async function getColumns(pool, table) {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table]
  );
  return result.rows.map((r) => r.column_name);
}

async function main() {
  const dryRun = !process.argv.includes('--commit');
  const inDir = path.resolve(process.argv[2] || 'scripts/db-migration/vps/out/export');
  const vpsUrl = process.env.VPS_DATABASE_URL
    || 'postgresql://carelearn_admin:Abbasi786%40%23%24@187.127.105.253:32768/carelearn_production?sslmode=disable';
  const pool = new Pool({ connectionString: vpsUrl, ssl: false });
  const client = await pool.connect();
  try {
    const dataset = {};
    for (const t of TABLES) {
      dataset[t] = JSON.parse(fs.readFileSync(path.join(inDir, `${t}.json`), 'utf8'));
    }

    await client.query('BEGIN');
    await client.query('CREATE SCHEMA IF NOT EXISTS migration_stage_runtime');
    for (const table of TABLES) {
      await client.query(`CREATE TABLE IF NOT EXISTS migration_stage_runtime."${table}" (LIKE public."${table}" INCLUDING ALL)`);
      await client.query(`TRUNCATE migration_stage_runtime."${table}"`);
    }

    const columns = {};
    for (const table of TABLES) {
      columns[table] = await getColumns(client, table);
      const insertSql = buildInsertSql(table, columns[table]);
      for (const row of dataset[table]) {
        const values = columns[table].map((c) => normalizePgValue(row[c]));
        await client.query(insertSql, values);
      }
    }

    await client.query(fs.readFileSync(path.resolve('scripts/db-migration/vps/02a_map_content_foreign_keys.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.resolve('scripts/db-migration/vps/02_merge_users.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.resolve('scripts/db-migration/vps/03_merge_enrollments.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.resolve('scripts/db-migration/vps/04_merge_assessment_attempts.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.resolve('scripts/db-migration/vps/05_merge_progress.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.resolve('scripts/db-migration/vps/06_merge_certificates.sql'), 'utf8'));

    const checks = {};
    for (const table of TABLES) {
      const r = await client.query(`SELECT COUNT(*)::int c FROM public."${table}"`);
      checks[table] = r.rows[0].c;
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('Dry-run import complete (rolled back).');
    } else {
      await client.query('COMMIT');
      console.log('Committed import into VPS.');
    }

    console.log(JSON.stringify({ dryRun, checks }, null, 2));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
