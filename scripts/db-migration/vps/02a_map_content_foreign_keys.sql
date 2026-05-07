-- FK remapping: Neon content IDs → VPS content IDs
-- Called inside an outer transaction in 40_import_to_vps.js — no BEGIN/COMMIT here.

-- enrollments.course_id
UPDATE migration_stage_runtime.enrollments se
SET course_id = c_vps.id
FROM public.courses c_neon
JOIN public.courses c_vps ON c_vps.title = c_neon.title
WHERE se.course_id = c_neon.id
  AND se.course_id <> c_vps.id;

-- certificates.course_id
UPDATE migration_stage_runtime.certificates sc
SET course_id = c_vps.id
FROM public.courses c_neon
JOIN public.courses c_vps ON c_vps.title = c_neon.title
WHERE sc.course_id = c_neon.id
  AND sc.course_id <> c_vps.id;

-- assessment_attempts.module_id
UPDATE migration_stage_runtime.assessment_attempts sa
SET module_id = m_vps.id
FROM public.modules m_neon
JOIN public.courses c_neon ON c_neon.id = m_neon.course_id
JOIN public.courses c_vps ON c_vps.title = c_neon.title
JOIN public.modules m_vps ON m_vps.course_id = c_vps.id AND m_vps.order_index = m_neon.order_index
WHERE sa.module_id = m_neon.id
  AND sa.module_id <> m_vps.id;

-- progress.lesson_id
UPDATE migration_stage_runtime.progress sp
SET lesson_id = l_vps.id
FROM public.lessons l_neon
JOIN public.modules m_neon ON m_neon.id = l_neon.module_id
JOIN public.courses c_neon ON c_neon.id = m_neon.course_id
JOIN public.courses c_vps ON c_vps.title = c_neon.title
JOIN public.modules m_vps ON m_vps.course_id = c_vps.id AND m_vps.order_index = m_neon.order_index
JOIN public.lessons l_vps ON l_vps.module_id = m_vps.id AND l_vps.order_index = l_neon.order_index
WHERE sp.lesson_id = l_neon.id
  AND sp.lesson_id <> l_vps.id;
