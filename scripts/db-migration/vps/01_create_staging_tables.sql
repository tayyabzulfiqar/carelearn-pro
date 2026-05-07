BEGIN;

CREATE SCHEMA IF NOT EXISTS migration_stage;

CREATE TABLE IF NOT EXISTS migration_stage.users (LIKE public.users INCLUDING ALL);
CREATE TABLE IF NOT EXISTS migration_stage.enrollments (LIKE public.enrollments INCLUDING ALL);
CREATE TABLE IF NOT EXISTS migration_stage.assessment_attempts (LIKE public.assessment_attempts INCLUDING ALL);
CREATE TABLE IF NOT EXISTS migration_stage.progress (LIKE public.progress INCLUDING ALL);
CREATE TABLE IF NOT EXISTS migration_stage.certificates (LIKE public.certificates INCLUDING ALL);

TRUNCATE TABLE
  migration_stage.users,
  migration_stage.enrollments,
  migration_stage.assessment_attempts,
  migration_stage.progress,
  migration_stage.certificates;

COMMIT;
