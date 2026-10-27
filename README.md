# CareLearn Pro

A training platform for UK care homes. Staff take mandatory courses, pass scored assessments and get certificates. Admins import course material from PDF and Word files and publish it as structured lessons.

Built under contract for Flexible Healthcare One Solutions Ltd (UK). Delivered with 70+ care-sector courses loaded, ahead of the client's own launch, so there is no public demo link. Screenshots are below.

I built it with AI coding agents (Claude Code, Codex): I planned the work, reviewed and tested what the agents wrote, deployed it and fixed production issues.

## What it does

- **Learners:** course catalogue, lesson player, quizzes, final assessment with a pass mark, certificates.
- **Admins:** course studio, media library, PDF and Word import, publish and archive.
- **Import pipeline:** PDF/DOCX extraction, then normalisation into lessons, then integrity checks that block broken or incomplete content before it is published.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 14, React 18 |
| API | Node.js, Express REST API (`/api/v1`) |
| Database | PostgreSQL |
| Deployment | Docker Compose, Nginx, Linux VPS |
| Testing | Node test runner (unit), Playwright (end-to-end) |

## Repository layout

```
apps/api      Express REST API, import pipeline, assessment and certificate logic
apps/web      Next.js learner and admin app
packages/     shared code
docker/       Dockerfiles and Nginx config
deploy/       Postgres and deployment scripts
```

## Run locally

```bash
npm install
cp .env.production.example .env   # fill in your own values
npm run dev
```

Tests: `cd apps/api && npm test`

## Screenshots

<!-- add 3 screenshots: learner dashboard, lesson player, admin studio -->
