/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.WEB_BASE || 'http://187.127.105.253';
const API = process.env.API_BASE || `${BASE}/api/v1`;
const EMAIL = process.env.DEMO_EMAIL || 'demo.learner@carelearn.local';
const PASSWORD = process.env.DEMO_PASSWORD || 'DemoLearner123!';
const COURSE_ID = process.env.COURSE_ID || '91fd81e6-f9d9-4dda-9d91-5fbc07f22f37';

async function req(method, p, token, body) {
  const r = await fetch(`${API}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let data = null;
  try { data = t ? JSON.parse(t) : null; } catch { data = { raw: t }; }
  return { status: r.status, data };
}

async function run() {
  const report = {
    at: new Date().toISOString(),
    base: BASE,
    api: API,
    course_id: COURSE_ID,
    checks: [],
    screenshots: [],
    warnings: [],
  };
  const outDir = path.resolve(process.cwd(), 'cleanup-reports');
  fs.mkdirSync(outDir, { recursive: true });

  const check = (name, ok, detail) => {
    report.checks.push({ name, ok, detail });
    if (!ok) throw new Error(`${name} failed: ${detail}`);
  };

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.startsWith('/login'), { timeout: 30000 });

    const dashboardShot = path.join(outDir, `fire-safety-verify-dashboard-${Date.now()}.png`);
    await page.screenshot({ path: dashboardShot, fullPage: true });
    report.screenshots.push(dashboardShot);
    check('learner.dashboard.visible', /\/dashboard|\/courses/.test(page.url()), page.url());

    const login = await req('POST', '/auth/login', null, { email: EMAIL, password: PASSWORD });
    check('api.auth.login', login.status === 200 && !!login.data?.token, JSON.stringify(login.data));
    const token = login.data.token;

    const enrollments = await req('GET', '/enrollments/my', token);
    check('api.enrollments.my', enrollments.status === 200, JSON.stringify(enrollments.data));
    const enrollment = (enrollments.data?.enrollments || []).find((e) => e.course_id === COURSE_ID);
    check('api.fire_safety.enrollment.exists', !!enrollment, JSON.stringify((enrollments.data?.enrollments || []).map((e) => e.course_id)));

    const detail = await req('GET', `/courses/${COURSE_ID}`, token);
    check('api.fire_safety.course.load', detail.status === 200, JSON.stringify(detail.data));
    const lessons = (detail.data?.course?.modules || []).flatMap((m) => m.lessons || []);
    check('api.fire_safety.lessons.present', lessons.length > 0, `count=${lessons.length}`);

    const playerUrl = `${BASE}/dashboard/courses/${COURSE_ID}/player`;
    await page.goto(playerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle').catch(() => null);

    const playerShot = path.join(outDir, `fire-safety-verify-player-${Date.now()}.png`);
    await page.screenshot({ path: playerShot, fullPage: true });
    report.screenshots.push(playerShot);
    check('learner.lesson.rendering', !/\/(login|error)/.test(page.url()), page.url());

    let imageRender = false;
    for (let i = 0; i < 6; i++) {
      imageRender = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('[data-testid=\"block-image\"], img, [style*=\"course-assets/fire-safety\"]')];
        return nodes.some((el) => {
          const src = el.getAttribute?.('src') || '';
          const style = el.getAttribute?.('style') || '';
          return src.includes('/course-assets/fire-safety/') || style.includes('/course-assets/fire-safety/');
        });
      });
      if (imageRender) break;
      const nextBtn = page.locator('button:has-text(\"Next\"), button:has-text(\"Continue\"), button:has-text(\"Go to Assessment\")').first();
      if (await nextBtn.count()) {
        await nextBtn.click().catch(() => null);
        await page.waitForTimeout(800);
      } else {
        break;
      }
    }
    if (!imageRender) {
      report.warnings.push('Image rendering issue: player shows no rendered Fire Safety image in DOM (expected /course-assets/fire-safety/*).');
      report.checks.push({ name: 'learner.image.rendering', ok: false, detail: 'no /course-assets/fire-safety/ image detected in DOM' });
    } else {
      report.checks.push({ name: 'learner.image.rendering', ok: true, detail: 'fire-safety image block rendered' });
    }

    for (const lesson of lessons) {
      const progressUpdate = await req('PUT', '/enrollments/progress', token, {
        enrollment_id: enrollment.id,
        lesson_id: lesson.id,
        time_spent_seconds: 120,
      });
      check(`api.progress.update.${lesson.id}`, progressUpdate.status === 200, JSON.stringify(progressUpdate.data));
    }

    const progressRead = await req('GET', `/enrollments/${enrollment.id}/progress`, token);
    const progressItems = progressRead.data?.progress || [];
    check('api.progress.persistence', progressRead.status === 200 && progressItems.length > 0, JSON.stringify(progressRead.data));

    const questions = await req('GET', `/courses/${COURSE_ID}/questions?is_final=true`, token);
    const qs = questions.data?.questions || [];
    check('api.assessment.questions', questions.status === 200 && qs.length > 0, JSON.stringify(questions.data));

    const assessmentShot = path.join(outDir, `fire-safety-verify-assessment-${Date.now()}.png`);
    await page.screenshot({ path: assessmentShot, fullPage: true });
    report.screenshots.push(assessmentShot);

    const passAnswers = qs.map((q) => ({ question_id: q.id, answer: Number(q.correct_answer) }));
    const passAttempt = await req('POST', `/courses/${COURSE_ID}/attempt`, token, {
      enrollment_id: enrollment.id,
      is_final: true,
      answers: passAnswers,
    });
    check('api.assessment.pass', passAttempt.status === 200 && passAttempt.data?.passed === true, JSON.stringify(passAttempt.data));

    const complete = await req('POST', '/enrollments/complete', token, { enrollment_id: enrollment.id });
    check('api.completion.mark', complete.status === 200, JSON.stringify(complete.data));

    const enrollmentsAfter = await req('GET', '/enrollments/my', token);
    const after = (enrollmentsAfter.data?.enrollments || []).find((e) => e.id === enrollment.id);
    check('api.completion.persistence', !!after && after.status === 'completed', JSON.stringify(after));

    const completionShot = path.join(outDir, `fire-safety-verify-completion-${Date.now()}.png`);
    await page.goto(`${BASE}/dashboard/courses`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.screenshot({ path: completionShot, fullPage: true });
    report.screenshots.push(completionShot);
  } finally {
    await ctx.close();
    await browser.close();
  }

  const reportPath = path.join(outDir, `fire-safety-public-verification-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Public verification complete.\nReport: ${reportPath}`);
}

run().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
