BEGIN;

INSERT INTO public.users (
  id, email, password_hash, first_name, last_name, role, avatar_url, is_active, last_login_at, created_at, updated_at
)
SELECT
  id, email, password_hash, first_name, last_name, role, avatar_url, is_active, last_login_at, created_at, updated_at
FROM migration_stage.users
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role,
  avatar_url = EXCLUDED.avatar_url,
  is_active = EXCLUDED.is_active,
  last_login_at = EXCLUDED.last_login_at,
  updated_at = GREATEST(public.users.updated_at, EXCLUDED.updated_at);

COMMIT;
