# Course Player Design

Approved scope for upgrading the existing route `apps/web/src/app/dashboard/courses/[courseId]/player/page.js`.

## Goal

Render the full course experience from API data on the existing player route without changing `/dashboard/courses`.

## Design

- Keep `/dashboard/courses/[courseId]/player` as the single course-player route.
- Use `GET /api/v1/courses/{id}` as the primary source for course title, modules, lessons, lesson content, and uploaded image URLs.
- Extend the course-detail response to include final assessment questions so the player can complete the lesson flow and final quiz from course API data.
- Normalize lessons client-side into module metadata, ordered lesson list, parsed content blocks, and image URLs under `/uploads/course-{courseId}/images/`.
- Replace the old slide-style player UI with a module and lesson rail, a dynamic lesson-content pane, inline micro-check rendering, and previous and next lesson navigation.
- Preserve enrollment creation, lesson-progress updates, quiz submission, and certificate flow already used by the player page.

## Guardrails

- Do not create a new route.
- Do not break `/dashboard/courses`.
- Do not change the course list navigation target.
- Keep image rendering tolerant of either absolute URLs or `/uploads/...` style paths.
