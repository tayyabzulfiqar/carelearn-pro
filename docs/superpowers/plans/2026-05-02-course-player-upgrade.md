# Course Player Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing course player route to render full lesson content, module navigation, inline checks, and progress from live API data.

**Architecture:** Extend the backend course-detail payload with assessment questions, then update the existing frontend player page and lesson renderer to normalize course data into a richer in-place learning experience. Keep enrollment, progress, quiz submission, and certificate behavior on the current route.

**Tech Stack:** Express, PostgreSQL, Next.js App Router, React, Axios

---

### Task 1: Extend Course Detail Payload

**Files:**
- Modify: `apps/api/src/controllers/courses.controller.js`

- [ ] Query final assessment questions in `getById`
- [ ] Attach questions to the returned `course` object
- [ ] Keep existing module and lesson response shape intact

### Task 2: Normalize Player Data

**Files:**
- Modify: `apps/web/src/app/dashboard/courses/[courseId]/player/page.js`

- [ ] Parse course modules, lessons, content, and question data from `GET /courses/{id}`
- [ ] Track completed lesson ids from enrollment progress
- [ ] Pass module, lesson, and progress state into the lesson renderer
- [ ] Preserve quiz and certificate phases

### Task 3: Upgrade Lesson Rendering

**Files:**
- Modify: `apps/web/src/components/player/SlideView.js`

- [ ] Replace slide-only layout with module and lesson navigation plus lesson-detail pane
- [ ] Render text, image, image-grid, key-points, and quiz-style blocks
- [ ] Support previous and next lesson navigation
- [ ] Show module and overall progress using completed lesson state
- [ ] Resolve `/uploads/...` and absolute image URLs safely

### Task 4: Verify Existing Flow

**Files:**
- Verify only: `apps/web/src/app/dashboard/courses/page.js`

- [ ] Confirm course list route still pushes to `/dashboard/courses/{id}/player`
- [ ] Run the frontend build or targeted verification command
- [ ] Check the live UI flow for course list, player, images, and quiz visibility
