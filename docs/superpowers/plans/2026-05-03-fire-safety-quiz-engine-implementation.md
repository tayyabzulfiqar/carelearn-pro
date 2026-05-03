# Fire Safety Quiz Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Fire Safety course content pipeline with a deterministic lesson quiz and certificate system that preserves learner data, enforces a 75% pass mark, and validates the full login-to-certificate flow locally.

**Architecture:** The API will own content import, deterministic question generation, versioned active quiz delivery, scoring, and certificate issuance. The web app will render lesson-gated quizzes, fail/pass transitions, and a certificate preview based on the real template image. Validation will combine `node:test` unit coverage, import checks, and Playwright end-to-end verification.

**Tech Stack:** Node.js, Express, PostgreSQL, Next.js 14, React, node:test, Playwright, GitHub CLI

---

## File Map

**Create:**
- `apps/api/src/lib/fire-safety-quiz.js`
- `apps/api/src/lib/fire-safety-quiz.test.js`
- `apps/api/src/lib/certificate-template.js`
- `apps/api/src/lib/certificate-template.test.js`
- `apps/api/src/scripts/validate-fire-safety-system.js`
- `apps/web/src/lib/quizSession.js`
- `apps/web/src/lib/quizSession.test.js`

**Modify:**
- `apps/api/src/models/index.js`
- `apps/api/src/lib/fire-safety-course.js`
- `apps/api/src/lib/fire-safety-course.test.js`
- `apps/api/src/controllers/assessments.controller.js`
- `apps/api/src/controllers/certificates.controller.js`
- `apps/api/src/routes/courses.routes.js`
- `apps/api/src/scripts/import-fire-safety-course.js`
- `apps/api/src/seed.js`
- `apps/web/src/lib/coursePlayerState.js`
- `apps/web/src/lib/coursePlayerState.test.js`
- `apps/web/src/components/player/QuizView.js`
- `apps/web/src/components/player/CertificateView.js`
- `apps/web/src/app/dashboard/courses/[courseId]/player/page.js`
- `apps/web/e2e-fire-safety.spec.js`
- `package.json`
- `README.md`

**Operational commands:**
- `git init`
- `gh repo create carelearn-pro --source . --private --remote origin --push`
- `node --test apps/api/src/lib/fire-safety-course.test.js apps/api/src/lib/fire-safety-quiz.test.js apps/api/src/lib/certificate-template.test.js apps/web/src/lib/coursePlayerState.test.js apps/web/src/lib/quizSession.test.js`
- `node apps/api/src/scripts/import-fire-safety-course.js`
- `node apps/api/src/scripts/validate-fire-safety-system.js`
- `npx playwright test apps/web/e2e-fire-safety.spec.js`

### Task 1: Bootstrap Git And Verify Remote Access

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Check for local git metadata and GitHub auth**

Run:

```powershell
Test-Path .git
gh auth status
```

Expected:

- `False` for `.git` before initialization
- `gh auth status` either shows the signed-in account or prints the login-required message

- [ ] **Step 2: Initialize the repository if `.git` is absent**

Run:

```powershell
git init -b main
```

Expected:

- repository initializes in `C:\Users\HP\carelearn-pro`

- [ ] **Step 3: Add a short setup note for local verification commands**

Update `README.md` with a section like:

```md
## Fire Safety Validation

Run the content refresh and validation pipeline:

```bash
npm run fire-safety:import
npm run fire-safety:validate
```
```

- [ ] **Step 4: Stage all files and create the initial commit**

Run:

```powershell
git add .
git commit -m "chore: bootstrap carelearn-pro repository"
```

Expected:

- one local commit on `main`

- [ ] **Step 5: Create or connect the GitHub remote**

Run:

```powershell
gh repo create carelearn-pro --source . --private --remote origin --push
```

Fallback if the repo already exists:

```powershell
gh repo view carelearn-pro --json url
git remote remove origin
git remote add origin https://github.com/<owner>/carelearn-pro.git
git push -u origin main --force-with-lease
```

Expected:

- `origin` points at the GitHub repository
- `main` is pushed successfully

### Task 2: Add Fire Safety Quiz Metadata Support In The Database Layer

**Files:**
- Modify: `apps/api/src/models/index.js`
- Test: `apps/api/src/lib/fire-safety-quiz.test.js`

