const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLearnerSmartRuntime,
  buildAnalyticsSnapshot,
  buildComplianceSnapshot,
} = require('./layer4-intelligence');

test('buildLearnerSmartRuntime is deterministic', () => {
  const base = {
    courseId: 'c1',
    userId: 'u1',
    progressRows: [{ completed: true }, { completed: false }],
    lessonCount: 2,
    latestFinalAttempt: { score: 60, passed: false, attempted_at: '2026-05-14T00:00:00.000Z' },
    weakTopics: [{ topic: 'Evacuation', misses: 2 }],
    generatedAt: '2026-05-14T01:00:00.000Z',
  };

  const a = buildLearnerSmartRuntime(base);
  const b = buildLearnerSmartRuntime(base);
  assert.deepEqual(a, b);
  assert.equal(a.recommendations.action, 'retry_final_quiz');
});

test('buildAnalyticsSnapshot ranks difficult topics deterministically', () => {
  const snapshot = buildAnalyticsSnapshot({
    nowIso: '2026-05-14T01:00:00.000Z',
    courseRows: [
      { id: 'a', title: 'A', enrolled: 10, completed: 5 },
      { id: 'b', title: 'B', enrolled: 10, completed: 8 },
    ],
    attemptRows: [
      { course_id: 'a', score: 50, passed: false },
      { course_id: 'a', score: 70, passed: false },
      { course_id: 'b', score: 90, passed: true },
    ],
  });
  assert.equal(snapshot.courses.length, 2);
  assert.equal(snapshot.difficult_topics[0].course_id, 'a');
});

test('buildComplianceSnapshot totals are deterministic', () => {
  const snapshot = buildComplianceSnapshot({
    nowIso: '2026-05-14T01:00:00.000Z',
    dueRows: [{ enrollment_id: 'e1', user_id: 'u1', course_id: 'c1', due_date: '2026-05-20', status: 'enrolled' }],
    expiringCertificates: [{ certificate_id: 'x1', user_id: 'u1', course_id: 'c1', expires_at: '2026-05-25' }],
  });
  assert.equal(snapshot.totals.combined, 2);
});
