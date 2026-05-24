/* eslint-disable no-console */
const fs = require('fs');

const API = process.env.API_BASE || 'http://187.127.105.253/api/v1';
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo.learner@carelearn.local';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoLearner123!';
const BLS_ID = 'b721b5b7-bf9e-4c44-b89d-ede14a5e7bf7';
const EPILEPSY_ID = '3da8ba5f-1a6d-4de9-8de9-1f9db5cc32c4';

async function req(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

async function run() {
  const report = { at: new Date().toISOString(), checks: [] };
  const check = (name, ok, detail) => {
    report.checks.push({ name, ok, detail });
    if (!ok) throw new Error(`${name} failed: ${detail}`);
  };

  const login = await req('POST', '/auth/login', null, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
  check('auth.login', login.status === 200 && login.data?.token, JSON.stringify(login.data));
  const token = login.data.token;

  const me = await req('GET', '/auth/me', token);
  check('auth.session', me.status === 200 && me.data?.user?.email === DEMO_EMAIL, JSON.stringify(me.data));

  const courses = await req('GET', '/courses', token);
  check('courses.list.status', courses.status === 200, JSON.stringify(courses.data));
  const published = courses.data?.courses || [];
  check('courses.count', published.length === 2, `expected 2 got ${published.length}`);
  const ids = new Set(published.map((c) => c.id));
  check('courses.ids', ids.has(BLS_ID) && ids.has(EPILEPSY_ID), JSON.stringify([...ids]));

  const enrollments = await req('GET', '/enrollments/my', token);
  check('enrollments.list', enrollments.status === 200, JSON.stringify(enrollments.data));
  const myEnrollments = enrollments.data?.enrollments || [];
  const blsEnrollment = myEnrollments.find((e) => e.course_id === BLS_ID);
  const epilepsyEnrollment = myEnrollments.find((e) => e.course_id === EPILEPSY_ID);
  check('enrollments.bls', !!blsEnrollment, JSON.stringify(myEnrollments.map((e) => e.course_id)));
  check('enrollments.epilepsy', !!epilepsyEnrollment, JSON.stringify(myEnrollments.map((e) => e.course_id)));

  const blsCourse = await req('GET', `/courses/${BLS_ID}`, token);
  const epilepsyCourse = await req('GET', `/courses/${EPILEPSY_ID}`, token);
  check('course.bls.load', blsCourse.status === 200, JSON.stringify(blsCourse.data));
  check('course.epilepsy.load', epilepsyCourse.status === 200, JSON.stringify(epilepsyCourse.data));

  const blsLessons = (blsCourse.data?.course?.modules || []).flatMap((m) => m.lessons || []);
  const epilepsyLessons = (epilepsyCourse.data?.course?.modules || []).flatMap((m) => m.lessons || []);
  check('lessons.bls.count', blsLessons.length > 0, `count=${blsLessons.length}`);
  check('lessons.epilepsy.count', epilepsyLessons.length > 0, `count=${epilepsyLessons.length}`);

  const blsImage = blsLessons.flatMap((l) => l.content?.blocks || []).find((b) => b.type === 'image' && String(b.payload?.src || '').includes('/course-assets/bls/'));
  const epilepsyImage = epilepsyLessons.flatMap((l) => l.content?.blocks || []).find((b) => b.type === 'image' && String(b.payload?.src || '').includes('/course-assets/epilepsy/'));
  check('images.bls.namespace', !!blsImage, 'missing /course-assets/bls/ image path');
  check('images.epilepsy.namespace', !!epilepsyImage, 'missing /course-assets/epilepsy/ image path');

  const progress1 = await req('PUT', '/enrollments/progress', token, {
    enrollment_id: blsEnrollment.id,
    lesson_id: blsLessons[0].id,
    time_spent_seconds: 90,
  });
  const progress2 = await req('PUT', '/enrollments/progress', token, {
    enrollment_id: epilepsyEnrollment.id,
    lesson_id: epilepsyLessons[0].id,
    time_spent_seconds: 95,
  });
  check('progress.bls.update', progress1.status === 200, JSON.stringify(progress1.data));
  check('progress.epilepsy.update', progress2.status === 200, JSON.stringify(progress2.data));

  const blsQuestions = await req('GET', `/courses/${BLS_ID}/questions?is_final=true`, token);
  check('assessment.bls.questions', blsQuestions.status === 200 && (blsQuestions.data?.questions || []).length > 0, JSON.stringify(blsQuestions.data));
  const qs = blsQuestions.data.questions;

  const failAnswers = qs.map((q) => ({ question_id: q.id, answer: Number(q.correct_answer) === 0 ? 1 : 0 }));
  const failAttempt = await req('POST', `/courses/${BLS_ID}/attempt`, token, {
    enrollment_id: blsEnrollment.id,
    is_final: true,
    answers: failAnswers,
  });
  check('assessment.bls.fail-attempt', failAttempt.status === 200 && failAttempt.data?.passed === false, JSON.stringify(failAttempt.data));

  const passAnswers = qs.map((q) => ({ question_id: q.id, answer: Number(q.correct_answer) }));
  const passAttempt = await req('POST', `/courses/${BLS_ID}/attempt`, token, {
    enrollment_id: blsEnrollment.id,
    is_final: true,
    answers: passAnswers,
  });
  check('assessment.bls.pass-attempt', passAttempt.status === 200 && passAttempt.data?.passed === true, JSON.stringify(passAttempt.data));

  const completeBls = await req('POST', '/enrollments/complete', token, { enrollment_id: blsEnrollment.id });
  check('completion.bls', completeBls.status === 200, JSON.stringify(completeBls.data));

  const progressRead = await req('GET', `/enrollments/${blsEnrollment.id}/progress`, token);
  check('progress.persistence', progressRead.status === 200 && (progressRead.data?.progress || []).length >= 1, JSON.stringify(progressRead.data));

  report.summary = {
    demo_user: DEMO_EMAIL,
    courses: published.map((c) => ({ id: c.id, title: c.title })),
    bls_score_fail: failAttempt.data?.score,
    bls_score_pass: passAttempt.data?.score,
  };

  const outPath = `cleanup-reports/real-training-e2e-report-${Date.now()}.json`;
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`E2E verification passed.\nReport: ${outPath}`);
}

run().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
