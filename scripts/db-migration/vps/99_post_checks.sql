SELECT 'users' AS table_name, COUNT(*) AS row_count FROM public.users
UNION ALL SELECT 'enrollments', COUNT(*) FROM public.enrollments
UNION ALL SELECT 'assessment_attempts', COUNT(*) FROM public.assessment_attempts
UNION ALL SELECT 'progress', COUNT(*) FROM public.progress
UNION ALL SELECT 'certificates', COUNT(*) FROM public.certificates
ORDER BY table_name;

SELECT
  c.title,
  COUNT(DISTINCT m.id) AS modules,
  COUNT(DISTINCT l.id) AS lessons,
  COUNT(DISTINCT q.id) FILTER (WHERE q.is_final_assessment = true AND q.is_active = true) AS active_final_questions
FROM public.courses c
LEFT JOIN public.modules m ON m.course_id = c.id
LEFT JOIN public.lessons l ON l.module_id = m.id
LEFT JOIN public.assessment_questions q ON q.course_id = c.id
WHERE c.title = 'Fire Safety Awareness'
GROUP BY c.title;
