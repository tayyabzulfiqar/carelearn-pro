BEGIN;

INSERT INTO public.assessment_attempts (
  id, enrollment_id, user_id, module_id, lesson_number, is_final, score, passed, answers, attempted_at
)
SELECT
  id, enrollment_id, user_id, module_id, lesson_number, is_final, score, passed, answers, attempted_at
FROM migration_stage.assessment_attempts
ON CONFLICT (id) DO NOTHING;

COMMIT;
