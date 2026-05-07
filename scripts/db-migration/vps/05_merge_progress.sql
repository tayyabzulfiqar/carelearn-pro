BEGIN;

INSERT INTO public.progress (
  id, enrollment_id, lesson_id, completed, time_spent_seconds, completed_at
)
SELECT
  id, enrollment_id, lesson_id, completed, time_spent_seconds, completed_at
FROM migration_stage.progress
ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET
  completed = EXCLUDED.completed,
  time_spent_seconds = GREATEST(public.progress.time_spent_seconds, EXCLUDED.time_spent_seconds),
  completed_at = COALESCE(public.progress.completed_at, EXCLUDED.completed_at);

COMMIT;
