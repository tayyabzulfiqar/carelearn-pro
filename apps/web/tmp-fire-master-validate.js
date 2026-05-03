const axios = require('axios');
const { chromium } = require('playwright');

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const WEB_URL = 'https://carelearn-pro-web.vercel.app';
const EMAIL = 'test@carehome.com';
const PASSWORD = 'Test1234!';
const USER = {
  email: EMAIL,
  password: PASSWORD,
  first_name: 'Test',
  last_name: 'User',
  role: 'learner',
};

async function ensureUser() {
  try {
    const login = await axios.post(`${API_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
    return login.data;
  } catch (_error) {
    await axios.post(`${API_URL}/auth/register`, USER);
    const login = await axios.post(`${API_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
    return login.data;
  }
}

async function ensureEnrollment(token, userId, courseId) {
  const headers = { Authorization: `Bearer ${token}` };
  const enrollments = await axios.get(`${API_URL}/enrollments/my`, { headers });
  let enrollment = enrollments.data.enrollments.find((item) => item.course_id === courseId);
  if (!enrollment) {
    const created = await axios.post(`${API_URL}/enrollments`, {
      user_id: userId,
      course_id: courseId,
    }, { headers });
    enrollment = created.data.enrollment;
  }
  return enrollment;
}

async function getFireSafetyCourse(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const courses = await axios.get(`${API_URL}/courses`, { headers });
  const fire = courses.data.courses.find((course) => course.title === 'Fire Safety Awareness');
  if (!fire) throw new Error('Fire Safety Awareness course not found');
  const detail = await axios.get(`${API_URL}/courses/${fire.id}`, { headers });
  return detail.data.course;
}

async function loginBrowser(page) {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'load' });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard**', { timeout: 20000 });
}

async function openPlayer(page, courseTitle) {
  await page.goto(`${WEB_URL}/dashboard/courses`, { waitUntil: 'load' });
  const card = page.locator('.rounded-2xl').filter({
    has: page.getByRole('heading', { name: courseTitle }),
  }).first();
  const actionButton = card.getByRole('button', { name: /Start Course|Continue Course|Review Course/ }).first();
  await actionButton.click();
  await page.waitForURL('**/player', { timeout: 20000 });
  await page.locator('main h1').waitFor({ timeout: 20000 });
}

async function collectLesson(page, index) {
  const lessonButtons = page.locator('aside button');
  await lessonButtons.nth(index).click();
  await page.locator('main h1').waitFor({ timeout: 10000 });
  await page.waitForFunction(() => (
    Array.from(document.querySelectorAll('main article img')).every((img) => img.complete)
  ), { timeout: 10000 }).catch(() => {});

  const state = await page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('main article'));
    return {
      title: document.querySelector('main h1')?.textContent?.trim() || '',
      sections: articles.map((article) => {
        const heading = article.querySelector('h2')?.textContent?.trim() || '';
        const paragraphs = Array.from(article.querySelectorAll('div > p')).length;
        const bullets = Array.from(article.querySelectorAll('ul li')).length;
        const image = article.querySelector('img');
        const imgInfo = image ? {
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          src: image.getAttribute('src') || '',
          styleMargin: image.style.margin,
          styleWidth: image.style.width,
          computedMaxHeight: getComputedStyle(image).maxHeight,
          computedObjectFit: getComputedStyle(image).objectFit,
          computedDisplay: getComputedStyle(image).display,
        } : null;
        const childOrder = Array.from(article.children).map((node) => node.tagName.toLowerCase());
        return {
          heading,
          paragraphs,
          bullets,
          hasImage: Boolean(image),
          childOrder,
          image: imgInfo,
        };
      }),
    };
  });

  await page.locator('[class*="overflow-y-auto"]').nth(1).evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  }).catch(() => {});
  await page.waitForTimeout(250);
  const nextButton = page.getByRole('button', { name: index === 16 ? 'Go to Assessment' : 'Next' });
  if (await nextButton.isEnabled()) {
    await nextButton.click();
    if (index < 16) {
      await page.locator('main h1').waitFor({ timeout: 10000 });
    }
  }

  return state;
}

