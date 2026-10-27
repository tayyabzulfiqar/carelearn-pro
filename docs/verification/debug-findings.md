# Application Layer Debug Findings

## Problem 1: Import Panel

**Current rendering condition:**
```js
// studio/page.js:57
const [importPanelOpen, setImportPanelOpen] = useState(false);

// studio/page.js:926-1059 — entire Import Panel section is inside activeLesson gate:
{!activeLesson ? (
  <div>...Select a lesson to edit...</div>
) : (
  <div className="p-5 space-y-5">
    ...
    {/* 3-File Import Panel — lines 966-984 */}
    <div className="rounded-2xl border border-indigo-200 bg-white overflow-hidden">
      <button onClick={() => setImportPanelOpen(prev => !prev)}>
        3-File Import {importPanelOpen ? '▲' : '▼'}
      </button>
      {importPanelOpen && (
        <div className="p-4">
          <ImportPanel courseId={courseId} orgId={null} ... />
        </div>
      )}
    </div>
    ...
  </div>
)}
```

**Location:** apps/web/src/app/admin/trainings/[id]/studio/page.js:57 and :926-984

**Suspected issue (TWO combined failures):**

- **CASE A** (primary): The entire Import Panel block lives inside the `!activeLesson` conditional.
  On page load `activeLesson` is `null` — there is no auto-select of lessons in `loadAll()`.
  The panel is therefore **never shown** until the user manually clicks a lesson in the sidebar.
  Since the Import Panel uses only `courseId` (not `lessonId`), it should not be gated on lesson selection at all.

- **CASE B** (secondary): Even when a lesson IS selected, `importPanelOpen` defaults to `false`,
  so the panel is collapsed. Playwright text-selectors cannot find it in a collapsed state.

- **No data-testid** on the toggle button or on ImportPanel's root element — Playwright has no stable anchor.

---

## Problem 2: Learner Player

**Navigation trigger:**
- `dashboard/page.js:105` — `<Link href={\`/dashboard/courses/${item.course_id}/player\`}>` (enrollments list)
- `dashboard/page.js:147` — `<Link href={\`/dashboard/courses/${item.id}/player\`}>` (available courses list)
- `courses/page.js:153` — `router.push(\`/dashboard/courses/${course.id}/player\`)`

Next.js `<Link>` auto-prefetches on hover/viewport. When the dashboard page loads and these links
are visible, Next.js fires RSC prefetch requests for the player route. If the user navigates
away before the prefetch completes, the request is aborted → ERR_ABORTED on ?_rsc=.

**First fetch on mount:** `api.get(\`/courses/${courseId}\`)` in init() at player/page.js:69 (inside useEffect)

**Enrollment check location:** client-side in init(), player/page.js:103-114.
Auto-enrolls if no existing enrollment. No server-side guard.

**Suspected abort cause (CASE D partial):**
The `<Link>` components in dashboard/page.js:147 link ALL available courses (not just enrolled ones)
directly to the player. When a learner hovers over any course card, Next.js prefetches the RSC layout
for that player route. Simultaneous multiple prefetches, combined with a quick page interaction, causes
some to be aborted.

Additionally at player/page.js:90:
```js
for (const courseModule of courseData.modules || []) {
```
If `courseData` is null (API format mismatch), this throws: `TypeError: Cannot read properties of null`.
The catch block handles it, but not before triggering an unhandled state in the RSC layer on first render.

**Fix needed:**
1. Add null-guard for `courseData` before the modules loop
2. Add `data-testid` to stable elements so Playwright can verify without depending on RSC abort absence

---

## Problem 3: Playwright

**Specific brittleness found:**
- Import Panel tested only via text search (`body.includes('Import')`) — fails if panel is collapsed (CASE B)
- No `data-testid` on ImportPanel root element or toggle button
- No `data-testid` on player page content areas
- Test relied on hardcoded `waitForTimeout` instead of `waitForSelector`

**Missing data-testid attributes:**
- `[data-testid="import-panel-toggle"]` — the accordion toggle button in studio/page.js
- `[data-testid="import-panel"]` — ImportPanel.js root div
- `[data-testid="lesson-content"]` — player page main content wrapper
- `[data-testid="lesson-title"]` — lesson title heading in SlideView
