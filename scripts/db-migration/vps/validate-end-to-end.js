const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const TABLES = [
  'users',
  'enrollments',
  'assessment_attempts',
  'progress',
  'certificates',
];

const UUID_COLUMNS = new Set([
  'id',
  'user_id',
  'course_id',
  'enrollment_id',
  'organisation_id',
  'module_id',
  'lesson_id',
]);

const TIMESTAMP_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'enrolled_at',
  'completed_at',
  'attempted_at',
  'issued_at',
  'expires_at',
  'last_login_at',
]);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
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

function buildInsertSql(table, columns, schema = 'migration_stage_runtime') {
  const colSql = columns.map((c) => `"${c}"`).join(', ');
  const valSql = columns.map((_, i) => `$${i + 1}`).join(', ');
  return `INSERT INTO ${schema}."${table}" (${colSql}) VALUES (${valSql})`;
}

function normalizePgValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function main() {
  loadEnv(path.resolve('apps/api/.env.local'));
  const neonUrl = process.env.DATABASE_URL;
  const vpsUrl = process.env.VPS_DATABASE_URL
    || 'postgresql://carelearn_admin:Abbasi786%40%23%24@187.127.105.253:32768/carelearn_production?sslmode=disable';
  if (!neonUrl) throw new Error('Missing Neon DATABASE_URL in apps/api/.env.local');

  const neonPool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false } });
  const vpsPool = new Pool({ connectionString: vpsUrl, ssl: false });
  const report = {
    generated_at: new Date().toISOString(),
    neon: {},
    vps: {},
    data_integrity: {},
    dry_run: {},
    blocker: null,
  };

  const outDir = path.resolve('scripts/db-migration/vps/out');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const neonMeta = await neonPool.query('select current_database() db,current_user usr,version() ver');
    const vpsMeta = await vpsPool.query('select current_database() db,current_user usr,version() ver');
    report.neon.meta = neonMeta.rows[0];
    report.vps.meta = vpsMeta.rows[0];

    const neonData = {};
    const neonColumns = {};
    for (const table of TABLES) {
      const columns = await getColumns(neonPool, table);
      neonColumns[table] = columns;
      const rowsResult = await neonPool.query(`SELECT * FROM public."${table}" ORDER BY 1`);
      neonData[table] = rowsResult.rows;
      report.neon[table] = rowsResult.rowCount;

      const csvPath = path.join(outDir, `${table}.csv`);
      const header = `${columns.join(',')}\n`;
      const lines = rowsResult.rows.map((row) => columns.map((c) => toCsvValue(row[c])).join(','));
      fs.writeFileSync(csvPath, `${header}${lines.join('\n')}\n`, 'utf8');
    }

    // Build deterministic ID mapping for content entities that can differ across environments.
    const neonCourses = await neonPool.query('SELECT id, title FROM public.courses');
    const vpsCourses = await vpsPool.query('SELECT id, title FROM public.courses');
    const courseIdByTitleVps = new Map(vpsCourses.rows.map((r) => [r.title, r.id]));
    const courseIdMap = new Map();
    for (const row of neonCourses.rows) {
      if (courseIdByTitleVps.has(row.title)) {
        courseIdMap.set(row.id, courseIdByTitleVps.get(row.title));
      }
    }

    const neonModules = await neonPool.query(`
      SELECT m.id, m.course_id, m.order_index, c.title AS course_title
      FROM public.modules m
      JOIN public.courses c ON c.id = m.course_id
    `);
    const vpsModules = await vpsPool.query(`
      SELECT m.id, m.course_id, m.order_index, c.title AS course_title
      FROM public.modules m
      JOIN public.courses c ON c.id = m.course_id
    `);
    const vpsModuleByKey = new Map(vpsModules.rows.map((r) => [`${r.course_title}::${r.order_index}`, r.id]));
    const moduleIdMap = new Map();
    for (const row of neonModules.rows) {
      const key = `${row.course_title}::${row.order_index}`;
      if (vpsModuleByKey.has(key)) {
        moduleIdMap.set(row.id, vpsModuleByKey.get(key));
      }
    }

    const neonLessons = await neonPool.query(`
      SELECT l.id, l.module_id, l.order_index, c.title AS course_title, m.order_index AS module_order
      FROM public.lessons l
      JOIN public.modules m ON m.id = l.module_id
      JOIN public.courses c ON c.id = m.course_id
    `);
    const vpsLessons = await vpsPool.query(`
      SELECT l.id, l.module_id, l.order_index, c.title AS course_title, m.order_index AS module_order
      FROM public.lessons l
      JOIN public.modules m ON m.id = l.module_id
      JOIN public.courses c ON c.id = m.course_id
    `);
    const vpsLessonByKey = new Map(vpsLessons.rows.map((r) => [`${r.course_title}::${r.module_order}::${r.order_index}`, r.id]));
    const lessonIdMap = new Map();
    for (const row of neonLessons.rows) {
      const key = `${row.course_title}::${row.module_order}::${row.order_index}`;
      if (vpsLessonByKey.has(key)) {
        lessonIdMap.set(row.id, vpsLessonByKey.get(key));
      }
    }

    // Integrity checks on exported source
    const integrity = {
      utf8_files: {},
      uuid_issues: [],
      timestamp_issues: [],
      fk_issues: [],
    };
    for (const table of TABLES) {
      const csvPath = path.join(outDir, `${table}.csv`);
      const buf = fs.readFileSync(csvPath);
      const decoded = buf.toString('utf8');
      integrity.utf8_files[`${table}.csv`] = Buffer.from(decoded, 'utf8').length === buf.length;

      for (const row of neonData[table]) {
        for (const [key, value] of Object.entries(row)) {
          if (value === null || value === undefined) continue;
          if (UUID_COLUMNS.has(key) && typeof value === 'string' && !isUuid(value)) {
            integrity.uuid_issues.push({ table, key, value });
          }
          if (TIMESTAMP_COLUMNS.has(key)) {
            const parsed = new Date(value);
            if (Number.isNaN(parsed.getTime())) integrity.timestamp_issues.push({ table, key, value });
          }
        }
      }
    }

    const users = new Set(neonData.users.map((r) => r.id));
    const courses = new Set((await neonPool.query('SELECT id FROM public.courses')).rows.map((r) => r.id));
    const enrollments = new Set(neonData.enrollments.map((r) => r.id));
    const lessons = new Set((await neonPool.query('SELECT id FROM public.lessons')).rows.map((r) => r.id));

    for (const row of neonData.enrollments) {
      if (!users.has(row.user_id)) integrity.fk_issues.push({ table: 'enrollments', fk: 'user_id', value: row.user_id });
      if (!courses.has(row.course_id)) integrity.fk_issues.push({ table: 'enrollments', fk: 'course_id', value: row.course_id });
    }
    for (const row of neonData.assessment_attempts) {
      if (!enrollments.has(row.enrollment_id)) integrity.fk_issues.push({ table: 'assessment_attempts', fk: 'enrollment_id', value: row.enrollment_id });
      if (!users.has(row.user_id)) integrity.fk_issues.push({ table: 'assessment_attempts', fk: 'user_id', value: row.user_id });
    }
    for (const row of neonData.progress) {
      if (!enrollments.has(row.enrollment_id)) integrity.fk_issues.push({ table: 'progress', fk: 'enrollment_id', value: row.enrollment_id });
      if (!lessons.has(row.lesson_id)) integrity.fk_issues.push({ table: 'progress', fk: 'lesson_id', value: row.lesson_id });
    }
    for (const row of neonData.certificates) {
      if (!enrollments.has(row.enrollment_id)) integrity.fk_issues.push({ table: 'certificates', fk: 'enrollment_id', value: row.enrollment_id });
      if (!users.has(row.user_id)) integrity.fk_issues.push({ table: 'certificates', fk: 'user_id', value: row.user_id });
      if (!courses.has(row.course_id)) integrity.fk_issues.push({ table: 'certificates', fk: 'course_id', value: row.course_id });
    }

    report.data_integrity = integrity;
    report.data_integrity.id_mapping = {
      course_ids_mapped: courseIdMap.size,
      module_ids_mapped: moduleIdMap.size,
      lesson_ids_mapped: lessonIdMap.size,
    };

    // Duplicate strategy checks
    const duplicateChecks = await neonPool.query(`
      SELECT
        (SELECT COUNT(*)::int - COUNT(DISTINCT email)::int FROM public.users) AS dup_user_email,
        (SELECT COUNT(*)::int - COUNT(DISTINCT (user_id, course_id))::int FROM public.enrollments) AS dup_enrollment_pair,
        (SELECT COUNT(*)::int - COUNT(DISTINCT (enrollment_id, lesson_id))::int FROM public.progress) AS dup_progress_pair,
        (SELECT COUNT(*)::int - COUNT(DISTINCT certificate_number)::int FROM public.certificates) AS dup_certificate_number
    `);
    report.data_integrity.duplicate_source = duplicateChecks.rows[0];

    // VPS dry-run merge in a rollback transaction
    const client = await vpsPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE SCHEMA IF NOT EXISTS migration_stage_runtime');
      for (const table of TABLES) {
        await client.query(`CREATE TABLE IF NOT EXISTS migration_stage_runtime."${table}" (LIKE public."${table}" INCLUDING ALL)`);
        await client.query(`TRUNCATE migration_stage_runtime."${table}"`);
      }

      const mappedData = {
        users: neonData.users.map((r) => ({ ...r })),
        enrollments: neonData.enrollments.map((r) => ({
          ...r,
          course_id: courseIdMap.get(r.course_id) || r.course_id,
        })),
        assessment_attempts: neonData.assessment_attempts.map((r) => ({
          ...r,
          module_id: r.module_id ? (moduleIdMap.get(r.module_id) || r.module_id) : null,
        })),
        progress: neonData.progress.map((r) => ({
          ...r,
          lesson_id: lessonIdMap.get(r.lesson_id) || r.lesson_id,
        })),
        certificates: neonData.certificates.map((r) => ({
          ...r,
          course_id: courseIdMap.get(r.course_id) || r.course_id,
        })),
      };

      for (const table of TABLES) {
        const cols = neonColumns[table];
        const insertSql = buildInsertSql(table, cols);
        for (const row of mappedData[table]) {
          const values = cols.map((c) => normalizePgValue(row[c]));
          await client.query(insertSql, values);
        }
      }

      const before = {};
      for (const table of TABLES) {
        const r = await client.query(`SELECT COUNT(*)::int c FROM public."${table}"`);
        before[table] = r.rows[0].c;
      }

      await client.query(`
        INSERT INTO public.users (id,email,password_hash,first_name,last_name,role,avatar_url,is_active,last_login_at,created_at,updated_at)
        SELECT id,email,password_hash,first_name,last_name,role,avatar_url,is_active,last_login_at,created_at,updated_at
        FROM migration_stage_runtime.users
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          role = EXCLUDED.role,
          avatar_url = EXCLUDED.avatar_url,
          is_active = EXCLUDED.is_active,
          last_login_at = EXCLUDED.last_login_at,
          updated_at = GREATEST(public.users.updated_at, EXCLUDED.updated_at)
      `);

      await client.query(`
        INSERT INTO public.enrollments (id,user_id,course_id,organisation_id,due_date,status,enrolled_at,completed_at,updated_at)
        SELECT id,user_id,course_id,organisation_id,due_date,status,enrolled_at,completed_at,updated_at
        FROM migration_stage_runtime.enrollments
        ON CONFLICT (user_id, course_id) DO UPDATE SET
          organisation_id = EXCLUDED.organisation_id,
          due_date = EXCLUDED.due_date,
          status = EXCLUDED.status,
          completed_at = EXCLUDED.completed_at,
          updated_at = GREATEST(public.enrollments.updated_at, EXCLUDED.updated_at)
      `);

      await client.query(`
        INSERT INTO public.assessment_attempts (id,enrollment_id,user_id,module_id,lesson_number,is_final,score,passed,answers,attempted_at)
        SELECT id,enrollment_id,user_id,module_id,lesson_number,is_final,score,passed,answers,attempted_at
        FROM migration_stage_runtime.assessment_attempts
        ON CONFLICT (id) DO NOTHING
      `);

      await client.query(`
        INSERT INTO public.progress (id,enrollment_id,lesson_id,completed,time_spent_seconds,completed_at)
        SELECT id,enrollment_id,lesson_id,completed,time_spent_seconds,completed_at
        FROM migration_stage_runtime.progress
        ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET
          completed = EXCLUDED.completed,
          time_spent_seconds = GREATEST(public.progress.time_spent_seconds, EXCLUDED.time_spent_seconds),
          completed_at = COALESCE(public.progress.completed_at, EXCLUDED.completed_at)
      `);

      await client.query(`
        INSERT INTO public.certificates (id,enrollment_id,user_id,course_id,organisation_id,certificate_number,issued_at,expires_at,pdf_url,is_valid)
        SELECT id,enrollment_id,user_id,course_id,organisation_id,certificate_number,issued_at,expires_at,pdf_url,is_valid
        FROM migration_stage_runtime.certificates
        ON CONFLICT (certificate_number) DO UPDATE SET
          enrollment_id = EXCLUDED.enrollment_id,
          user_id = EXCLUDED.user_id,
          course_id = EXCLUDED.course_id,
          organisation_id = EXCLUDED.organisation_id,
          issued_at = EXCLUDED.issued_at,
          expires_at = EXCLUDED.expires_at,
          pdf_url = EXCLUDED.pdf_url,
          is_valid = EXCLUDED.is_valid
      `);

      const after = {};
      for (const table of TABLES) {
        const r = await client.query(`SELECT COUNT(*)::int c FROM public."${table}"`);
        after[table] = r.rows[0].c;
      }

      const indexCount = await client.query(`SELECT COUNT(*)::int c FROM pg_indexes WHERE schemaname='public'`);
      const constraintCount = await client.query(`
        SELECT COUNT(*)::int c
        FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname='public'
      `);
      report.dry_run = {
        source_rows: Object.fromEntries(TABLES.map((t) => [t, neonData[t].length])),
        before_counts: before,
        after_counts: after,
        delta: Object.fromEntries(TABLES.map((t) => [t, after[t] - before[t]])),
        mapped_foreign_keys: {
          enrollments_course_id: mappedData.enrollments.filter((r, i) => r.course_id !== neonData.enrollments[i].course_id).length,
          assessment_attempts_module_id: mappedData.assessment_attempts.filter((r, i) => r.module_id !== neonData.assessment_attempts[i].module_id).length,
          progress_lesson_id: mappedData.progress.filter((r, i) => r.lesson_id !== neonData.progress[i].lesson_id).length,
          certificates_course_id: mappedData.certificates.filter((r, i) => r.course_id !== neonData.certificates[i].course_id).length,
        },
        index_count_after_merge_txn: indexCount.rows[0].c,
        constraint_count_after_merge_txn: constraintCount.rows[0].c,
        rolled_back: true,
      };
      await client.query('ROLLBACK');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    report.blocker = {
      message: err.message,
      code: err.code || null,
      stack: err.stack,
    };
  } finally {
    await neonPool.end();
    await vpsPool.end();
  }

  const reportPath = path.resolve('scripts/db-migration/vps/out/validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Validation report written: ${reportPath}`);
  if (report.blocker) {
    console.error('VALIDATION_BLOCKER', report.blocker.message);
    process.exitCode = 1;
  } else {
    console.log('VALIDATION_OK');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
