BEGIN;

INSERT INTO public.enrollments (
  id, user_id, course_id, organisation_id, due_date, status, enrolled_at, completed_at, updated_at
)
SELECT
  id, user_id, course_id, organisation_id, due_date, status, enrolled_at, completed_at, updated_at
FROM migration_stage.enrollments
ON CONFLICT (user_id, course_id) DO UPDATE SET
  organisation_id = EXCLUDED.organisation_id,
  due_date = EXCLUDED.due_date,
  status = EXCLUDED.status,
  completed_at = EXCLUDED.completed_at,
  updated_at = GREATEST(public.enrollments.updated_at, EXCLUDED.updated_at);

COMMIT;
