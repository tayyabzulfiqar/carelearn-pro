# Fire Safety Quiz Engine and Certificate Design

## Goal

Upgrade the existing Fire Safety course so that it uses a deterministic, production-ready quiz engine and certificate flow driven by the local content pack in `C:\Users\HP\Desktop\uk training`.

This work must:

- preserve all learner data, including enrollments, progress, quiz attempts, and certificates
- replace or refresh only course content, lesson payloads, questions, and related course assets
- use `fire-safety-course.json` as the single source of truth for lesson-derived quiz generation
- use only images that physically exist in the content root folder
- reject missing, fallback, or placeholder content before publication

## Scope

### In scope

- strict import and validation of the Fire Safety course JSON and root-folder PNG assets
- replacement of Fire Safety lesson/module content without deleting learner-linked records
- deterministic generation of exactly 14 quiz questions for each of 17 lessons
- deterministic generation of a final exam derived from lesson content banks
- anti-guess shuffling for question order and answer option order per attempt/session
- scoring and gating logic at a `75%` pass mark
- forced re-attempt flow on fail with the exact required message
- certificate preview and downloadable output based on `certificate_fire_safety.png`
- end-to-end validation of login, course playthrough, quiz behavior, score handling, and certificate trigger

### Out of scope

- changes to unrelated courses
- learner data resets
- placeholder graphics or generated substitute images
- AI runtime question generation in the browser
- one-off static DB seeding of hard-coded quiz banks

## Existing system summary

The current system already has:

- a Fire Safety JSON import path in the API
- lesson rendering in the course player
- a generic assessment question table and submission endpoint
- certificate issuance stored in the database
- a certificate UI that currently renders as a styled card rather than from the required image template

The current gaps are:

- pass logic is still based on `80%` in several places
- quiz behavior is final-assessment oriented, not lesson-by-lesson with strict 14-question generation
- anti-guess shuffling is not enforced as a first-class rule
- certificate rendering does not yet use `certificate_fire_safety.png`
- content import currently clears learner-linked records for the Fire Safety course, which must stop

## Source-of-truth content model

The content pack at `C:\Users\HP\Desktop\uk training` contains:

- `fire-safety-course.json`
- `certificate_fire_safety.png`
- lesson slide PNG files referenced by the JSON

Rules:

- `fire-safety-course.json` must have `schema_version: 2`
- the JSON must contain exactly 17 lessons
- every lesson section image must reference a file that exists in the content root
- all image resolution and placement validations currently enforced by the Fire Safety import pipeline remain active
- no image may be loaded from a fallback location
- no placeholder question, image, or certificate content is allowed

## Architecture

### 1. Content-only migration

The Fire Safety import script will be changed from destructive course reset behavior to content-only replacement:

- keep the same course record
- keep all enrollments
- keep all progress rows
- keep all assessment attempts
- keep all certificates
- replace the Fire Safety module and lesson content in place or through a controlled content refresh
- replace Fire Safety assessment-question content while preserving historical attempt records

To avoid breaking historical attempt references, question replacement must not orphan prior attempts unexpectedly. The migration layer should either:

- soft-retire old Fire Safety assessment questions and create a new active version set for runtime use, or
- replace only questions that are not referenced by learner history

The preferred implementation is an active-version strategy for Fire Safety assessment content so historical attempts remain interpretable.

### 2. Deterministic quiz generation engine

Question generation must happen server-side from lesson content, not in the client and not as a hand-written static bank.

Generation approach:

- parse the structured lesson JSON into normalized content units
- derive quiz prompts from section headings, paragraphs, and bullet points only
- create a reproducible question set using deterministic rules and seeded ordering
- persist generated questions as active Fire Safety quiz content so runtime delivery is stable and auditable

Deterministic means:

- the same course content version produces the same canonical question bank
- runtime attempts may shuffle presentation, but underlying correct answers and question identity remain stable

### 3. Lesson quiz composition

Each of the 17 lessons must have exactly 14 questions.

Per-lesson rules:

- question types include:
  - single-correct MCQ
  - scenario-based question
  - true/false
- difficulty split per lesson:
  - 4 easy
  - 7 medium
  - 3 hard
- questions must be based only on the current lesson content
- no generic compliance filler
- no cross-lesson content leakage into lesson quizzes

Generation strategy:

- easy questions check direct operational understanding
- medium questions require application of specific lesson details
- hard questions use realistic care-home scenarios or edge-case judgment grounded in that lesson

### 4. Final exam composition

The system will use a combined final exam.

Rationale:

- certificate issuance already aligns naturally to a final pass event
- the course player already has a final assessment flow
- this avoids issuing a certificate simply because each lesson was passed independently without a final consolidated check

Final exam rules:

- built from the generated lesson banks, not from ad hoc client logic
- uses a balanced spread across all 17 lessons
- avoids duplicate prompts from lesson quizzes when possible
- still follows anti-guess shuffle rules at runtime

### 5. Anti-guess runtime behavior

Each attempt must randomize:

