const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8081';
const API_BASE = 'http://localhost:5000/api/v1';

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').fill('test@care.com');
  await page.locator('input[type="password"]').fill('Test1234!');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

async function getAuthCookie(page) {
  const cookies = await page.context().cookies();
  const authCookie = cookies.find((cookie) => cookie.name === 'cl_token');
  if (!authCookie) throw new Error('Missing cl_token cookie after login');
  return authCookie.value;
}

async function getUserCookie(page) {
  const cookies = await page.context().cookies();
  const userCookie = cookies.find((cookie) => cookie.name === 'cl_user');
  if (!userCookie) throw new Error('Missing cl_user cookie after login');
  return JSON.parse(decodeURIComponent(userCookie.value));
}

async function apiGet(request, token, path) {
  const response = await request.get(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function apiPut(request, token, path, body) {
  const response = await request.put(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function apiPost(request, token, path, body) {
  const response = await request.post(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function answerQuiz(page, mode) {
  for (let index = 0; index < 14; index += 1) {
    const answerIndex = mode === 'pass' ? 0 : (index < 10 ? 0 : 1);
    await page.locator('div.grid > button').nth(answerIndex).click();

    if (index < 13) {
      await page.getByRole('button', { name: 'Next Question' }).click();
    }
  }

  await page.getByRole('button', { name: 'Submit Quiz' }).click();
}

test('fixed fire safety quiz gates lessons, fails at under 75 percent, and issues certificate on pass', async ({ page, request }) => {
  test.setTimeout(120000);

  await login(page);
  const token = await getAuthCookie(page);
  const currentUser = await getUserCookie(page);

  const coursesPayload = await apiGet(request, token, '/courses?status=published');
  const course = coursesPayload.courses.find((item) => item.title === 'Fire Safety Awareness');
  expect(course).toBeTruthy();

  const coursePayload = await apiGet(request, token, `/courses/${course.id}`);
  const lessons = (coursePayload.course.modules || []).flatMap((module) => module.lessons || []);
  expect(lessons.length).toBe(17);

  const enrollmentsPayload = await apiGet(request, token, '/enrollments/my');
  const enrollment = enrollmentsPayload.enrollments.find((item) => item.course_id === course.id);
  expect(enrollment).toBeTruthy();

  await page.goto(`${BASE}/dashboard/courses/${course.id}/player`);
  await expect(page.locator('body')).toContainText('Fire Safety Awareness', { timeout: 15000 });
  await expect(page.locator('body')).not.toContainText('Final Quiz');

  for (let index = 0; index < 16; index += 1) {
    await apiPut(request, token, '/enrollments/progress', {
      enrollment_id: enrollment.id,
      lesson_id: lessons[index].id,
      time_spent_seconds: 60,
    });
  }

  await page.goto(`${BASE}/dashboard/courses/${course.id}/player`);
  await expect(page.locator('body')).toContainText(lessons[16].title, { timeout: 15000 });

  const images = page.locator('main img');
  const imageCount = await images.count();
  for (let index = 0; index < imageCount; index += 1) {
    const naturalWidth = await images.nth(index).evaluate((element) => element.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  }

  await page.getByRole('button', { name: 'Go to Assessment' }).click();
  await expect(page.getByText('Final Quiz')).toBeVisible({ timeout: 15000 });

  const questionsPayload = await apiGet(request, token, `/courses/${course.id}/questions?is_final=true`);
  expect(questionsPayload.questions.length).toBe(14);

  await answerQuiz(page, 'fail');
  await expect(page.getByText('You must achieve at least 75 percent to pass')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Retake Quiz' }).click();

  await answerQuiz(page, 'pass');
  await expect(page.getByText('Certificate Ready')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('body')).toContainText('Tayyab Abbasi');
  await expect(page.locator('body')).toContainText('Director: Nargis Nawaz');
  await expect(page.locator('body')).toContainText('Flexible Health Care One Solution Ltd');

  const certificatePayload = await apiPost(request, token, '/certificates', {
    enrollment_id: enrollment.id,
    user_id: currentUser.id,
    course_id: course.id,
    organisation_id: enrollment.organisation_id || null,
  });

  expect(certificatePayload.certificate.template.recipientName).toBe('Tayyab Abbasi');
  expect(certificatePayload.certificate.template.authorizedBy).toBe('Nargis Nawaz');
  expect(certificatePayload.certificate.template.companyName).toBe('Flexible Health Care One Solution Ltd');
});
