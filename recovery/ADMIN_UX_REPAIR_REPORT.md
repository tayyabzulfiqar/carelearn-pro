# CareLearn Pro — Admin UX Repair Report

**Date:** 2026-05-18T16:30:00Z  
**Executed against:** http://187.127.105.253  
**Deployed commit:** `2477ec4`  
**Branch:** main  
**Final score:** 19/19 (100%)

---

## Root Cause Summary

The Training Catalogue page (`/admin/trainings`) had a fully functional "Open Studio" button in every table row's Actions column, but the button was **visually hidden** by `overflow-hidden` on the `AdminTable` wrapper component. The table's title column expanded to consume most of the available width (due to long description text), pushing the Actions column beyond the visible viewport. With `overflow-hidden` instead of `overflow-x-auto`, the column was clipped rather than scrollable — meaning the buttons existed in the DOM (Playwright could find and click them) but a real non-technical admin could not see or interact with them. The admin had no discoverable path to the Studio without already knowing the direct URL.

---

## Phase 1 Audit Findings

### Screenshots taken
| File | Contents |
|------|----------|
| `audit_01_trainings_list.png` | Training list — rows visible, action buttons cut off to the right |
| `audit_02_single_training_row_hover.png` | Row hovered — no visible action revealed on hover |
| `audit_03_trainings_row_click.png` | Studio opened via click — Studio works when reached |
| `audit_04_studio_direct_url.png` | Studio direct URL — works perfectly |
| `audit_05_media_library.png` | Media Library at /admin/media — loads, shows file list |
| `audit_06_dashboard.png` | Admin dashboard — healthy, shows stats |

### Source code answers (trainings/page.js)

| Question | Answer | Evidence |
|----------|--------|---------|
| Q1: Rows clickable? | Rows static, button in Actions column | `AdminTable` renders `<tr>` with no click handler |
| Q2: href/onClick on row? | `href` on "Open Studio" button only | Line 408: `<a href={'/admin/trainings/${row.id}/studio'}` |
| Q3: URL target? | `/admin/trainings/${row.id}/studio` | Line 408 |
| Q4: "Open Studio" button? | YES — in Actions column | Line 408 |
| Q5: Actions dropdown? | YES | Lines 409–432 |
| Q6: Dropdown contents? | Edit, Publish/Unpublish, Preview, Learner View, Duplicate, Archive, Delete | Lines 420–430 |
| Q7: Create button? | YES — "Quick Create" | Line 367 |
| Q8: API endpoint? | `cmsGet('/trainings')` → GET /api/v1/admin/cms/trainings | Line 61 |
| Q9: Loading/error states? | YES — AdminLoadingState, AdminErrorState | Lines 327–328 |

---

## Phase 2 Gap Type Identified

**Gap Type C** — Studio route exists and is reachable by direct URL but navigation does not expose it.

Additionally:
- **Gap Type F** (partial) — Not a stale build, but `overflow-hidden` caused effective visual suppression equivalent to actions being unreachable

**Evidence:** Playwright found 8 "Open Studio" DOM elements and could click them programmatically, but the training catalogue screenshot showed only title+description columns — the actions column was scrolled off-screen with no scroll mechanism available to the user.

---

## Fixes Applied

