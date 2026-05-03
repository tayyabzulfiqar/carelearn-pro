const { test, expect } = require('@playwright/test');
const { buildAttemptQuestionSet } = require('./src/lib/quizSession');

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
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function apiPut(request, token, path, body) {
  const response = await request.put(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: body,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function apiPost(request, token, path, body) {
  const response = await request.post(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: body,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function answerQuiz(page, questions, seed, mode = 'pass') {
  const attempt = buildAttemptQuestionSet({ seed, questions });

  for (let questionIndex = 0; questionIndex < attempt.questions.length; questionIndex += 1) {
    const question = attempt.questions[questionIndex];
    const optionButtons = page.locator('div.grid > button');
    const targetIndex = mode === 'pass'
      ? question.correct_answer
      : (question.correct_answer === 0 ? 1 : 0);

    await optionButtons.nth(targetIndex).click();
    await page.getByRole('button', { name: 'Confirm Answer' }).click();

    if (questionIndex < questions.length - 1) {
      await page.getByRole('button', { name: 'Next Question' }).click();
    }
  }

  await page.getByRole('button', { name: 'Submit Quiz' }).click();
}

test('Fire Safety Awareness lesson quiz, fail gate, retry, and certificate flow work end to end', async ({ page, request }) => {
  test.setTimeout(120000);
  await login(page);
  const token = await getAuthCookie(page);
  const currentUser = await getUserCookie(page);

  const coursesPayload = await apiGet(request, token, '/courses?status=published');
  const course = coursesPayload.courses.find((item) => item.title === 'Fire Safety Awareness');
  expect(course).toBeTruthy();

  await page.goto(`${BASE}/dashboard/courses/${course.id}/player`);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });

  const coursePayload = await apiGet(request, token, `/courses/${course.id}`);
  const allLessons = (coursePayload.course.modules || []).flatMap((module) => module.lessons || []);
  expect(allLessons.length).toBe(17);

  const enrollmentsPayload = await apiGet(request, token, '/enrollments/my');
  const enrollment = enrollmentsPayload.enrollments.find((item) => item.course_id === course.id);
  expect(enrollment).toBeTruthy();

  const progressPayload = await apiGet(request, token, `/enrollments/${enrollment.id}/progress`);
  const completedIds = new Set((progressPayload.progress || []).filter((item) => item.completed).map((item) => item.lesson_id));
  const nextIncompleteIndex = allLessons.findIndex((lesson) => !completedIds.has(lesson.id));
  const lessonIndex = nextIncompleteIndex === -1 ? allLessons.length - 1 : nextIncompleteIndex;
  const lessonNumber = lessonIndex + 1;

  const images = page.locator('main img');
  const imgCount = await images.count();
  for (let index = 0; index < imgCount; index += 1) {
    const naturalWidth = await images.nth(index).evaluate((element) => element.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  }

  await page.getByRole('button', { name: /Go to Assessment|Next/i }).last().click();
  await expect(page.getByText(`Lesson ${lessonNumber} Quiz`)).toBeVisible({ timeout: 15000 });

  const lessonQuestionsPayload = await apiGet(request, token, `/courses/${course.id}/lessons/${lessonNumber}/questions`);
  expect(lessonQuestionsPayload.questions.length).toBe(14);

  await answerQuiz(page, lessonQuestionsPayload.questions, `lesson-${lessonNumber}-1`, 'fail');
  await expect(page.getByText('You must achieve at least 75% to pass.')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Restart Quiz' }).click();

  await answerQuiz(page, lessonQuestionsPayload.questions, `lesson-${lessonNumber}-2`, 'pass');

  for (const lesson of allLessons) {
    if (!completedIds.has(lesson.id)) {
      await apiPut(request, token, '/enrollments/progress', {
        enrollment_id: enrollment.id,
        lesson_id: lesson.id,
        time_spent_seconds: 60,
      });
    }
  }

  await page.goto(`${BASE}/dashboard/courses/${course.id}/player`);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });

  const finalQuestionsPayload = await apiGet(request, token, `/courses/${course.id}/questions?is_final=true`);
  expect(finalQuestionsPayload.questions.length).toBeGreaterThan(0);
  const finalAttempt = await apiPost(request, token, `/courses/${course.id}/attempt`, {
    enrollment_id: enrollment.id,
    is_final: true,
    answers: finalQuestionsPayload.questions.map((question) => ({
      question_id: question.id,
      answer: question.correct_answer,
    })),
  });
  expect(finalAttempt.passed).toBeTruthy();

  const certificatePayload = await apiPost(request, token, '/certificates', {
    enrollment_id: enrollment.id,
    user_id: currentUser.id,
    course_id: course.id,
    organisation_id: enrollment.organisation_id || null,
  });
  expect(certificatePayload.certificate.template.statusText).toBe('PASS');
  expect(certificatePayload.certificate.template.backgroundImage).toContain('certificate_fire_safety.png');
});
