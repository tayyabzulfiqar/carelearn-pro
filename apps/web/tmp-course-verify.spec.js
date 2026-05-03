const { test, expect } = require('@playwright/test');

test('imported course is visible in dashboard', async ({ page }) => {
  await page.goto('https://carelearn-pro-web.vercel.app/login');
  await page.getByLabel('Email address').fill('admin@test.com');
  await page.getByLabel('Password').fill('Admin1234');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForURL('**/dashboard');
  await page.goto('https://carelearn-pro-web.vercel.app/dashboard/courses');

  await expect(page.getByRole('heading', { name: 'All Courses' })).toBeVisible();
  await expect(page.getByText('Fire Safety Training')).toBeVisible();
});
