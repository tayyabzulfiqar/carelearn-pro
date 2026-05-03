const { chromium } = require('playwright');
const axios = require('axios');
const { Client } = require('pg');

const APP_URL = 'https://carelearn-pro-web.vercel.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL;
const EMAIL = 'test@care.com';
const PASSWORD = 'Test1234!';

async function getDemoCourse() {
  const login = await axios.post(`${API_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
  const token = login.data.token;
  const coursesResponse = await axios.get(`${API_URL}/courses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const firstCourse = coursesResponse.data.courses?.[0];

  if (!firstCourse) {
    throw new Error('No published courses were returned from the API.');
  }

  const courseResponse = await axios.get(`${API_URL}/courses/${firstCourse.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return {
    token,
    course: courseResponse.data.course,
  };
}

async function resetCourseState(courseId) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const userResult = await client.query('SELECT id FROM users WHERE email = $1', [EMAIL]);
  const userId = userResult.rows[0]?.id;

  if (!userId) {
    await client.end();
    throw new Error('Demo user was not found for state reset.');
  }

  const enrollmentResult = await client.query(
    'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );
  const enrollmentId = enrollmentResult.rows[0]?.id;

  if (!enrollmentId) {
    await client.end();
    return;
  }

  await client.query('DELETE FROM certificates WHERE enrollment_id = $1', [enrollmentId]);
  await client.query('DELETE FROM assessment_attempts WHERE enrollment_id = $1', [enrollmentId]);
  await client.query('DELETE FROM progress WHERE enrollment_id = $1', [enrollmentId]);
  await client.query('DELETE FROM enrollments WHERE id = $1', [enrollmentId]);
  await client.end();
}

async function loginViaUi(page) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/dashboard**', { timeout: 30000 });
}

async function isVisible(locator) {
  return locator.isVisible().catch(() => false);
}

async function waitForEnabled(locator, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await locator.isEnabled()) return;
    await locator.page().waitForTimeout(500);
  }
  throw new Error('Timed out waiting for a control to become enabled.');
}

async function validateCurrentLesson(page, stats) {
  const nextButton = page.locator('footer button').last();
  stats.nextInitiallyDisabled = stats.nextInitiallyDisabled || !(await nextButton.isEnabled());

  const contentPanels = page.locator('div.overflow-y-auto');
  const panelCount = await contentPanels.count();
  const contentScroller = panelCount > 0 ? contentPanels.nth(panelCount - 1) : page.locator('body');
  await contentScroller.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  stats.validationMethod = stats.validationMethod || 'scroll';

  await waitForEnabled(nextButton);
  stats.readyVisible = await isVisible(page.getByText('Ready'));
  await nextButton.click();
}

async function completeLessons(page, stats) {
  let guard = 0;
  while (!(await isVisible(page.getByText('Final Assessment'))) && guard < 20) {
    await validateCurrentLesson(page, stats);
    guard += 1;
  }
  if (!(await isVisible(page.getByText('Final Assessment')))) {
    throw new Error('Did not reach the assessment after traversing lessons.');
  }
}

async function answerAssessment(page, indices) {
  for (let questionIndex = 0; questionIndex < indices.length; questionIndex += 1) {
    const optionButtons = page.locator('div.flex.flex-col.gap-3.mb-6 > button');
    await optionButtons.nth(indices[questionIndex]).click();
    await page.getByRole('button', { name: 'Confirm Answer' }).click();
    const isLast = questionIndex === indices.length - 1;
    if (isLast) {
      await page.getByRole('button', { name: 'Submit Assessment' }).click();
    } else {
      await page.getByRole('button', { name: 'Next Question' }).click();
    }
  }
}

async function getBrokenImageCount(page) {
  return page.locator('img').evaluateAll((images) =>
    images.filter((img) => img.complete && img.naturalWidth === 0).length
  );
}

(async () => {
  const { course } = await getDemoCourse();
  await resetCourseState(course.id);
  const correctAnswers = (course.questions || [])
    .filter((question) => question.is_final_assessment)
    .sort((a, b) => a.order_index - b.order_index)
    .map((question) => question.correct_answer);

  if (correctAnswers.length === 0) {
    throw new Error('Selected course does not have final assessment questions.');
  }

  const wrongAnswers = correctAnswers.map((answer) => ((answer + 1) % 4));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  const stats = {
    validationMethod: null,
    nextInitiallyDisabled: false,
    readyVisible: false,
  };

  await loginViaUi(page);
  await page.goto(`${APP_URL}/dashboard/courses`, { waitUntil: 'networkidle' });

  const coursesVisible = await page.getByRole('heading', { name: 'All Courses' }).isVisible();
  const chosenCourseHeading = page.getByRole('heading', { name: course.title });
  await chosenCourseHeading.waitFor({ state: 'visible', timeout: 30000 });

  const courseCard = page.locator('.rounded-2xl').filter({ has: chosenCourseHeading }).first();
  const enrollButton = courseCard.getByRole('button', { name: 'Enrol Now' });
  if (await isVisible(enrollButton)) {
    await enrollButton.click();
    await page.waitForTimeout(1500);
  }

  const startButton = courseCard.getByRole('button', { name: /Start Course|Continue Course|Review Course/ });
  await startButton.waitFor({ state: 'visible', timeout: 30000 });
  await startButton.click();
  await page.waitForURL(`**/dashboard/courses/${course.id}/player`, { timeout: 30000 });

  await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 30000 });

  const headingsVisible = (await page.locator('h2').count()) > 0;
  const bulletsVisible = (await page.locator('li.list-disc').count()) > 0;
  const paragraphVisible = (await page.locator('p.text-base.leading-8').count()) > 0;
  const brokenImageCount = await getBrokenImageCount(page);

  await completeLessons(page, stats);
  await answerAssessment(page, wrongAnswers);
  await page.getByText('Assessment Failed').waitFor({ state: 'visible', timeout: 30000 });
  const retryVisible = await isVisible(page.getByRole('button', { name: 'Retry Course' }));
  await page.getByRole('button', { name: 'Retry Course' }).click();

  await page.waitForURL(`**/dashboard/courses/${course.id}/player`, { timeout: 30000 });
  await completeLessons(page, stats);
  await answerAssessment(page, correctAnswers);
  await page.getByText('Course Completed').waitFor({ state: 'visible', timeout: 30000 });

  const certificateVisible = await isVisible(page.getByRole('button', { name: 'Download Certificate' }));

  console.log(JSON.stringify({
    loginWorked: true,
    coursesVisible,
    selectedCourse: course.title,
    playerLoaded: true,
    headingsVisible,
    bulletsVisible,
    paragraphVisible,
    brokenImageCount,
    validationMethod: stats.validationMethod,
    nextInitiallyDisabled: stats.nextInitiallyDisabled,
    readyVisible: stats.readyVisible,
    retryVisible,
    certificateVisible,
    consoleErrors,
    pageErrors,
    finalUrl: page.url(),
  }, null, 2));

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
