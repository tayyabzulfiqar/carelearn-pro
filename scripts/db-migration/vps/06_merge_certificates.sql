BEGIN;

INSERT INTO public.certificates (
  id, enrollment_id, user_id, course_id, organisation_id, certificate_number, issued_at, expires_at, pdf_url, is_valid
)
SELECT
  id, enrollment_id, user_id, course_id, organisation_id, certificate_number, issued_at, expires_at, pdf_url, is_valid
FROM migration_stage.certificates
ON CONFLICT (certificate_number) DO UPDATE SET
  enrollment_id = EXCLUDED.enrollment_id,
  user_id = EXCLUDED.user_id,
  course_id = EXCLUDED.course_id,
  organisation_id = EXCLUDED.organisation_id,
  issued_at = EXCLUDED.issued_at,
  expires_at = EXCLUDED.expires_at,
  pdf_url = EXCLUDED.pdf_url,
  is_valid = EXCLUDED.is_valid;

COMMIT;
