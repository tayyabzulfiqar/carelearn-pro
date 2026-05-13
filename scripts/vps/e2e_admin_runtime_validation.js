const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axios = require('axios');

const BASE = 'http://187.127.105.253';
const API = `${BASE}/api/v1`;
const ADMIN = { email: 'admin@carelearn.pro', password: 'Admin1234!' };
const LEARNER = { email: 'test@care.com', password: 'Test1234!' };
const ts = Date.now();
const TRAINING = `Codex Runtime Validation Course ${ts}`;
const EDITED = `${TRAINING} Updated`;
const shotsDir = path.resolve('test-results/runtime-admin');
fs.mkdirSync(shotsDir, { recursive: true });

async function apiLogin(creds) {
  const r = await axios.post(`${API}/auth/login`, creds);
  return r.data.token;
}

(async () => {
  const adminToken = await apiLogin(ADMIN);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/admin/, { timeout: 30000 });

  await page.goto(`${BASE}/admin/trainings/new`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[placeholder="Training title"]').fill(TRAINING);
  await page.locator('textarea[placeholder="Professional training description"]').fill('Codex automated end-to-end runtime validation for admin course creation, persistence, media upload, builder and publish workflow.');
  await page.locator('input[placeholder^="Category"]').fill('Codex QA');
  await page.locator('input[type="number"]').fill('35');
  await page.locator('input[placeholder^="Tags"]').fill('codex, qa, runtime');

  const thumb = path.resolve('tmp-codex-assets/thumb.png');
  await page.locator('input[type="file"]').first().setInputFiles(thumb);
  await page.getByRole('button', { name: 'Save Draft & Continue' }).click();
  await page.getByText('Step 2').waitFor({ timeout: 30000 });
  await page.screenshot({ path: path.join(shotsDir, '01-step2-after-save-draft.png'), fullPage: true });

  const fileInput = page.locator('input[type="file"][multiple]');
  await fileInput.setInputFiles([
    path.resolve('tmp-codex-assets/img1.jpg'),
    path.resolve('tmp-codex-assets/img2.jpg'),
    path.resolve('tmp-codex-assets/guide.pdf'),
  ]);
  await page.getByRole('button', { name: /Upload Files & Continue/i }).click();
  await page.getByText('Training Draft Ready').waitFor({ timeout: 40000 });
  await page.screenshot({ path: path.join(shotsDir, '02-step3-draft-ready.png'), fullPage: true });

  await page.goto(`${BASE}/admin/trainings`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[placeholder="Search..."]').fill(TRAINING);
  await page.getByRole('button', { name: 'Apply' }).click();
  const row = page.locator('tr', { hasText: TRAINING }).first();
  await row.getByRole('button', { name: 'Publish' }).click();
  await page.waitForTimeout(1200);

  await page.locator('input[placeholder="Search..."]').fill(TRAINING);
  await page.getByRole('button', { name: 'Apply' }).click();
  const row2 = page.locator('tr', { hasText: TRAINING }).first();
  await row2.getByRole('button', { name: 'Edit' }).click();
  await page.locator('input.field-input').first().fill(EDITED);
  await page.getByRole('button', { name: /Save Training/i }).click();
  await page.waitForTimeout(1500);

  await page.goto(`${BASE}/admin/courses`, { waitUntil: 'domcontentloaded' });
  const tList = await axios.get(`${API}/admin/cms/trainings`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const tRows = tList.data?.data?.trainings || tList.data?.trainings || [];
  const target = tRows.find((t) => t.title === EDITED) || tRows.find((t) => t.title === TRAINING);
  if (!target?.id) throw new Error('Could not locate created training for builder step.');
  await page.locator('select.field-input').first().selectOption({ value: target.id });
  await page.locator('input[placeholder="New module title"]').fill('Module 1 - Runtime Checks');
  await page.getByRole('button', { name: 'Add' }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Open' }).first().click();
  await page.locator('input[placeholder="New lesson title"]').fill('Lesson 1 - Admin Flow Verified');
  await page.getByRole('button', { name: 'Add' }).nth(1).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Edit Content' }).first().click();
  await page.getByRole('button', { name: 'Save Lesson' }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shotsDir, '03-builder-module-lesson.png'), fullPage: true });

  await page.goto(`${BASE}/admin/trainings`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[placeholder="Search..."]').fill(TRAINING);
  await page.getByRole('button', { name: 'Apply' }).click();
  const row3 = page.locator('tr', { hasText: TRAINING }).first();
  const publishBtn = row3.getByRole('button', { name: /Publish|Unpublish/ }).first();
  const txt = await publishBtn.textContent();
  if ((txt || '').trim() === 'Publish') await publishBtn.click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('input[placeholder="Search..."]').fill(TRAINING);
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.locator('tr', { hasText: TRAINING }).first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: path.join(shotsDir, '04-training-persists-after-reload.png'), fullPage: true });

  await page.goto(`${BASE}/dashboard/courses`, { waitUntil: 'domcontentloaded' });
  await page.getByText('All Courses').waitFor({ timeout: 20000 });

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(LEARNER.email);
  await page.locator('input[type="password"]').fill(LEARNER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  await page.goto(`${BASE}/dashboard/courses`, { waitUntil: 'domcontentloaded' });
  await page.getByText(TRAINING).first().waitFor({ timeout: 30000 });
  await page.locator('article,div').filter({ hasText: TRAINING }).getByRole('button', { name: /Enrol Now|Start Course|Continue Course/i }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shotsDir, '05-learner-can-access-course.png'), fullPage: true });

  const learnerToken = await apiLogin(LEARNER);
  const list = await axios.get(`${API}/admin/cms/trainings`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const training = (list.data?.data?.trainings || list.data?.trainings || []).find((t) => t.title === EDITED) || (list.data?.data?.trainings || list.data?.trainings || []).find((t) => t.title === TRAINING);
  const certs = await axios.get(`${API}/certificates/my`, { headers: { Authorization: `Bearer ${learnerToken}` } }).catch(() => ({ data: { certificates: [] } }));

  // verify delete action with a disposable training
  const temp = await axios.post(`${API}/admin/cms/trainings`, {
    title: `Codex Delete Probe ${Date.now()}`,
    description: 'Delete button runtime probe',
    category: 'QA',
    status: 'draft'
  }, { headers: { Authorization: `Bearer ${adminToken}` } });
  const tempId = temp.data?.data?.training?.id || temp.data?.training?.id;
  if (tempId) await axios.delete(`${API}/admin/cms/trainings/${tempId}`, { headers: { Authorization: `Bearer ${adminToken}` } });

  const report = {
    base: BASE,
    trainingTitle: EDITED,
    trainingId: training?.id || null,
    trainingStatus: training?.status || null,
    certificateCountForLearner: (certs.data?.certificates || []).length,
    screenshots: fs.readdirSync(shotsDir).map((f) => path.join(shotsDir, f)),
  };
  fs.writeFileSync(path.join(shotsDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
})();
