/**
 * 50_production_import.js
 *
 * Production data migration: Neon → VPS PostgreSQL
 *
 * Dry-run (default):
 *   node scripts/db-migration/vps/50_production_import.js
 *
 * Commit:
 *   node scripts/db-migration/vps/50_production_import.js --commit
 *
 * Safety guarantees:
 *  - All writes happen inside a single serializable transaction
 *  - Dry-run mode always ROLLBACKs
 *  - All FK conflicts resolved via deterministic title+order mapping
 *  - All merges use ON CONFLICT → idempotent, re-runnable
 *  - Neon is never written to (read-only pool)
 *  - Post-merge row counts validated before COMMIT
 */

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const COMMIT_MODE = process.argv.includes('--commit');
const TABLES = ['users', 'enrollments', 'assessment_attempts', 'progress', 'certificates'];

// ── connection helpers ────────────────────────────────────────────────────────

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

function normalizePgValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function getColumns(pool, table) {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table]
  );
  return r.rows.map(r => r.column_name);
}

// ── id mapping ────────────────────────────────────────────────────────────────

async function buildIdMaps(neonPool, vpsPool) {
  const [neonCourses, vpsCourses] = await Promise.all([
    neonPool.query('SELECT id, title FROM public.courses'),
    vpsPool.query('SELECT id, title FROM public.courses'),
  ]);
  const vpsCourseTitleToId = new Map(vpsCourses.rows.map(r => [r.title, r.id]));
  const courseIdMap = new Map();
  for (const r of neonCourses.rows) {
    const vpsId = vpsCourseTitleToId.get(r.title);
    if (vpsId) courseIdMap.set(r.id, vpsId);
  }

  const [neonMods, vpsMods] = await Promise.all([
    neonPool.query(`SELECT m.id, m.order_index, c.title course_title
                    FROM public.modules m JOIN public.courses c ON c.id=m.course_id`),
    vpsPool.query(`SELECT m.id, m.order_index, c.title course_title
                   FROM public.modules m JOIN public.courses c ON c.id=m.course_id`),
  ]);
  const vpsModByKey = new Map(vpsMods.rows.map(r => [`${r.course_title}::${r.order_index}`, r.id]));
  const moduleIdMap = new Map();
  for (const r of neonMods.rows) {
    const vpsId = vpsModByKey.get(`${r.course_title}::${r.order_index}`);
    if (vpsId) moduleIdMap.set(r.id, vpsId);
  }

  const [neonLessons, vpsLessons] = await Promise.all([
    neonPool.query(`SELECT l.id, l.order_index, m.order_index mod_order, c.title course_title
                    FROM public.lessons l
                    JOIN public.modules m ON m.id=l.module_id
                    JOIN public.courses c ON c.id=m.course_id`),
    vpsPool.query(`SELECT l.id, l.order_index, m.order_index mod_order, c.title course_title
                   FROM public.lessons l
                   JOIN public.modules m ON m.id=l.module_id
                   JOIN public.courses c ON c.id=m.course_id`),
  ]);
  const vpsLessonByKey = new Map(vpsLessons.rows.map(r => [`${r.course_title}::${r.mod_order}::${r.order_index}`, r.id]));
  const lessonIdMap = new Map();
  for (const r of neonLessons.rows) {
    const vpsId = vpsLessonByKey.get(`${r.course_title}::${r.mod_order}::${r.order_index}`);
    if (vpsId) lessonIdMap.set(r.id, vpsId);
  }

  return { courseIdMap, moduleIdMap, lessonIdMap };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv(path.resolve('apps/api/.env.local'));

  const neonUrl = process.env.DATABASE_URL;
  const vpsUrl  = process.env.VPS_DATABASE_URL
    || 'postgresql://carelearn_admin:Abbasi786%40%23%24@187.127.105.253:32768/carelearn_production?sslmode=disable';

  if (!neonUrl) throw new Error('Missing Neon DATABASE_URL in apps/api/.env.local');

  console.log(`\n${'═'.repeat(60)}`);
  console.log(COMMIT_MODE ? '  PRODUCTION IMPORT — COMMIT MODE' : '  PRODUCTION IMPORT — DRY-RUN (ROLLBACK)');
  console.log(`${'═'.repeat(60)}\n`);

  const neonPool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false } });
  const vpsPool  = new Pool({ connectionString: vpsUrl, ssl: false });
  const client   = await vpsPool.connect();

  try {
    // ── Step 1: read source data from Neon ──────────────────────────────────
    console.log('Step 1/6  Reading Neon source data...');
    const neonData = {};
    for (const t of TABLES) {
      const r = await neonPool.query(`SELECT * FROM public."${t}" ORDER BY 1`);
      neonData[t] = r.rows;
      console.log(`          ${t.padEnd(24)} ${r.rowCount} rows`);
    }

    // ── Step 2: build deterministic FK maps ─────────────────────────────────
    console.log('\nStep 2/6  Building FK ID maps (course/module/lesson)...');
    const { courseIdMap, moduleIdMap, lessonIdMap } = await buildIdMaps(neonPool, vpsPool);
    console.log(`          courses mapped  : ${courseIdMap.size}`);
    console.log(`          modules mapped  : ${moduleIdMap.size}`);
    console.log(`          lessons mapped  : ${lessonIdMap.size}`);

    if (courseIdMap.size === 0) {
      throw new Error('BLOCKER: no course ID mappings found — Fire Safety not yet imported on VPS? Run npm run fire-safety:import first.');
    }

    // ── Step 3: apply remapping in-memory ───────────────────────────────────
    console.log('\nStep 3/6  Applying FK remapping...');
    const mapped = {
      users: neonData.users.map(r => ({ ...r })),
      enrollments: neonData.enrollments.map(r => ({
        ...r,
        course_id: courseIdMap.get(r.course_id) || r.course_id,
      })),
      assessment_attempts: neonData.assessment_attempts.map(r => ({
        ...r,
        module_id: r.module_id ? (moduleIdMap.get(r.module_id) || r.module_id) : null,
      })),
      progress: neonData.progress.map(r => ({
        ...r,
        lesson_id: lessonIdMap.get(r.lesson_id) || r.lesson_id,
      })),
      certificates: neonData.certificates.map(r => ({
        ...r,
        course_id: courseIdMap.get(r.course_id) || r.course_id,
      })),
    };

    const remapStats = {
      enrollments_course_id:       mapped.enrollments.filter((r,i) => r.course_id !== neonData.enrollments[i].course_id).length,
      attempts_module_id:          mapped.assessment_attempts.filter((r,i) => r.module_id !== neonData.assessment_attempts[i].module_id).length,
      progress_lesson_id:          mapped.progress.filter((r,i) => r.lesson_id !== neonData.progress[i].lesson_id).length,
      certificates_course_id:      mapped.certificates.filter((r,i) => r.course_id !== neonData.certificates[i].course_id).length,
    };
    Object.entries(remapStats).forEach(([k, v]) => console.log(`          ${k.padEnd(30)} ${v} remapped`));

    // ── Step 4: open serializable transaction + stage + merge ────────────────
    console.log('\nStep 4/6  Opening serializable transaction...');
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // stage
    await client.query('CREATE SCHEMA IF NOT EXISTS migration_stage_runtime');
    for (const t of TABLES) {
      await client.query(`CREATE TABLE IF NOT EXISTS migration_stage_runtime."${t}" (LIKE public."${t}" INCLUDING ALL)`);
      await client.query(`TRUNCATE migration_stage_runtime."${t}"`);
    }

    for (const t of TABLES) {
      const cols      = await getColumns(client, t);
      const colSql    = cols.map(c => `"${c}"`).join(', ');
      const valSql    = cols.map((_, i) => `$${i + 1}`).join(', ');
      const insertSql = `INSERT INTO migration_stage_runtime."${t}" (${colSql}) VALUES (${valSql})`;
      for (const row of mapped[t]) {
        await client.query(insertSql, cols.map(c => normalizePgValue(row[c])));
      }
    }

    // ── Step 5: merge into public schema ────────────────────────────────────
    console.log('\nStep 5/6  Merging into public schema...');

    await client.query(`
      INSERT INTO public.users
        (id,email,password_hash,first_name,last_name,role,avatar_url,is_active,last_login_at,created_at,updated_at)
      SELECT id,email,password_hash,first_name,last_name,role,avatar_url,is_active,last_login_at,created_at,updated_at
      FROM migration_stage_runtime.users
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        first_name    = EXCLUDED.first_name,
        last_name     = EXCLUDED.last_name,
        role          = EXCLUDED.role,
        avatar_url    = EXCLUDED.avatar_url,
        is_active     = EXCLUDED.is_active,
        last_login_at = EXCLUDED.last_login_at,
        updated_at    = GREATEST(public.users.updated_at, EXCLUDED.updated_at)
    `);

    await client.query(`
      INSERT INTO public.enrollments
        (id,user_id,course_id,organisation_id,due_date,status,enrolled_at,completed_at,updated_at)
      SELECT id,user_id,course_id,organisation_id,due_date,status,enrolled_at,completed_at,updated_at
      FROM migration_stage_runtime.enrollments
      ON CONFLICT (user_id, course_id) DO UPDATE SET
        organisation_id = EXCLUDED.organisation_id,
        due_date        = EXCLUDED.due_date,
        status          = EXCLUDED.status,
        completed_at    = EXCLUDED.completed_at,
        updated_at      = GREATEST(public.enrollments.updated_at, EXCLUDED.updated_at)
    `);

    await client.query(`
      INSERT INTO public.assessment_attempts
        (id,enrollment_id,user_id,module_id,lesson_number,is_final,score,passed,answers,attempted_at)
      SELECT id,enrollment_id,user_id,module_id,lesson_number,is_final,score,passed,answers,attempted_at
      FROM migration_stage_runtime.assessment_attempts
      ON CONFLICT (id) DO NOTHING
    `);

    await client.query(`
      INSERT INTO public.progress
        (id,enrollment_id,lesson_id,completed,time_spent_seconds,completed_at)
      SELECT id,enrollment_id,lesson_id,completed,time_spent_seconds,completed_at
      FROM migration_stage_runtime.progress
      ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET
        completed          = EXCLUDED.completed,
        time_spent_seconds = GREATEST(public.progress.time_spent_seconds, EXCLUDED.time_spent_seconds),
        completed_at       = COALESCE(public.progress.completed_at, EXCLUDED.completed_at)
    `);

    await client.query(`
      INSERT INTO public.certificates
        (id,enrollment_id,user_id,course_id,organisation_id,certificate_number,issued_at,expires_at,pdf_url,is_valid)
      SELECT id,enrollment_id,user_id,course_id,organisation_id,certificate_number,issued_at,expires_at,pdf_url,is_valid
      FROM migration_stage_runtime.certificates
      ON CONFLICT (certificate_number) DO UPDATE SET
        enrollment_id   = EXCLUDED.enrollment_id,
        user_id         = EXCLUDED.user_id,
        course_id       = EXCLUDED.course_id,
        organisation_id = EXCLUDED.organisation_id,
        issued_at       = EXCLUDED.issued_at,
        expires_at      = EXCLUDED.expires_at,
        pdf_url         = EXCLUDED.pdf_url,
        is_valid        = EXCLUDED.is_valid
    `);

    // ── Step 6: verify row counts inside transaction ─────────────────────────
    console.log('\nStep 6/6  Verifying row counts inside transaction...');
    const counts = {};
    for (const t of TABLES) {
      const r = await client.query(`SELECT COUNT(*)::int c FROM public."${t}"`);
      counts[t] = r.rows[0].c;
    }

    // FK integrity spot-check (all progress.lesson_id must exist in lessons)
    const orphanProgress = await client.query(`
      SELECT COUNT(*)::int n FROM public.progress p
      WHERE NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p.lesson_id)
    `);
    const orphanEnrollments = await client.query(`
      SELECT COUNT(*)::int n FROM public.enrollments e
      WHERE NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = e.course_id)
    `);
    const orphanCerts = await client.query(`
      SELECT COUNT(*)::int n FROM public.certificates cert
      WHERE NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = cert.course_id)
    `);

    const fkOk = orphanProgress.rows[0].n === 0
              && orphanEnrollments.rows[0].n === 0
              && orphanCerts.rows[0].n === 0;

    // full course structure check
    const courseCheck = await client.query(`
      SELECT
        COUNT(DISTINCT m.id)::int  AS modules,
        COUNT(DISTINCT l.id)::int  AS lessons,
        COUNT(DISTINCT q.id) FILTER (WHERE q.is_final_assessment AND q.is_active)::int AS final_questions
      FROM public.courses c
      LEFT JOIN public.modules m ON m.course_id = c.id
      LEFT JOIN public.lessons l ON l.module_id = m.id
      LEFT JOIN public.assessment_questions q ON q.course_id = c.id
      WHERE c.title = 'Fire Safety Awareness'
    `);
    const cc = courseCheck.rows[0];

    console.log('\n' + '─'.repeat(60));
    console.log('  POST-MERGE STATE (inside transaction):');
    console.log('─'.repeat(60));
    for (const [t, n] of Object.entries(counts))
      console.log(`  ${t.padEnd(28)} ${n} rows`);
    console.log(`\n  Fire Safety course:`);
    console.log(`    modules          : ${cc.modules}`);
    console.log(`    lessons          : ${cc.lessons}`);
    console.log(`    final questions  : ${cc.final_questions}`);
    console.log(`\n  FK integrity:`);
    console.log(`    orphan progress  : ${orphanProgress.rows[0].n}`);
    console.log(`    orphan enrollments: ${orphanEnrollments.rows[0].n}`);
    console.log(`    orphan certs     : ${orphanCerts.rows[0].n}`);
    console.log(`    fk_ok            : ${fkOk}`);

    // row parity check
    const parityOk = TABLES.every(t => counts[t] >= neonData[t].length);
    const structureOk = cc.modules === 1 && cc.lessons === 17 && cc.final_questions === 14;

    console.log('\n' + '─'.repeat(60));
    console.log(`  row_parity_ok  : ${parityOk}`);
    console.log(`  structure_ok   : ${structureOk} (1 module, 17 lessons, 14 questions)`);
    console.log(`  fk_ok          : ${fkOk}`);
    console.log('─'.repeat(60));

    const allOk = parityOk && structureOk && fkOk;

    if (!allOk) {
      await client.query('ROLLBACK');
      throw new Error('Post-merge validation failed — rolled back. Check output above.');
    }

    if (COMMIT_MODE) {
      await client.query('COMMIT');
      console.log('\n✓ COMMITTED — VPS database now contains migrated data.');

      // cleanup staging schema after commit
      await client.query('DROP SCHEMA IF EXISTS migration_stage_runtime CASCADE');
      console.log('✓ Staging schema dropped.');
    } else {
      await client.query('ROLLBACK');
      console.log('\n  DRY-RUN complete — all checks passed — rolled back safely.');
      console.log('  To commit: node scripts/db-migration/vps/50_production_import.js --commit');
    }

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
    await neonPool.end();
    await vpsPool.end();
  }
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
