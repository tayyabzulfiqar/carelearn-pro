const db = require('../config/database');
const {
  normalizeLessonContent,
  validateStructuredLessonContent,
} = require('../lib/lesson-content');

async function run() {
  const result = await db.query(`
    SELECT l.id, l.title, l.content
    FROM lessons l
    ORDER BY l.created_at, l.order_index
  `);

  let totalLessons = 0;
  let totalSections = 0;
  const failures = [];

  for (const lesson of result.rows) {
    totalLessons += 1;
    const normalized = normalizeLessonContent({
      title: lesson.title,
      content: lesson.content || {},
    });
    const validation = validateStructuredLessonContent({
      title: lesson.title,
      content: normalized,
    });

    if (!validation.passed) {
      failures.push({
        lessonId: lesson.id,
        title: lesson.title,
        checks: validation.checks,
      });
      continue;
    }

    totalSections += normalized.sections.length;

    await db.query(
      'UPDATE lessons SET content = $1 WHERE id = $2',
      [JSON.stringify(normalized), lesson.id]
    );
  }

  const summary = {
    totalLessons,
    averageSections: totalLessons > 0 ? Number((totalSections / totalLessons).toFixed(2)) : 0,
    validation: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    db.pool.end();
  });
