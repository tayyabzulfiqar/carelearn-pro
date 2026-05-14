function normalizeText(value) {
  return String(value || '').trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sortedEntries(obj) {
  return Object.entries(obj || {}).sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });
}

function buildWeakTopicRecommendations({ publishedRuntime, wrongQuestionRows }) {
  const sectionCounts = {};
  const blocks = publishedRuntime?.render?.lessonBlocks || [];
  let sectionCursor = 'General';
  for (const block of blocks) {
    if (block?.type === 'heading') {
      sectionCursor = normalizeText(block?.text || block?.content) || 'General';
    }
    if (block?.type === 'paragraph') {
      const text = normalizeText(block?.text || block?.content);
      if (!text) continue;
      sectionCounts[sectionCursor] = toNumber(sectionCounts[sectionCursor], 0) + 1;
    }
  }

  const wrongTopicHits = {};
  for (const row of wrongQuestionRows || []) {
    const q = normalizeText(row?.question_text).toLowerCase();
    for (const [section, _count] of sortedEntries(sectionCounts)) {
      const sectionKey = section.toLowerCase();
      if (q.includes(sectionKey) || sectionKey.includes(q.slice(0, Math.min(q.length, 16)))) {
        wrongTopicHits[section] = toNumber(wrongTopicHits[section], 0) + 1;
      }
    }
  }

  const ranked = Object.entries(wrongTopicHits)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([topic, misses]) => ({ topic, misses }));

  return ranked.slice(0, 5);
}

function buildLearnerSmartRuntime({
  courseId,
  userId,
  progressRows,
  lessonCount,
  latestFinalAttempt,
  weakTopics,
  generatedAt,
}) {
  const completedCount = (progressRows || []).filter((row) => row.completed).length;
  const completionRatio = lessonCount > 0 ? Number((completedCount / lessonCount).toFixed(4)) : 0;
  const latestScore = toNumber(latestFinalAttempt?.score, 0);
  const needsQuizRetry = !!latestFinalAttempt && !latestFinalAttempt?.passed;
  const recommendedAction = needsQuizRetry
    ? 'retry_final_quiz'
    : completionRatio < 1
      ? 'resume_lessons'
      : 'review_weak_topics';

  return {
    schema: 'layer4d.smart_runtime.v1',
    generated_at: generatedAt,
    course_id: courseId,
    user_id: userId,
    completion: {
      completed_lessons: completedCount,
      total_lessons: lessonCount,
      ratio: completionRatio,
    },
    assessment: {
      latest_final_score: latestScore,
      latest_final_passed: !!latestFinalAttempt?.passed,
      latest_final_attempted_at: latestFinalAttempt?.attempted_at || null,
      needs_quiz_retry: needsQuizRetry,
    },
    recommendations: {
      action: recommendedAction,
      weak_topics: weakTopics || [],
      retry_instructions: needsQuizRetry
        ? 'Retake the final quiz after revising weak topics.'
        : 'Keep current momentum and complete remaining sections.',
    },
  };
}

function buildAnalyticsSnapshot({ courseRows, attemptRows, nowIso }) {
  const attemptsByCourse = {};
  for (const row of attemptRows || []) {
    const key = row.course_id;
    if (!attemptsByCourse[key]) attemptsByCourse[key] = [];
    attemptsByCourse[key].push(row);
  }

  const courses = (courseRows || []).map((row) => {
    const attempts = attemptsByCourse[row.id] || [];
    const avgScore = attempts.length
      ? Number((attempts.reduce((sum, x) => sum + toNumber(x.score, 0), 0) / attempts.length).toFixed(2))
      : 0;
    const failCount = attempts.filter((x) => !x.passed).length;
    return {
      course_id: row.id,
      title: row.title,
      enrolled: toNumber(row.enrolled, 0),
      completed: toNumber(row.completed, 0),
      completion_rate: toNumber(row.enrolled, 0) > 0
        ? Number((toNumber(row.completed, 0) / toNumber(row.enrolled, 0)).toFixed(4))
        : 0,
      final_attempts: attempts.length,
      final_avg_score: avgScore,
      final_failures: failCount,
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  const difficultTopics = courses
    .filter((c) => c.final_attempts > 0)
    .sort((a, b) => {
      if (b.final_failures !== a.final_failures) return b.final_failures - a.final_failures;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 5)
    .map((c) => ({
      course_id: c.course_id,
      title: c.title,
      failure_hotspot_score: c.final_failures,
    }));

  return {
    schema: 'layer4e.analytics_snapshot.v1',
    generated_at: nowIso,
    courses,
    difficult_topics: difficultTopics,
  };
}

function buildComplianceSnapshot({ dueRows, expiringCertificates, nowIso }) {
  const mandatoryAlerts = (dueRows || []).map((row) => ({
    enrollment_id: row.enrollment_id,
    user_id: row.user_id,
    course_id: row.course_id,
    due_date: row.due_date,
    status: row.status,
    type: 'mandatory_course_alert',
  }));

  const renewalAlerts = (expiringCertificates || []).map((row) => ({
    certificate_id: row.certificate_id,
    user_id: row.user_id,
    course_id: row.course_id,
    expires_at: row.expires_at,
    type: 'certificate_expiry_reminder',
  }));

  return {
    schema: 'layer4f.compliance_snapshot.v1',
    generated_at: nowIso,
    mandatory_alerts: mandatoryAlerts,
    renewal_alerts: renewalAlerts,
    totals: {
      mandatory_alerts: mandatoryAlerts.length,
      renewal_alerts: renewalAlerts.length,
      combined: mandatoryAlerts.length + renewalAlerts.length,
    },
  };
}

module.exports = {
  buildWeakTopicRecommendations,
  buildLearnerSmartRuntime,
  buildAnalyticsSnapshot,
  buildComplianceSnapshot,
};
