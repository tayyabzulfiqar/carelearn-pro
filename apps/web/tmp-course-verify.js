const { chromium } = require('playwright');

const BASE_URL = 'https://carelearn-pro-web.vercel.app';
const LOGIN_EMAIL = 'jane@sunrise-care.co.uk';
const LOGIN_PASSWORD = 'Learner1234!';
const COURSE_TITLE = 'Fire Safety Awareness';

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' });
  await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
  await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard**', { timeout: 20000 });
}

async function openFireSafetyPlayer(page) {
  await page.goto(`${BASE_URL}/dashboard/courses`, { waitUntil: 'load' });

  const card = page.locator('.rounded-2xl').filter({
    has: page.getByRole('heading', { name: COURSE_TITLE }),
  }).first();

  const enrollButton = card.getByRole('button', { name: 'Enrol Now' });
  if (await enrollButton.count()) {
    await enrollButton.click();
    await page.waitForLoadState('load');
  }

  const actionButton = card.getByRole('button', { name: /Start Course|Continue Course|Review Course/ }).first();
  await actionButton.click();
  await page.waitForTimeout(2000);
  await page.waitForURL('**/player', { timeout: 20000 });
  await page.locator('main h1').waitFor({ timeout: 20000 });
}

async function selectLesson(page, index) {
  const sidebarButtons = page.locator('aside button');
  const total = await sidebarButtons.count();
  if (index >= total) {
    throw new Error(`Lesson index ${index} is outside sidebar range ${total}`);
  }

  await sidebarButtons.nth(index).click();
  await page.waitForTimeout(300);
  await page.locator('main h1').waitFor({ timeout: 10000 });
}

async function collectLessonState(page, index) {
  await selectLesson(page, index);
  await page.waitForFunction(() => (
    Array.from(document.querySelectorAll('main article img')).every((img) => img.complete)
  ), { timeout: 10000 }).catch(() => {});

  return page.evaluate(() => {
    const lessonTitle = document.querySelector('main h1')?.textContent?.trim() || '';
    const lessonCounter = Array.from(document.querySelectorAll('section p'))
      .map((node) => node.textContent?.trim() || '')
      .find((text) => /^\d+\s*\/\s*\d+$/.test(text)) || '';

    const articles = Array.from(document.querySelectorAll('main article'));
    const articleChecks = articles.map((article) => {
      const heading = article.querySelector('h2')?.textContent?.trim() || '';
      const paragraphs = Array.from(article.querySelectorAll('div > p'));
      const bullets = Array.from(article.querySelectorAll('ul li'));
      const image = article.querySelector('img');
      const articleRect = article.getBoundingClientRect();

      let imageCheck = null;
      if (image) {
        const style = window.getComputedStyle(image);
        const rect = image.getBoundingClientRect();
        const parentRect = image.parentElement?.getBoundingClientRect();
        imageCheck = {
          src: image.getAttribute('src') || '',
          alt: image.getAttribute('alt') || '',
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          display: style.display,
          objectFit: style.objectFit,
          inlineMargin: image.style.margin,
          marginLeft: style.marginLeft,
          marginRight: style.marginRight,
          maxHeight: style.maxHeight,
          inlineWidth: image.style.width,
          centered: parentRect
            ? Math.abs((rect.left + rect.width / 2) - (parentRect.left + parentRect.width / 2)) <= 3
            : false,
          withinHeightLimit: rect.height <= 370,
          withinArticleBounds: rect.top >= articleRect.top && rect.bottom <= articleRect.bottom + 1,
        };
      }

        const childOrder = Array.from(article.children).map((node) => node.tagName.toLowerCase());

      return {
        heading,
        paragraphs: paragraphs.length,
        bullets: bullets.length,
        hasImage: Boolean(image),
        childOrder,
        imageAfterContent: !image ? true : childOrder[0] === 'h2' && childOrder[1] === 'div' && childOrder[childOrder.length - 1] === 'div',
        image: imageCheck,
      };
    });

    return {
      lessonTitle,
      lessonCounter,
      articleChecks,
    };
  });
}

function evaluateLesson(state) {
  const structurePass = Boolean(
    state.lessonTitle
    && state.articleChecks.length > 0
    && state.articleChecks.every((section) => section.heading && section.paragraphs > 0)
  );

  const imageFound = state.articleChecks.every((section) => (
    !section.hasImage
    || (section.image && section.image.naturalWidth > 0 && section.image.src.includes('/uploads/course-'))
  ));

  const sizePass = state.articleChecks.every((section) => (
    !section.hasImage
    || (
      section.image.withinHeightLimit
      && /px$/.test(section.image.maxHeight)
      && parseFloat(section.image.maxHeight) <= 360
    )
  ));

  const positionPass = state.articleChecks.every((section) => (
    !section.hasImage
    || (
      section.imageAfterContent
      && section.image.centered
      && section.image.display === 'block'
      && section.image.objectFit === 'contain'
      && section.image.inlineMargin === '20px auto'
    )
  ));

  const layoutPass = state.articleChecks.every((section) => (
    !section.hasImage || section.image.withinArticleBounds
  ));

  return {
    title: state.lessonTitle,
    imageFound,
    sizePass,
    positionPass,
    layoutPass,
    structurePass,
    sections: state.articleChecks,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  try {
    await login(page);
    await openFireSafetyPlayer(page);

    const sidebarButtons = page.locator('aside button');
    const totalLessons = await sidebarButtons.count();
    const lessons = [];

    for (let index = 0; index < totalLessons; index += 1) {
      const state = await collectLessonState(page, index);
      lessons.push(evaluateLesson(state));
    }

    console.log(JSON.stringify({
      totalLessons,
      url: page.url(),
      lessons,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
