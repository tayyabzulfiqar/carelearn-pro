# Layer 2A Document Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic API-side contract validation for structured training ingestion with strict marker rules and canonical section/block JSON output.

**Architecture:** Introduce a dedicated contract parser/validator library (`apps/api/src/lib`) and a narrow CMS endpoint for validation and persistence. Keep parsing deterministic with explicit grammar and no inference.

**Tech Stack:** Node.js, Express, PostgreSQL JSONB persistence, Node test runner (`node --test`).

---

### Task 1: Build deterministic contract parser/validator library

**Files:**
- Create: `apps/api/src/lib/training-ingestion-contract.js`
- Test: `apps/api/src/lib/training-ingestion-contract.test.js`

- [ ] Step 1: Add failing tests for marker grammar, section parsing, and image manifest mapping.
- [ ] Step 2: Run tests and confirm fail.
- [ ] Step 3: Implement parser/validator and canonical JSON builder.
- [ ] Step 4: Run tests and confirm pass.

### Task 2: Add CMS API validation endpoint

**Files:**
- Modify: `apps/api/src/controllers/cms/trainingCms.controller.js`
- Modify: `apps/api/src/routes/cms/trainingCms.routes.js`

- [ ] Step 1: Add endpoint tests via unit-level invocation constraints (indirect through parser tests and runtime script checks).
- [ ] Step 2: Implement endpoint that validates payload and persists result in `organisation_settings`.
- [ ] Step 3: Return deterministic success/failure structure.

### Task 3: Wire tests into API test command and validate runtime behavior

**Files:**
- Modify: `apps/api/package.json`

- [ ] Step 1: Include new test file in `npm test`.
- [ ] Step 2: Run full `npm test --workspace @carelearn/api`.
- [ ] Step 3: Run `npm run verify:workflow --workspace @carelearn/api` with local server for runtime check.

### Task 4: Freeze Layer 2A

**Files:**
- Create: `docs/superpowers/specs/2026-05-14-layer2a-document-contract-design.md`
- Create: `docs/superpowers/plans/2026-05-14-layer2a-document-contract.md`

- [ ] Step 1: Confirm design and implementation scope match Layer 2A only.
- [ ] Step 2: Commit Layer 2A changes with focused message.
