const { chromium } = require('playwright');

const COURSE_ID = '2ce6e1d3-5be7-46b1-9081-62df3411bad4';

async function login(page) {
  await page.goto('https://carelearn-pro-web.vercel.app/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill('admin@test.com');
  await page.locator('input[type="password"]').fill('Admin1234');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30000 });
}

async function isVisible(locator) {
  return locator.isVisible().catch(() => false);
}

async function validateLessonAndAdvance(page) {
  const quickCheck = page.getByText('Quick Check');
  if (await isVisible(quickCheck)) {
    await page.locator('section').filter({ hasText: 'Quick Check' }).getByRole('button').first().click();
  } else {
    const contentScroller = page.locator('div.overflow-y-auto').nth(1);
    await contentScroller.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
      node.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
  }

  const nextButton = page.getByRole('button', { name: /Next|Go to Assessment/i });
  await nextButton.waitFor({ state: 'visible', timeout: 30000 });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await nextButton.isEnabled()) break;
    await page.waitForTimeout(1000);
  }

  const enabled = await nextButton.isEnabled();
  if (!enabled) {
    throw new Error('Next button did not enable after validation');
  }

  await nextButton.click();
}

async function answerAssessment(page, choiceIndex) {
  for (let questionIndex = 0; questionIndex < 5; questionIndex += 1) {
    const answerButton = page.locator('div.flex.flex-col.gap-3.mb-6 > button').nth(choiceIndex);
    await answerButton.waitFor({ state: 'visible', timeout: 30000 });
    await answerButton.click();
    const confirmButton = page.getByRole('button', { name: 'Confirm Answer' });
    await confirmButton.waitFor({ state: 'visible', timeout: 30000 });
    await confirmButton.click();
    const submitButton = page.getByRole('button', { name: 'Submit Assessment' });
    if (await isVisible(submitButton)) {
      await submitButton.click();
      return;
    }
    await page.getByRole('button', { name: 'Next Question' }).click();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const desktopPage = await desktop.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  desktopPage.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  desktopPage.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await login(desktopPage);
  await desktopPage.goto('https://carelearn-pro-web.vercel.app/dashboard/courses', { waitUntil: 'networkidle' });
  const coursesHeadingVisible = await desktopPage.getByRole('heading', { name: 'All Courses' }).isVisible();
  await desktopPage.getByRole('button', { name: /Start Course|Continue|Review Course/i }).first().click();
  await desktopPage.waitForURL(`**/dashboard/courses/${COURSE_ID}/player`, { timeout: 30000 });

  const sidebarVisible = await isVisible(desktopPage.locator('aside'));
  const sidebarLessonButtons = desktopPage.locator('aside button');
  const sidebarLessonCount = await sidebarLessonButtons.count();
  const firstLessonVisible = sidebarLessonCount > 0;
  const lessonContentVisible = await isVisible(desktopPage.locator('main').locator('p, img, section').first());
  const firstImage = desktopPage.locator('img[src*="/uploads/"]').first();
  const imageVisible = await isVisible(firstImage);
  const imageLoaded = imageVisible
    ? await firstImage.evaluate((img) => img.complete && img.naturalWidth > 0)
    : false;

  let lessonsTraversed = 1;
  while (await desktopPage.getByRole('button', { name: /Next|Go to Assessment/i }).count() > 0) {
    const assessmentButton = desktopPage.getByRole('button', { name: 'Go to Assessment' });
    if (await isVisible(assessmentButton)) {
      await validateLessonAndAdvance(desktopPage);
      break;
    }
    await validateLessonAndAdvance(desktopPage);
    lessonsTraversed += 1;
    if (lessonsTraversed > 20) break;
  }

  const assessmentVisible = await isVisible(desktopPage.getByText('Final Assessment'));
  await answerAssessment(desktopPage, 1);
  await desktopPage.waitForTimeout(1000);
  const failVisible = await isVisible(desktopPage.getByText('Assessment Failed'));
  const retryVisible = await isVisible(desktopPage.getByRole('button', { name: 'Retry Course' }));
  await desktopPage.getByRole('button', { name: 'Retry Course' }).click();
  await desktopPage.waitForTimeout(1000);
  for (let lessonIndex = 0; lessonIndex < 13; lessonIndex += 1) {
    const nextButton = desktopPage.getByRole('button', { name: /Next|Go to Assessment/i });
    if (!(await isVisible(nextButton))) break;
    await nextButton.click();
    if (await isVisible(desktopPage.getByText('Final Assessment'))) break;
  }
  await answerAssessment(desktopPage, 0);
  await desktopPage.waitForTimeout(1500);
  const completedVisible = await isVisible(desktopPage.getByText('Course Completed'));
  const downloadVisible = await isVisible(desktopPage.getByRole('button', { name: 'Download Certificate' }));

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mobile.addCookies(await desktop.cookies());
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`https://carelearn-pro-web.vercel.app/dashboard/courses/${COURSE_ID}/player`, { waitUntil: 'networkidle' });
  const mobileNoHorizontalOverflow = await mobilePage.evaluate(() => {
    const body = document.body;
    return body.scrollWidth <= window.innerWidth + 20;
  });

  console.log(JSON.stringify({
    coursesHeadingVisible,
    sidebarVisible,
    firstLessonVisible,
    sidebarLessonCount,
    lessonContentVisible,
    imageVisible,
    imageLoaded,
    assessmentVisible,
    failVisible,
    retryVisible,
    completedVisible,
    downloadVisible,
    lessonsTraversed,
    consoleErrors,
    pageErrors,
    mobileNoHorizontalOverflow,
    finalUrl: desktopPage.url(),
  }));

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