| File | Change | Lines Modified |
|------|--------|----------------|
| `apps/web/src/components/admin/AdminTable.js` | `overflow-hidden` → `overflow-x-auto` — allows horizontal scroll to reveal Actions column | Line 3 |
| `apps/web/src/app/admin/trainings/page.js` | Added "✏ Open Studio" link inside title cell — always visible without any scrolling | Lines 371–396 (new render function) |
| `apps/web/src/app/admin/trainings/page.js` | Description sanitization: strip markdown chars (`**`, `#`, `_`, `` ` ``) and truncate to 80 chars | Lines 372–374 |
| `apps/web/src/app/admin/trainings/page.js` | `submit()`: after new training creation, navigate to `/admin/trainings/[newId]/studio` | Lines 165–173 |
| `apps/web/src/app/admin/trainings/page.js` | "Quick Create" renamed "+ New Training" with `btn-primary` styling | Line 367 |
| `apps/web/src/app/admin/trainings/page.js` | Modal title for new training: "opens Studio after save" to set expectation | Line 462 |

---

## Visual Verification Results

| Screenshot | What It Shows | Pass/Fail |
|------------|---------------|-----------|
| `final_01_after_login.png` | Admin dashboard after login | PASS |
| `final_02_training_catalogue.png` | All 8 rows with "✏ Open Studio" in title cell + "+ New Training" button | PASS |
| `final_03_studio_opened_from_btn.png` | Studio loaded after clicking title-cell Open Studio link | PASS |
| `final_04_studio_direct.png` | Studio loaded via direct URL navigation | PASS |
| `final_05_studio_components.png` | Studio: Structure panel + Publish + Learner Preview + Save + ← Trainings | PASS |
| `final_06_lesson_opened.png` | Lesson editor active, Upload Media visible, Media Gallery showing PDFs | PASS |
| `final_07_back_to_list.png` | Back to Training Catalogue after ← Trainings click | PASS |

---

## Admin Flow Score

```
SCORE: 19/19 (100%)
Console errors: 0
Network failures: 0
```

---

## Complete Flow Walkthrough (for the owner)

**Step 1:** Go to `http://187.127.105.253/admin/trainings`  
You see the Training Catalogue with all your courses in a table. Each row shows the course title, a clean description preview, and its status (published/draft).

**Step 2:** Click the blue "**Open Studio**" link under any course title, or click the blue "Open Studio" button in the Actions column on the right.  
The Studio opens for that course showing the three-panel layout: modules/lessons on the left, lesson editor in the centre, course settings on the right.

**Step 3:** In the Studio left panel, click any lesson to open it in the centre editor.  
You see the lesson title, Upload Media drop zone, Media Gallery (with previously uploaded files), and the block content editor below.

**Step 4:** Drag files into the Upload Media drop zone, or click to choose files (PDFs, images, videos).  
Files upload automatically. Uploaded PDFs appear in the Media Gallery with "Insert into Lesson" buttons.

**Step 5:** Click "Insert into Lesson" on any gallery file, or add text/heading/callout blocks using the block toolbar.  
Blocks are saved automatically (autosave fires 800ms after any change). Status shows "All changes saved" or "Saved just now".

**Step 6:** Click "Learner Preview" in the right panel to see the course as a learner would see it.  
A new tab opens showing the lesson content including rendered PDFs, text blocks, and callouts.

**Step 7:** Click "Publish" (top right of Studio) to make the course available to learners.  
The status badge changes from DRAFT to PUBLISHED. The course immediately appears in the learner catalog.

**Step 8:** To create a new course, go to Training Catalogue and click "+ New Training" (top right, blue button).  
Fill in the title and details, click Save — you're immediately taken to the Studio for the new course.

---

## Remaining Known Issues

| Issue | Severity | Note |
|-------|----------|------|
| Ingestion Diagnostics section at top of catalogue always shows zeros | LOW | Only relevant if using the CMS document-ingestion pipeline; harmless for Studio flow |
| "tayyab demo training" course has test course names with timestamps | COSMETIC | These are test courses created during development; can be archived via Actions → Archive |
| Media Library at `/admin/media` shows raw file paths (storage URLs) | LOW | Functional but technical UI; suitable for super_admin use; not shown to learners |
| No SSL/HTTPS on VPS | MEDIUM | Running on HTTP — should add SSL before public launch (certbot container already configured) |

---

## Next Recommended Actions

1. **Rename/Archive test courses** — The catalogue has 8 courses with timestamp-based names (PW-AUDIT-*, 12STEP-FIRE-SAFETY-*). Archive or delete these and create a real "Fire Safety Awareness" course with proper title and description. Use the "+ New Training" → Studio flow.

2. **Add real course content** — In the Studio, open the real training, add 2-3 modules with lessons, upload the fire safety PDF from your files, verify it renders in Learner Preview, then Publish.

3. **Enable SSL** — The certbot container is already running. Point a domain at `187.127.105.253` and run the certbot certificate issue command to enable HTTPS before sharing with learners.

---

*Report generated: 2026-05-18T16:30:00Z*  
*Executed by: Claude Code (claude-sonnet-4-6)*  
*VPS: 187.127.105.253 — Project: CareLearn Pro*
