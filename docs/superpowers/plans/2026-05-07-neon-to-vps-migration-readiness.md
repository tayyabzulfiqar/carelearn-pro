# Neon -> VPS Migration Readiness (2026-05-07)

## Scope
- No Neon writes performed.
- No production data migration executed.
- No app architecture changes.
- Only VPS connectivity, schema readiness, and migration execution assets prepared.

## Verified VPS Connection
- Host: `187.127.105.253`
- Port: `32768`
- Database: `carelearn_production`
- User: `carelearn_admin`
- Verified URL: `postgresql://carelearn_admin:Abbasi786%40%23%24@187.127.105.253:32768/carelearn_production?sslmode=disable`

## Executed Verification
1. TCP reachability: pass on `187.127.105.253:32768`.
2. DB login/session checks: pass for Neon and VPS.
3. `npm run migrate` against VPS: pass.
4. `npm run fire-safety:import` against VPS: pass.
5. Connection pooling smoke test (`max=5`, 20 parallel queries): pass.

## Neon vs VPS Live State (Read-only comparison)
- Schema counts:
  - tables: compatible (12 expected tables present)
  - indexes: `26` Neon / `26` VPS
  - constraints: `42` Neon / `42` VPS
  - extensions: `plpgsql`, `uuid-ossp` on both
- Data counts (key tables):
  - `users`: Neon `7` / VPS `0`
  - `enrollments`: Neon `1` / VPS `0`
  - `assessment_attempts`: Neon `6` / VPS `0`
  - `progress`: Neon `17` / VPS `0`
  - `certificates`: Neon `1` / VPS `0`
- Fire Safety seed parity:
  - courses: present on both
  - modules: 1 on both
  - lessons: 17 on both
  - assessment_questions: 14 on both

## Migration Assets Prepared
- SQL merge pipeline:
  - `scripts/db-migration/vps/01_create_staging_tables.sql`
  - `scripts/db-migration/vps/02_merge_users.sql`
  - `scripts/db-migration/vps/03_merge_enrollments.sql`
  - `scripts/db-migration/vps/04_merge_assessment_attempts.sql`
  - `scripts/db-migration/vps/05_merge_progress.sql`
  - `scripts/db-migration/vps/06_merge_certificates.sql`
  - `scripts/db-migration/vps/99_post_checks.sql`
- Operator scripts:
  - `scripts/db-migration/vps/10_export_from_neon.ps1`
  - `scripts/db-migration/vps/20_import_to_vps.ps1`
- Local VPS env template:
  - `apps/api/.env.vps.local`

## FK-safe Migration Order
1. `users`
2. `enrollments`
3. `assessment_attempts`
4. `progress`
5. `certificates`

## Duplicate Prevention Strategy
- `users`: upsert on unique `email`
- `enrollments`: upsert on unique `(user_id, course_id)`
- `assessment_attempts`: insert on `id`, skip existing
- `progress`: upsert on unique `(enrollment_id, lesson_id)`
- `certificates`: upsert on unique `certificate_number`

## Rollback Strategy
1. Pre-cutover: full VPS backup (`pg_dump -Fc`) and checkpoint row counts.
2. If post-cutover fails:
   - revert Vercel `DATABASE_URL` to Neon
   - redeploy API
   - investigate in VPS without deleting imported rows
3. If data-level rollback needed:
   - restore VPS from pre-cutover dump into clean DB
   - re-point API only after post-restore checks pass

## Vercel Production Env Update Checklist
API project:
- `DATABASE_URL=postgresql://carelearn_admin:...@187.127.105.253:32768/carelearn_production?sslmode=disable`
- `JWT_SECRET=<strong-random-secret>` (required; currently blank in local pulled prod env file)
- `CORS_ORIGIN=https://carelearn-pro-web.vercel.app` (and any additional production web domain)
- Remove Neon-specific helper vars from active runtime usage (optional cleanup after stable cutover).

## SSL / Security Note
- Current verified URL uses `sslmode=disable`.
- This is acceptable only if VPS port is tightly IP-restricted and monitored.
- Preferred hardening before final cutover: enable TLS for PostgreSQL and switch to `sslmode=require`.

## End-to-End Production Switch Checklist
1. Freeze writes window (short maintenance mode).
2. Export Neon rows (target tables only) with `10_export_from_neon.ps1`.
3. Import/merge into VPS using `20_import_to_vps.ps1`.
4. Run `99_post_checks.sql`.
5. Update Vercel API env vars and redeploy.
6. Smoke test:
   - login
   - enroll/open course
   - complete lesson progress
   - pass quiz attempt
   - issue/verify certificate
7. Monitor logs + row deltas for 30-60 minutes.
8. Keep Neon rollback path intact for at least 24h.