- question order
- option order within each question

Controls:

- option shuffle must remap the correct answer index safely
- the presented answer positions must not cluster into a predictable pattern
- the runtime payload should be generated per session or attempt, not globally cached in a single order

Canonical storage should remain stable, while the delivery layer applies deterministic-per-attempt shuffling using an attempt seed.

### 6. Scoring and gating

Rules:

- each lesson quiz contains 14 questions
- pass mark is `75`
- scores are integer percentages using the submitted answer count against total available questions

Fail behavior:

- show exactly: `You must achieve at least 75% to pass.`
- reset the active quiz state
- prevent bypass to later content or certificate flow
- require a fresh attempt

Pass behavior:

- allow progression for lesson quizzes
- if the final exam is passed, trigger certificate issuance

### 7. Certificate system

Certificate rendering must use `certificate_fire_safety.png` as the actual template background.

Overlay content:

- learner name from user data
- auto-generated issue date
- status text: `PASS`

Placement rules:

- name centered in the designated main name area
- date placed near the bottom
- signature area unchanged

Outputs:

- in-app preview
- downloadable certificate file

The certificate issuance database flow remains authoritative for whether a learner has passed. The template renderer is a presentation/output layer on top of that issued certificate record.

### 8. UI behavior

Quiz UX requirements:

- clean card layout
- no overflow
- one question at a time or paginated flow
- stable mobile and desktop rendering

Recommended UI flow:

- one question at a time for maximum clarity and reduced cognitive load
- visible progress indicator
- option confirmation before advancing
- explicit retry path on failure

### 9. Validation pipeline

Validation must block publication if any check fails.

Required checks:

- exactly 17 lessons exist
- every lesson has a valid structured section payload
- every lesson has exactly 14 generated quiz questions
- every lesson meets the type and difficulty distribution rules
- all referenced images exist in `C:\Users\HP\Desktop\uk training`
- no image source falls back outside the root folder
- pass/fail logic uses `75%`
- fail message matches the required text exactly
- final pass triggers certificate issuance
- certificate preview uses `certificate_fire_safety.png`

### 10. End-to-end test flow

The automated validation should simulate:

`Login -> Course -> Lessons -> Quiz -> Score -> Certificate`

Test user:

- email: `test@care.com`
- password: `Test1234!`

The E2E run should verify:

- login succeeds
- Fire Safety course loads
- all 17 lessons are reachable
- quiz generation is present and complete
- fail state blocks progression correctly
- pass state advances correctly
- final pass triggers certificate issuance
- certificate preview and download action render from the correct template

## Data and migration notes

Because learner history must remain intact, the migration must not:

- delete enrollments
- delete progress
- delete attempts
- delete certificates

For questions, the implementation should support active Fire Safety quiz content versioning. Historical attempts should remain associated with the question IDs they were taken against. New runtime delivery should select the active generated version set.

If the current schema cannot support active/inactive versioning cleanly, the implementation may extend the Fire Safety question model or introduce an equivalent version marker limited to runtime query behavior.

## Testing strategy

### Unit tests

- quiz generation produces 14 questions per lesson
- difficulty split is 4/7/3
- question-type mix includes MCQ, scenario, and true/false
- answer shuffling preserves correctness
- score calculation passes at `>= 75` and fails below `75`
- fail reset logic returns quiz state to a fresh attempt
- certificate template renderer uses the required base image

### Integration tests

- import/validation passes only when all 17 lessons and images are valid
- active Fire Safety quiz content is regenerated from the latest JSON
- old learner data survives the content refresh
- final pass issues or returns a certificate correctly

### End-to-end tests

- login with `test@care.com`
- launch Fire Safety course
- complete lesson flow
- submit quiz attempts
- verify fail gate
- verify pass gate
- verify certificate preview and downloadable output

## Risks and controls

### Risk: breaking historical attempts

Control:

- do not delete learner-linked rows
- preserve or version question content used by prior attempts

### Risk: invalid or generic questions

Control:

- deterministic server-side generation from lesson sections only
- validation rules for question count, type mix, and lesson-only sourcing

### Risk: answer key corruption after option shuffle

Control:

- shuffle with explicit answer remapping and test coverage

### Risk: certificate view looks correct but is not based on the real template

Control:

- renderer must consume `certificate_fire_safety.png` directly
- tests should assert the template path or template metadata in use

## Success criteria

The work is complete when:

- all 17 Fire Safety lessons load from the latest JSON
- all root-folder images validate and render without fallback
- exactly 238 lesson-quiz questions exist across 17 lessons
- a final exam is generated from lesson-derived content
- pass/fail logic is enforced at `75%`
- fail attempts show the required message and force re-attempt
- final pass triggers certificate issuance
- the certificate preview/download uses `certificate_fire_safety.png`
- the end-to-end flow passes for the provided test user
- final validation reports zero errors

## Final report format

The implementation must output a report including:

- total questions generated
- pass/fail logic status
- certificate trigger status
- any errors

The target final line is:

`System fully working and validated`
