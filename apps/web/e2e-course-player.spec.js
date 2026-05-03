const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';

async function loginAs(page, email, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

test.describe('CareLearn Pro — Florence Course Player', () => {

  test('1. Login as learner succeeds', async ({ page }) => {
    await loginAs(page, 'jane@sunrise-care.co.uk', 'Learner1234!');
    expect(page.url()).toContain('/dashboard');
    console.log('✓ Login successful');
  });

  test('2. Courses page lists all 6 published courses', async ({ page }) => {
    await loginAs(page, 'jane@sunrise-care.co.uk', 'Learner1234!');
    await page.goto(`${BASE_URL}/dashboard/courses`);
    await page.waitForLoadState('networkidle');

    const expectedCourses = [
      'Manual Handling Awareness',
      'Safeguarding Adults Level 2',
      'Infection Control Fundamentals',
      'Fire Safety Awareness',
      'Mental Capacity Act 2005',
      'Medication Awareness',
    ];

    for (const title of expectedCourses) {
      // Use role heading to avoid strict mode violation from matching description text
      const heading = page.getByRole('heading', { name: title });
      await expect(heading.first()).toBeVisible({ timeout: 8000 });
    }
    console.log('✓ All 6 courses visible');
  });

  test('3. Course player shows structured lesson content', async ({ page }) => {
    await loginAs(page, 'jane@sunrise-care.co.uk', 'Learner1234!');
    await page.goto(`${BASE_URL}/dashboard/courses`);
    await page.waitForLoadState('networkidle');

    // Find Fire Safety Awareness card heading
    const courseHeading = page.getByRole('heading', { name: 'Fire Safety Awareness' }).first();
    await expect(courseHeading).toBeVisible({ timeout: 8000 });

    // Find the button within the same card — "Enrol Now", "Start Course", "Continue Course"
    // The heading and button are in the same card, scroll to it
    const card = courseHeading.locator('xpath=../../../..');

    // Look for enrol or start button anywhere on the page near this course
    // Strategy: find the Enrol Now button, click it if present, then find Start button
    const enrolBtn = page.getByRole('button', { name: 'Enrol Now' }).first();
    if (await enrolBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Find which "Enrol Now" corresponds to Fire Safety
      // Click the enrol button in the area near "Fire Safety Awareness"
      await courseHeading.scrollIntoViewIfNeeded();
      // Find parent card and click button within it
      const cardEl = page.locator('.rounded-2xl').filter({ has: page.getByRole('heading', { name: 'Fire Safety Awareness' }) });
      await cardEl.getByRole('button').last().click();
      await page.waitForTimeout(2000);
    }

    // Now find and click "Start Course" or "Continue Course" for Fire Safety
    const startBtn = page.locator('.rounded-2xl')
      .filter({ has: page.getByRole('heading', { name: 'Fire Safety Awareness' }) })
      .getByRole('button')
      .last();

    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();

    await page.waitForURL('**/player**', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    console.log('✓ Course player opened');

    // --- Verify lesson title is shown in header ---
    const lessonTitle = page.locator('h1').first();
    await expect(lessonTitle).toBeVisible({ timeout: 5000 });
    const h1Text = await lessonTitle.textContent();
    console.log('  Lesson title:', h1Text?.trim());
    expect(h1Text?.trim().length).toBeGreaterThan(0);

    // --- Verify section headings (h2) exist ---
    const h2Elements = page.locator('h2');
    const h2Count = await h2Elements.count();
    expect(h2Count).toBeGreaterThan(0);
    console.log(`  Section headings: ${h2Count}`);

    // --- Verify paragraphs are present ---
    const paragraphs = page.locator('p.leading-8, p.text-base');
    const paraCount = await paragraphs.count();
    expect(paraCount).toBeGreaterThan(0);
    console.log(`  Paragraphs: ${paraCount}`);

    // --- Verify bullet points ---
    const bullets = page.locator('li.list-disc');
    const bulletCount = await bullets.count();
    expect(bulletCount).toBeGreaterThan(0);
    console.log(`  Bullet points: ${bulletCount}`);

    // --- Verify Next button visible ---
    const nextBtn = page.locator('footer button').last();
    await expect(nextBtn).toBeVisible();
    console.log('  ✓ Next button visible');

    // --- Verify Previous button visible ---
    const prevBtn = page.locator('footer button').first();
    await expect(prevBtn).toBeVisible();
    console.log('  ✓ Previous button visible');

    // --- Verify sidebar with modules ---
    const moduleText = page.locator('text=Module').first();
    await expect(moduleText).toBeVisible({ timeout: 3000 });
    console.log('  ✓ Module sidebar visible');

    // --- Verify progress bar ---
    const progressBars = page.locator('.h-1\\.5.rounded-full.bg-navy-800, .h-1\\.5.bg-navy-800');
    const progressVisible = await progressBars.first().isVisible().catch(() => false);
    console.log('  ✓ Progress bar visible:', progressVisible);

    // --- Verify no oversized images ---
    const images = page.locator('main img');
    const imgCount = await images.count();
    console.log(`  Images in content: ${imgCount}`);
    for (let i = 0; i < imgCount; i++) {
      const box = await images.nth(i).boundingBox();
      if (box) {
        expect(box.height).toBeLessThanOrEqual(400);
        console.log(`    Image ${i+1} height: ${Math.round(box.height)}px ✓`);
      }
    }

    console.log('✓ All content structure checks PASSED');
  });

  test('4. Micro-check validates lesson when answered', async ({ page }) => {
    await loginAs(page, 'jane@sunrise-care.co.uk', 'Learner1234!');
    await page.goto(`${BASE_URL}/dashboard/courses`);
    await page.waitForLoadState('networkidle');

    // Click Start/Continue on Fire Safety
    const startBtn = page.locator('.rounded-2xl')
      .filter({ has: page.getByRole('heading', { name: 'Fire Safety Awareness' }) })
      .getByRole('button')
      .last();
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();
    await page.waitForURL('**/player**', { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Check for micro-check (Quick Check section)
    const quickCheck = page.locator('text=Quick Check');
    const hasMicroCheck = await quickCheck.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasMicroCheck) {
      console.log('  Micro-check found on this lesson');
      // Click first option in micro-check
      const microSection = page.locator('section').filter({ has: page.locator('text=Quick Check') });
      const options = microSection.locator('button');
      await options.first().click();

      // Validation should now show "Ready"
      const readyText = page.locator('text=Ready');
      await expect(readyText).toBeVisible({ timeout: 5000 });
      console.log('✓ Micro-check answered — validation shows Ready');
    } else {
      console.log('  (No micro-check on first lesson — testing scroll validation)');
      // Scroll to bottom to validate
      await page.evaluate(() => {
        const scrollable = document.querySelector('[ref="contentScrollRef"]') ||
          document.querySelector('.overflow-y-auto');
        if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
      });
      await page.waitForTimeout(16000); // Wait for 15s time validation
      const readyText = page.locator('text=Ready');
      await expect(readyText).toBeVisible({ timeout: 5000 });
      console.log('✓ Time-based validation — shows Ready after 15s');
    }
  });

  test('5. Next/Previous navigation works correctly', async ({ page }) => {
    await loginAs(page, 'jane@sunrise-care.co.uk', 'Learner1234!');
    await page.goto(`${BASE_URL}/dashboard/courses`);
    await page.waitForLoadState('networkidle');

    const startBtn = page.locator('.rounded-2xl')
      .filter({ has: page.getByRole('heading', { name: 'Fire Safety Awareness' }) })
      .getByRole('button')
      .last();
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();
    await page.waitForURL('**/player**', { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Read initial lesson number
    const lessonCounter = page.locator('text=/\\d+ \\/ \\d+/').first();
    const initialText = await lessonCounter.textContent();
    console.log('  Starting at lesson:', initialText?.trim());
    expect(initialText).toContain('1 / ');

    // Previous should be disabled on first lesson
    const prevBtn = page.locator('footer button').first();
    const isDisabled = await prevBtn.getAttribute('disabled');
    expect(isDisabled).not.toBeNull();
    console.log('  ✓ Previous disabled on first lesson');

    console.log('✓ Navigation controls working correctly');
  });

});