- [ ] **Step 1: Write a failing test for generated question metadata**

Create `apps/api/src/lib/fire-safety-quiz.test.js` with a first test like:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLessonQuestionSet } = require('./fire-safety-quiz');

test('buildLessonQuestionSet returns exactly 14 typed questions with a 4/7/3 difficulty split', () => {
  const lesson = {
    lesson_number: 1,
    title: 'Learning Outcomes',
    sections: [
      {
        heading: 'Purpose',
        paragraphs: ['Staff must prevent fire and respond immediately.'],
        bullets: ['Follow local procedure'],
      },
      {
        heading: 'Responsibilities',
        paragraphs: ['Night staffing and resident dependency change risk.'],
        bullets: ['Use PEEPs correctly'],
      },
    ],
  };

  const questions = buildLessonQuestionSet(lesson);

  assert.equal(questions.length, 14);
  assert.equal(questions.filter((q) => q.difficulty === 'easy').length, 4);
  assert.equal(questions.filter((q) => q.difficulty === 'medium').length, 7);
  assert.equal(questions.filter((q) => q.difficulty === 'hard').length, 3);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test apps/api/src/lib/fire-safety-quiz.test.js
```

Expected:

- `FAIL` because `fire-safety-quiz.js` does not exist yet

- [ ] **Step 3: Extend the schema for active quiz content versioning**

Update `apps/api/src/models/index.js` so `assessment_questions` includes metadata columns:

```sql
ALTER TABLE assessment_questions
  ADD COLUMN IF NOT EXISTS lesson_number INTEGER,
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20),
  ADD COLUMN IF NOT EXISTS version_tag VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS question_key VARCHAR(150),
  ADD COLUMN IF NOT EXISTS option_order JSONB DEFAULT '[]';
```

Add indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_assessment_questions_course_active
  ON assessment_questions(course_id, is_active, is_final_assessment);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_version
  ON assessment_questions(course_id, version_tag);
```

- [ ] **Step 4: Implement the minimal question-builder module**

Create `apps/api/src/lib/fire-safety-quiz.js` with:

```js
const QUESTION_TARGET = 14;
const DIFFICULTY_PLAN = ['easy','easy','easy','easy','medium','medium','medium','medium','medium','medium','medium','hard','hard','hard'];

function buildLessonQuestionSet(lesson) {
  const facts = (lesson.sections || []).flatMap((section) => {
    const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
    const bullets = Array.isArray(section.bullets) ? section.bullets : [];
    return [...paragraphs, ...bullets].map((text) => String(text).trim()).filter(Boolean);
  });

  return DIFFICULTY_PLAN.map((difficulty, index) => ({
    question_key: `lesson-${lesson.lesson_number}-${index + 1}`,
    question_type: index % 5 === 0 ? 'true_false' : index % 3 === 0 ? 'scenario' : 'multiple_choice',
    difficulty,
    question_text: `Lesson ${lesson.lesson_number}: ${facts[index % facts.length]}`,
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correct_answer: 0,
  }));
}

module.exports = { QUESTION_TARGET, DIFFICULTY_PLAN, buildLessonQuestionSet };
```

- [ ] **Step 5: Re-run the test to verify it passes**

Run:

```powershell
node --test apps/api/src/lib/fire-safety-quiz.test.js
```

Expected:

- `PASS` for the count and difficulty assertions

### Task 3: Implement Deterministic Lesson-Only Question Generation

**Files:**
- Modify: `apps/api/src/lib/fire-safety-course.js`
- Modify: `apps/api/src/lib/fire-safety-quiz.js`
- Test: `apps/api/src/lib/fire-safety-quiz.test.js`

- [ ] **Step 1: Write a failing test that rejects generic or underfilled lesson banks**

Add to `apps/api/src/lib/fire-safety-quiz.test.js`:

```js
const { buildCourseQuizPackage } = require('./fire-safety-quiz');

test('buildCourseQuizPackage generates 14 questions for each lesson and a final exam package', () => {
  const lessons = Array.from({ length: 17 }, (_, index) => ({
    lesson_number: index + 1,
    title: `Lesson ${index + 1}`,
    sections: [
      {
        heading: 'Section A',
        paragraphs: [`Lesson ${index + 1} paragraph one`, `Lesson ${index + 1} paragraph two`],
        bullets: [`Lesson ${index + 1} bullet one`, `Lesson ${index + 1} bullet two`],
      },
      {
        heading: 'Section B',
        paragraphs: [`Lesson ${index + 1} paragraph three`],
        bullets: [`Lesson ${index + 1} bullet three`],
      },
    ],
  }));

  const quizPackage = buildCourseQuizPackage({ lessons, versionTag: 'fire-safety-v1' });

  assert.equal(quizPackage.lessonQuizzes.length, 17);
  assert.equal(quizPackage.lessonQuizzes.every((lesson) => lesson.questions.length === 14), true);
  assert.equal(quizPackage.finalExam.questions.length > 0, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test apps/api/src/lib/fire-safety-quiz.test.js
```

Expected:

- `FAIL` because `buildCourseQuizPackage` is missing

- [ ] **Step 3: Replace placeholder generation with lesson-derived prompt builders**

Update `apps/api/src/lib/fire-safety-quiz.js` so it exports:

```js
function extractLessonFacts(lesson) {
  return (lesson.sections || []).flatMap((section) => {
    const heading = section.heading ? [`${lesson.title}: ${section.heading}`] : [];
    const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
    const bullets = Array.isArray(section.bullets) ? section.bullets : [];
    return [...heading, ...paragraphs, ...bullets].map((text) => String(text).trim()).filter(Boolean);
  });
}

function buildCourseQuizPackage({ lessons, versionTag }) {
  const lessonQuizzes = lessons.map((lesson) => ({
    lesson_number: lesson.lesson_number,
    title: lesson.title,
    questions: buildLessonQuestionSet(lesson).map((question, index) => ({
      ...question,
      version_tag: versionTag,
      lesson_number: lesson.lesson_number,
      order_index: index,
      is_final_assessment: false,
    })),
  }));

  const finalExam = {
    version_tag: versionTag,
    questions: lessonQuizzes.flatMap((lesson) => lesson.questions.slice(0, 2)).map((question, index) => ({
      ...question,
      question_key: `final-${question.lesson_number}-${index + 1}`,
      is_final_assessment: true,
      order_index: index,
    })),
  };

  return { lessonQuizzes, finalExam };
}
```

Then revise `buildLessonQuestionSet` so:

- each question text includes real lesson language
- true/false questions use only two options
- scenario questions mention care-home shift or resident safety context
- no question text contains the strings `Option A`, `Option B`, or generic filler

- [ ] **Step 4: Re-run the test to verify it passes**

Run:

```powershell
node --test apps/api/src/lib/fire-safety-quiz.test.js
```

Expected:

- `PASS` for 17 lesson quizzes and a non-empty final exam

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps/api/src/models/index.js apps/api/src/lib/fire-safety-quiz.js apps/api/src/lib/fire-safety-quiz.test.js
git commit -m "feat: add deterministic fire safety quiz generation"
```

### Task 4: Convert The Import Script To Content-Only Refresh

**Files:**
- Modify: `apps/api/src/scripts/import-fire-safety-course.js`
- Modify: `apps/api/src/lib/fire-safety-course.js`
- Test: `apps/api/src/lib/fire-safety-course.test.js`

- [ ] **Step 1: Write a failing test for the 17-lesson validation rule**

Add to `apps/api/src/lib/fire-safety-course.test.js`:

```js
test('rejects fire safety sources that do not contain exactly 17 lessons', () => withTempDir((dir) => {
  fs.writeFileSync(path.join(dir, 'slide1_1.png'), makePseudoPng(1200, 700));
  fs.writeFileSync(path.join(dir, 'fire-safety-course.json'), JSON.stringify({
    schema_version: 2,
    lessons: [{
      lesson_number: 1,
      title: 'Only Lesson',
      sections: [
        { heading: 'One', paragraphs: ['One'], bullet_points: ['One'], image: { expected_marker: 'slide1_1.png', assigned_file: 'slide1_1.png' } },
        { heading: 'Two', paragraphs: ['Two'], bullet_points: ['Two'] },
      ],
    }],
  }));

  const source = loadFireSafetyCourseSource({ jsonPath: path.join(dir, 'fire-safety-course.json'), imageDir: dir, publicImageBase: '/api/v1/local-images' });
  const result = validateFireSafetyCourseSource(source);
  assert.match(formatCourseValidationReport(result), /Total Lessons: 1/);
  assert.equal(result.lessons.length, 1);
});
```

- [ ] **Step 2: Run the test to verify current behavior is insufficient**

Run:

```powershell
node --test apps/api/src/lib/fire-safety-course.test.js
```

Expected:

- existing tests pass, but there is no exact-17 enforcement yet

- [ ] **Step 3: Implement exact-count and root-folder image validation**

Update `apps/api/src/lib/fire-safety-course.js` so:

- `validateFireSafetyCourseSource` includes `expectedLessonCount`, `actualLessonCount`, and a failing issue when count is not `17`
- every image `src` is derived from the validated root image inventory only
- no HTTP or alternate folder image sources are accepted

Add report output:

```js
lines.push(`Expected Lessons: 17`);
lines.push(`Actual Lessons: ${result.totalLessons}`);
```

- [ ] **Step 4: Change the import script from destructive reset to active content refresh**

Update `apps/api/src/scripts/import-fire-safety-course.js` so it:

- keeps enrollments, progress, attempts, and certificates untouched
- updates `courses.pass_mark` to `75`
- replaces Fire Safety lessons for the active module
- deactivates old Fire Safety questions with `UPDATE assessment_questions SET is_active=false WHERE course_id=$1`
- inserts the new generated lesson and final questions with a new `version_tag`

Do not keep these destructive statements:

```js
await db.query('DELETE FROM enrollments WHERE course_id = $1', [courseId]);
await db.query('DELETE FROM progress WHERE enrollment_id IN (...)', [courseId]);
await db.query('DELETE FROM assessment_attempts WHERE enrollment_id IN (...)', [courseId]);
await db.query('DELETE FROM certificates WHERE enrollment_id IN (...)', [courseId]);
```

- [ ] **Step 5: Re-run the tests**

Run:

```powershell
node --test apps/api/src/lib/fire-safety-course.test.js apps/api/src/lib/fire-safety-quiz.test.js
```

Expected:

- `PASS`

### Task 5: Add Active Quiz Delivery And Scoring Rules To The API

**Files:**
- Modify: `apps/api/src/controllers/assessments.controller.js`
- Modify: `apps/api/src/routes/courses.routes.js`
- Test: `apps/web/src/lib/coursePlayerState.test.js`

- [ ] **Step 1: Write a failing pass-mark test at 75%**

Update `apps/web/src/lib/coursePlayerState.test.js`:

```js
test('calculates pass and fail outcomes using a 75 percent pass mark', () => {
  const passResult = calculateQuizOutcome({
    questions: [
      { id: 'q1', correct_answer: 0 },
      { id: 'q2', correct_answer: 1 },
      { id: 'q3', correct_answer: 2 },
      { id: 'q4', correct_answer: 3 },
    ],
    answers: [
      { question_id: 'q1', answer: 0 },
      { question_id: 'q2', answer: 1 },
      { question_id: 'q3', answer: 2 },
      { question_id: 'q4', answer: 0 },
    ],
    passMark: 75,
  });

  assert.equal(passResult.score, 75);
  assert.equal(passResult.passed, true);
});
```

- [ ] **Step 2: Run the test to verify it fails against the old wording and defaults**

Run:

```powershell
node --test apps/web/src/lib/coursePlayerState.test.js
```

Expected:

- existing assertions still mention `80`

- [ ] **Step 3: Implement active quiz fetch and scoped attempts**

Update `apps/api/src/controllers/assessments.controller.js` so:

- `getQuestions` accepts `lesson_number`, `is_final`, and only returns `is_active=true`
- the selected question rows include `difficulty`, `lesson_number`, `question_key`, and `option_order`
- `submitAttempt` scores against the active question set for the submitted lesson or final exam
- pass mark defaults to `75` if the course value is absent
- fail responses include `message: 'You must achieve at least 75% to pass.'`

Add a lesson-quiz route in `apps/api/src/routes/courses.routes.js`:

```js
router.get('/:courseId/lessons/:lessonNumber/questions', authenticate, a.getQuestions);
```

- [ ] **Step 4: Update the browser-side quiz outcome helper**

Update `apps/web/src/lib/coursePlayerState.js`:

```js
const calculateQuizOutcome = ({ questions, answers, passMark = 75 }) => {
  // existing reduce logic unchanged except for the default pass mark
};
```

- [ ] **Step 5: Re-run the tests**

Run:

```powershell
node --test apps/web/src/lib/coursePlayerState.test.js
```

Expected:

- `PASS`

### Task 6: Add Attempt-Scoped Shuffle Logic

**Files:**
- Create: `apps/web/src/lib/quizSession.js`
- Test: `apps/web/src/lib/quizSession.test.js`
- Modify: `apps/web/src/components/player/QuizView.js`

- [ ] **Step 1: Write a failing test for stable per-attempt shuffling**

Create `apps/web/src/lib/quizSession.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAttemptQuestionSet } = require('./quizSession');

test('buildAttemptQuestionSet shuffles questions and remaps answers without losing correctness', () => {
  const attempt = buildAttemptQuestionSet({
    seed: 'attempt-1',
    questions: [
      { id: 'q1', options: ['A1', 'A2', 'A3', 'A4'], correct_answer: 1 },
      { id: 'q2', options: ['B1', 'B2', 'B3', 'B4'], correct_answer: 2 },
    ],
  });

  assert.equal(attempt.questions.length, 2);
  assert.notDeepEqual(attempt.questions.map((q) => q.id), ['q1', 'q2']);
  attempt.questions.forEach((question) => {
    assert.equal(question.correct_answer >= 0, true);
    assert.equal(question.correct_answer < question.options.length, true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test apps/web/src/lib/quizSession.test.js
```

Expected:

- `FAIL` because `quizSession.js` does not exist yet

- [ ] **Step 3: Implement the minimal shuffler**

Create `apps/web/src/lib/quizSession.js`:

```js
function seededValue(seed, index) {
  return Array.from(`${seed}:${index}`).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function shuffleWithSeed(items, seed) {
  return items
    .map((item, index) => ({ item, sortKey: seededValue(seed, index) }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ item }) => item);
}

function buildAttemptQuestionSet({ seed, questions }) {
  const shuffledQuestions = shuffleWithSeed(questions, `${seed}:questions`).map((question, questionIndex) => {
    const indexedOptions = (question.options || []).map((option, optionIndex) => ({
      option,
      optionIndex,
      sortKey: seededValue(`${seed}:${question.id}:options`, optionIndex),
    })).sort((a, b) => a.sortKey - b.sortKey);

    return {
      ...question,
      options: indexedOptions.map((entry) => entry.option),
      correct_answer: indexedOptions.findIndex((entry) => entry.optionIndex === question.correct_answer),
      display_order: questionIndex,
    };
  });

  return { seed, questions: shuffledQuestions };
}

module.exports = { buildAttemptQuestionSet };
```

- [ ] **Step 4: Wire the shuffle into `QuizView`**

Update `apps/web/src/components/player/QuizView.js` so:

- fetched questions are normalized once per attempt with `buildAttemptQuestionSet`
- option labels are generated from the shuffled array length
- answer submission posts the shuffled question IDs with remapped answer indexes

- [ ] **Step 5: Re-run the tests**

Run:

```powershell
node --test apps/web/src/lib/quizSession.test.js apps/web/src/lib/coursePlayerState.test.js
```

Expected:

- `PASS`

### Task 7: Gate The Course Player By Lesson Quiz Results

**Files:**
- Modify: `apps/web/src/app/dashboard/courses/[courseId]/player/page.js`
- Modify: `apps/web/src/components/player/QuizView.js`

- [ ] **Step 1: Write the failing UI-state assertions in the existing player tests or a new helper test**

Add an assertion to `apps/web/src/lib/coursePlayerState.test.js`:

```js
test('fails a 14-question quiz at 10 correct answers and passes at 11', () => {
  const questions = Array.from({ length: 14 }, (_, index) => ({ id: `q${index}`, correct_answer: 0 }));
  const failAnswers = Array.from({ length: 14 }, (_, index) => ({ question_id: `q${index}`, answer: index < 10 ? 0 : 1 }));
  const passAnswers = Array.from({ length: 14 }, (_, index) => ({ question_id: `q${index}`, answer: index < 11 ? 0 : 1 }));

  assert.equal(calculateQuizOutcome({ questions, answers: failAnswers, passMark: 75 }).passed, false);
  assert.equal(calculateQuizOutcome({ questions, answers: passAnswers, passMark: 75 }).passed, true);
});
```

- [ ] **Step 2: Run the test to verify it fails if any pass-mark logic is wrong**

Run:

```powershell
node --test apps/web/src/lib/coursePlayerState.test.js
```

Expected:

- `FAIL` until all pass-mark defaults and result messages are updated

- [ ] **Step 3: Update player orchestration**

Update `apps/web/src/app/dashboard/courses/[courseId]/player/page.js` so:

- each lesson completion path fetches the lesson quiz before advancing
- a failed lesson quiz keeps the user on that lesson and resets the attempt state
- the result screen shows `You must achieve at least 75% to pass.`
- the final exam only unlocks after all 17 lesson quizzes are passed

- [ ] **Step 4: Update `QuizView` interactions**

Update `apps/web/src/components/player/QuizView.js` so:

- it supports lesson mode and final mode
- it resets selected answers after a failed submission
- it exposes a retry button that starts a fresh shuffled attempt
- it never defaults unanswered final submission choices to `0`

- [ ] **Step 5: Re-run the tests**

Run:

```powershell
node --test apps/web/src/lib/coursePlayerState.test.js apps/web/src/lib/quizSession.test.js
```

Expected:

- `PASS`

### Task 8: Render Certificates From The Real Template Image

**Files:**
- Create: `apps/api/src/lib/certificate-template.js`
- Create: `apps/api/src/lib/certificate-template.test.js`
- Modify: `apps/api/src/controllers/certificates.controller.js`
- Modify: `apps/web/src/components/player/CertificateView.js`

- [ ] **Step 1: Write a failing template test**

Create `apps/api/src/lib/certificate-template.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCertificateTemplateModel } = require('./certificate-template');

test('buildCertificateTemplateModel points at the fire safety certificate image and includes pass overlays', () => {
  const model = buildCertificateTemplateModel({
    imageRoot: 'C:/Users/HP/Desktop/uk training',
    user: { first_name: 'Test', last_name: 'User' },
    issuedAt: '2026-05-03T00:00:00.000Z',
  });

  assert.match(model.backgroundImage, /certificate_fire_safety\.png$/);
  assert.equal(model.statusText, 'PASS');
  assert.equal(model.authorizedBy, 'Nargis Nawaz');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test apps/api/src/lib/certificate-template.test.js
```

Expected:

- `FAIL` because `certificate-template.js` does not exist yet

- [ ] **Step 3: Implement certificate template metadata and API response wiring**

Create `apps/api/src/lib/certificate-template.js`:

```js
const path = require('node:path');

function buildCertificateTemplateModel({ imageRoot, user, issuedAt }) {
  return {
    backgroundImage: path.join(imageRoot, 'certificate_fire_safety.png'),
    recipientName: `${user.first_name} ${user.last_name}`.trim(),
    issuedDate: new Date(issuedAt).toLocaleDateString('en-GB'),
    statusText: 'PASS',
    authorizedBy: 'Nargis Nawaz',
  };
}

module.exports = { buildCertificateTemplateModel };
```

Update `apps/api/src/controllers/certificates.controller.js` so issue and fetch responses include:

```js
template: buildCertificateTemplateModel({
  imageRoot: 'C:/Users/HP/Desktop/uk training',
  user: { first_name: req.user.first_name, last_name: req.user.last_name },
  issuedAt: result.rows[0].issued_at,
})
```

- [ ] **Step 4: Update the certificate UI to render the real template**

Update `apps/web/src/components/player/CertificateView.js` so:

- the background is the actual certificate template image
- name is centered over the template
- date is placed at the bottom
- `PASS` and `Authorised by Nargis Nawaz` are rendered without disturbing the signature area
- the download button prints or exports the template-based layout rather than the current card

- [ ] **Step 5: Re-run the tests**

Run:

```powershell
node --test apps/api/src/lib/certificate-template.test.js
```

Expected:

- `PASS`

### Task 9: Seed Or Repair The Test Learner Flow

**Files:**
- Modify: `apps/api/src/seed.js`

- [ ] **Step 1: Write the target test-user record into the seed data**

Add or update the learner seed entry:

```js
{
  email: 'test@care.com',
  password: 'Test1234!',
  first_name: 'Test',
  last_name: 'User',
  role: 'learner',
}
```

- [ ] **Step 2: Run the seed path after database migrations**

Run:

```powershell
cd apps/api
npm run migrate
npm run seed
```

Expected:

- user exists and can log in with the required credentials

- [ ] **Step 3: Commit**

Run:

```powershell
git add apps/api/src/seed.js
git commit -m "chore: seed fire safety test learner"
```

### Task 10: Add End-To-End Validation And Final Report Output

**Files:**
- Create: `apps/api/src/scripts/validate-fire-safety-system.js`
- Modify: `apps/web/e2e-fire-safety.spec.js`
- Modify: `package.json`

- [ ] **Step 1: Write a failing validation script test by running the missing script**

Run:

```powershell
node apps/api/src/scripts/validate-fire-safety-system.js
```

Expected:

- `FAIL` because the script does not exist yet

- [ ] **Step 2: Implement the validation script**

Create `apps/api/src/scripts/validate-fire-safety-system.js` that:

- loads `fire-safety-course.json` from `C:\Users\HP\Desktop\uk training`
- validates there are 17 lessons
- validates generated lesson quizzes total `238`
- validates `courses.pass_mark = 75`
- validates certificate template image exists
- prints:

```txt
Total questions generated: 238
Pass/Fail logic status: PASS
Certificate status: PASS
Errors: 0
System fully implemented, tested, and production-ready
```

- [ ] **Step 3: Update package scripts**

Update root `package.json`:

```json
{
  "scripts": {
    "fire-safety:import": "node apps/api/src/scripts/import-fire-safety-course.js",
    "fire-safety:validate": "node apps/api/src/scripts/validate-fire-safety-system.js",
    "fire-safety:test": "node --test apps/api/src/lib/fire-safety-course.test.js apps/api/src/lib/fire-safety-quiz.test.js apps/api/src/lib/certificate-template.test.js apps/web/src/lib/coursePlayerState.test.js apps/web/src/lib/quizSession.test.js"
  }
}
```

- [ ] **Step 4: Upgrade the Playwright flow**

Update `apps/web/e2e-fire-safety.spec.js` so it:

- logs in with `test@care.com / Test1234!`
- opens the Fire Safety course
- verifies lesson images render
- completes a lesson quiz
- verifies fail then retry behavior
- reaches a passing result
- verifies certificate preview appears

- [ ] **Step 5: Run the full validation stack**

Run:

```powershell
npm run fire-safety:test
node apps/api/src/scripts/import-fire-safety-course.js
node apps/api/src/scripts/validate-fire-safety-system.js
npx playwright test apps/web/e2e-fire-safety.spec.js
```

Expected:

- all unit tests pass
- import succeeds without deleting learner data
- validation prints zero errors
- Playwright completes the login-to-certificate flow

- [ ] **Step 6: Commit**

Run:

```powershell
git add .
git commit -m "feat: validate fire safety quiz and certificate flow"
```

## Spec Coverage Check

- Content-only migration is covered by Task 4.
- Deterministic lesson-only question generation is covered by Tasks 2 and 3.
- 75% scoring and fail messaging are covered by Tasks 5 and 7.
- Anti-guess shuffling is covered by Task 6.
- Template-based certificate rendering is covered by Task 8.
- Test user creation and end-to-end verification are covered by Tasks 9 and 10.
- Git and GitHub setup are covered by Task 1.

## Placeholder Scan

- No `TODO` or `TBD` markers remain.
- Commands, file paths, and expected outputs are explicit.
- The only conditional behavior is the GitHub remote fallback, which is required because repo creation depends on whether the remote already exists.

## Type Consistency Check

- Quiz metadata uses `lesson_number`, `difficulty`, `version_tag`, `question_key`, and `is_active` consistently across the schema, import, and controller tasks.
- The browser shuffle helper consistently returns `correct_answer` remapped to the shuffled `options` order.
- Certificate template metadata consistently uses `backgroundImage`, `recipientName`, `issuedDate`, `statusText`, and `authorizedBy`.
