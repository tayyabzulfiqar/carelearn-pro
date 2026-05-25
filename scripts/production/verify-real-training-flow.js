/* eslint-disable no-console */
const fs = require('fs');

const API = process.env.API_BASE || 'http://187.127.105.253/api/v1';
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo.learner@carelearn.local';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoLearner123!';

const COURSES = [
  { key: 'bls', id: 'b721b5b7-bf9e-4c44-b89d-ede14a5e7bf7', assetSlug: 'bls', expectsAssessment: true },
  { key: 'epilepsy', id: '3da8ba5f-1a6d-4de9-8de9-1f9db5cc32c4', assetSlug: 'epilepsy', expectsAssessment: false },
  { key: 'catheter', id: 'f9fe3f1e-2c4c-49d1-bb6f-9ecbc6a95f8a', assetSlug: 'catheter-care', expectsAssessment: true },
  { key: 'conflict', id: '3d85e58e-dc48-4b10-a298-8e33332326d0', assetSlug: 'conflict-resolution-complaints-handling', expectsAssessment: true },
  { key: 'dementia', id: '218fd893-1f3a-41ef-acdc-785a73f5bfaf', assetSlug: 'dementia-level-1', expectsAssessment: true },
  { key: 'endoflife', id: 'ae24c1d2-4afa-48f0-a17e-db234dd7f0f7', assetSlug: 'end-of-life-care', expectsAssessment: true },
  { key: 'equality', id: '6a20c887-9d52-4b73-aff4-fc8d1e193f9d', assetSlug: 'equality-diversity-lgbtq', expectsAssessment: true },
];

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

  const coursesRes = await req('GET', '/courses', token);
  check('courses.list.status', coursesRes.status === 200, JSON.stringify(coursesRes.data));
  const courses = coursesRes.data?.courses || [];
  const ids = new Set(courses.map((c) => c.id));
  check('courses.count', courses.length === 7, `expected 7 got ${courses.length}`);
  for (const c of COURSES) {
    check(`courses.has.${c.key}`, ids.has(c.id), JSON.stringify([...ids]));
  }

  const enrollments = await req('GET', '/enrollments/my', token);
  check('enrollments.list', enrollments.status === 200, JSON.stringify(enrollments.data));
  const myEnrollments = enrollments.data?.enrollments || [];

  for (const course of COURSES) {
    const enrollment = myEnrollments.find((e) => e.course_id === course.id);
    check(`enrollment.${course.key}`, !!enrollment, JSON.stringify(myEnrollments.map((e) => e.course_id)));

    const detail = await req('GET', `/courses/${course.id}`, token);
    check(`course.load.${course.key}`, detail.status === 200, JSON.stringify(detail.data));
    const lessons = (detail.data?.course?.modules || []).flatMap((m) => m.lessons || []);
    check(`lessons.count.${course.key}`, lessons.length > 0, `count=${lessons.length}`);

    const imgRef = lessons.flatMap((l) => l.content?.blocks || [])
      .find((b) => b.type === 'image' && String(b.payload?.src || '').includes(`/course-assets/${course.assetSlug}/`));
    check(`images.namespace.${course.key}`, !!imgRef, `missing /course-assets/${course.assetSlug}/ image path`);

    const progress = await req('PUT', '/enrollments/progress', token, {
      enrollment_id: enrollment.id,
      lesson_id: lessons[0].id,
      time_spent_seconds: 90,
    });
    check(`progress.update.${course.key}`, progress.status === 200, JSON.stringify(progress.data));

    const progressRead = await req('GET', `/enrollments/${enrollment.id}/progress`, token);
    check(`progress.persist.${course.key}`, progressRead.status === 200 && (progressRead.data?.progress || []).length >= 1, JSON.stringify(progressRead.data));

    if (course.expectsAssessment) {
      const questions = await req('GET', `/courses/${course.id}/questions?is_final=true`, token);
      const qs = questions.data?.questions || [];
      check(`assessment.questions.${course.key}`, questions.status === 200 && qs.length > 0, JSON.stringify(questions.data));

      const failAnswers = qs.map((q) => ({ question_id: q.id, answer: Number(q.correct_answer) === 0 ? 1 : 0 }));
      const failAttempt = await req('POST', `/courses/${course.id}/attempt`, token, {
        enrollment_id: enrollment.id,
        is_final: true,
        answers: failAnswers,
      });
      check(`assessment.fail.${course.key}`, failAttempt.status === 200 && failAttempt.data?.passed === false, JSON.stringify(failAttempt.data));

      const passAnswers = qs.map((q) => ({ question_id: q.id, answer: Number(q.correct_answer) }));
      const passAttempt = await req('POST', `/courses/${course.id}/attempt`, token, {
        enrollment_id: enrollment.id,
        is_final: true,
        answers: passAnswers,
      });
      check(`assessment.pass.${course.key}`, passAttempt.status === 200 && passAttempt.data?.passed === true, JSON.stringify(passAttempt.data));
    }
  }

  const outPath = `cleanup-reports/real-training-e2e-report-${Date.now()}.json`;
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`E2E verification passed.\nReport: ${outPath}`);
}

run().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
