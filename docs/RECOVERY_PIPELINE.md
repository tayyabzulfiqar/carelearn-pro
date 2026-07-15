# Recovery Package → CareLearn Pro Implementation Pipeline

How a Recovery package is converted, validated, published and verified
as an **isolated test course**, using the platform's existing Schema Version 3
architecture. No architecture changes were required to support this.

Reference build: **Basic Life Support — Recovery Test**.

---

## 1. Pipeline components

| Stage | File | Reusable for any Recovery course? |
|---|---|---|
| Converter (package → Schema v3) | [`apps/api/src/lib/recovery-package-converter.js`](../apps/api/src/lib/recovery-package-converter.js) | Yes — course-agnostic |
| Converter tests | [`apps/api/src/lib/recovery-package-converter.test.js`](../apps/api/src/lib/recovery-package-converter.test.js) | Yes |
| Build + validate + publish | [`apps/api/src/lib/recovery-course-publisher.js`](../apps/api/src/lib/recovery-course-publisher.js) | Yes — course-agnostic |
| BLS course definition (entry point) | [`apps/api/src/scripts/publish-recovery-course.js`](../apps/api/src/scripts/publish-recovery-course.js) | Per-course config; copy for another course |
| Browser verification + screenshots | [`scripts/production/verify-recovery-course.js`](../scripts/production/verify-recovery-course.js) | Yes — driven by `COURSE_ID` |

```bash
npm run recovery:test      # converter unit tests
npm run recovery:publish -- --dry-run   # convert + validate, no DB write
npm run recovery:publish   # publish the isolated test course
npm run recovery:verify    # browser verification + screenshots
```

Nothing here is a new importer, renderer, or schema. The converter delegates all
normalization to `normalizeLessonDocument` and all publish gating to
`validatePublishableLessons` — the platform's own code.

---

## 2. Block type mapping

The Recovery package states its own `block_type` names are **descriptive, not
confirmed** against the real CMS, and instructs engineering to map each to the
nearest real equivalent. That mapping lives in `RECOVERY_BLOCK_TYPE_MAP`:

| Package `block_type` | Schema v3 type | Notes |
|---|---|---|
| `objectives_card` | `objective_list` | |
| `prose_block` | `rich_text` | |
| `bulleted_list` | `bullet_list` | |
| `numbered_steps` | `step_list` | Per-step `title` joined into step text (`"Title: text"`), matching `bls-course-publisher`'s convention, so no title is dropped |
| `information_box` | `key_information` | Nearest "info panel"/"note" component |
| `warning_box` | `warning_box` | Exact equivalent already exists |
| `best_practice_box` | `best_practice` | Nearest "recommended practice" component |
| `reflection_prompt` | `reflection_prompts` | Read-only; `input_capture:false` enforced |
| `quick_check` | `quiz_point` | `{text,correct}` options → option array + correct index |
| `comparison_table` | `bullet_list` | See below |

### Why `comparison_table` is not `reference_table`

`reference_table` looks like a table but is a **citations list**: its payload is
`{text, citations:[{label, href}]}`, and `validateLessonDocument` requires every
citation to carry a valid `href`. The DNACPR comparison rows have no URLs, so
they would fail validation. The package's own documented fallback therefore
applies: *"render as an ordered bulleted_list, one item per row, preserving all
three columns' text per item."* Each row becomes
`Plan: DNACPR | What it covers: … | Legal status: …`.

### Per-instance headings

The package requires `heading` to be per-instance and "never a hardcoded
default". No Schema v3 box component renders a per-instance heading — several
print a fixed label instead (`Best Practice`, `Quick Check`, `Reflection`,
`Learning Objectives`). So the converter emits a **separate `heading` block
(level 3) before the mapped block**, preserving the authored heading using only
existing block types.

A heading that merely restates the component's own fixed label (e.g. `Reflect`
before a `reflection_prompts` block) is dropped instead, to avoid rendering the
label twice. See `REDUNDANT_HEADINGS`.

---

## 3. Safety properties

The converter fails loudly rather than degrading content:

- **Unmapped `block_type` throws.** Without this, `normalizeBlock` silently
  coerces unknown types to `rich_text`, quietly destroying authored structure.
- **1:1 block count is asserted** (source blocks → mapped blocks), per
  `Preview_Build_And_Verification_Plan.md` §3.
- **`input_capture: true` on a reflection throws** — these must never reach the
  graded/persisted reflection mechanism.
- **Unauthorised `media[]` throws** — this batch requires no new images.
- **A `quick_check` with no correct option throws.**
- **Publishing is validator-gated**: `buildRecoveryCoursePayload` refuses to
  return a payload that `validatePublishableLessons` rejects.

Production isolation:

- `PROTECTED_COURSE_IDS` refuses to publish over the production BLS course id.
- `publishRecoveryCourse` refuses if the target id exists under a different slug.
- All deletes are scoped to the recovery course's own id, so re-publishing is
  idempotent and never touches another course's lessons, progress, or
  certificates.

---

## 4. The Basic Life Support — Recovery Test course

- Course id `c4f1a2d8-6b3e-4c9a-9f27-1d5e8a0b7c31` (fixed, so re-runs are idempotent)
- Slug `basic-life-support-recovery-test`
- Test learner `recovery.learner@carelearn.local`
- 15 lessons: lessons 1–11 carried over from the existing BLS data files under
  new ids, then the 4 authored recovery lessons — matching
  `Preview_Build_And_Verification_Plan.md` §2.

### Superseded stub lessons

`apps/web/src/data/bls/lesson_15..18.json` are thin 3–5 block **placeholders**
for exactly the four lessons the package authored (DEV-008/009/010/012). They
are excluded from carry-over via `SUPERSEDED_LESSON_FILES`; the package's
versions (10/11/13/5 blocks) take their place. Carrying them over as well would
publish each of those lessons twice.

---

## 5. Verifying another Recovery course

1. Copy `publish-recovery-course.js`, and set a new `RECOVERY_COURSE_ID`, title,
   slug, and `structuresPath` (or set `RECOVERY_STRUCTURES_PATH`).
2. Set `baseLessons` to whatever existing lessons that course carries over
   (`[]` if none), and exclude any stubs the package supersedes.
3. `npm run recovery:publish -- --dry-run`, then publish.
4. `COURSE_ID=<new-id> npm run recovery:verify`.

The converter, validator, publisher and verifier need no changes.