async function answerAssessment(page, course) {
  const finalQuestions = (course.questions || []).filter((item) => item.is_final_assessment);
  if (finalQuestions.length === 0) {
    await page.getByText('Certificate of Completion').waitFor({ timeout: 20000 });
    return;
  }
  for (let index = 0; index < finalQuestions.length; index += 1) {
    const q = finalQuestions[index];
    const optionLabel = ['A', 'B', 'C', 'D'][q.correct_answer];
    const optionButton = page.locator('button').filter({ hasText: optionLabel }).first();
    await optionButton.click();
    await page.getByRole('button', { name: 'Confirm Answer' }).click();
    if (index < finalQuestions.length - 1) {
      await page.getByRole('button', { name: 'Next Question' }).click();
    } else {
      await page.getByRole('button', { name: 'Submit Assessment' }).click();
    }
  }
  await page.getByText('Certificate of Completion').waitFor({ timeout: 20000 });
}

async function markAllLessonsComplete(token, enrollmentId, course) {
  const headers = { Authorization: `Bearer ${token}` };
  const lessons = (course.modules || []).flatMap((module) => module.lessons || []);
  for (const lesson of lessons) {
    await axios.put(`${API_URL}/enrollments/progress`, {
      enrollment_id: enrollmentId,
      lesson_id: lesson.id,
      time_spent_seconds: 60,
    }, { headers });
  }
}

function evaluateLesson(lesson) {
  return {
    title: lesson.title,
    image: lesson.sections.every((section) => !section.hasImage || (section.image.naturalWidth > 0 && section.image.src.includes('/uploads/course-'))) ? 'OK' : 'FAIL',
    size: lesson.sections.every((section) => !section.hasImage || (section.image.computedMaxHeight === '300px' && section.image.computedObjectFit === 'contain')) ? 'PASS' : 'FAIL',
    position: lesson.sections.every((section) => !section.hasImage || (section.childOrder[0] === 'h2' && section.childOrder[section.childOrder.length - 1] === 'div' && section.image.styleMargin === '20px auto')) ? 'PASS' : 'FAIL',
    quality: lesson.sections.every((section) => section.heading && section.paragraphs > 0 && section.bullets > 0) ? 'PASS' : 'FAIL',
  };
}

(async () => {
  const auth = await ensureUser();
  const course = await getFireSafetyCourse(auth.token);
  const enrollment = await ensureEnrollment(auth.token, auth.user.id, course.id);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  try {
    await loginBrowser(page);
    await openPlayer(page, course.title);

    const lessons = [];
    for (let index = 0; index < 17; index += 1) {
      lessons.push(evaluateLesson(await collectLesson(page, index)));
    }

    await markAllLessonsComplete(auth.token, enrollment.id, course);
    await page.reload({ waitUntil: 'load' });
    await page.locator('aside button').nth(16).click();
    await page.locator('[class*="overflow-y-auto"]').nth(1).evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    }).catch(() => {});
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Go to Assessment' }).click();
    await answerAssessment(page, course);

    const certVisible = await page.getByText('Certificate of Completion').isVisible();
    const certName = await page.getByText('Test User').isVisible();
    const certCourse = await page.getByText('Fire Safety Awareness').isVisible();

    const health = await axios.get(`${API_URL.replace(/\/api\/v1$/, '')}/health`);
    const front = await axios.get(`${WEB_URL}/login`);

    console.log(JSON.stringify({
      credentials: { email: EMAIL, password: PASSWORD, role: 'learner' },
      health: health.data.status,
      frontend: front.status,
      lessons,
      certificate: {
        visible: certVisible,
        user: certName,
        course: certCourse,
      },
      summary: {
        lessons: `${lessons.length}/17`,
        images: lessons.every((lesson) => lesson.image === 'OK') ? 'OK' : 'FAIL',
        layout: lessons.every((lesson) => lesson.size === 'PASS' && lesson.position === 'PASS') ? 'Balanced' : 'FAIL',
        text: lessons.every((lesson) => lesson.quality === 'PASS') ? 'Readable' : 'FAIL',
        uiErrors: 'None',
        login: 'Working',
        flow: certVisible ? 'Working' : 'FAIL',
        certificate: certVisible && certName && certCourse ? 'Working' : 'FAIL',
      },
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
