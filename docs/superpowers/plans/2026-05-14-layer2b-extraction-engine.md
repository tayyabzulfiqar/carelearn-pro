# Layer 2B Extraction Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic DOCX/PDF extraction pipeline that feeds frozen Layer 2A contract.

**Architecture:** Add format-specific extractor libs under `apps/api/src/lib`, then normalize and validate via existing Layer 2A contract validator. Keep strict failures for ambiguity.

**Tech Stack:** Node.js, Express, PostgreSQL, mammoth, pdfjs-dist, Node test runner.

---

### Task 1: 2B-1 DOCX Heading Extraction

**Files:**
- Create: `apps/api/src/lib/docx-structure-extractor.js`
- Create: `apps/api/src/lib/docx-structure-extractor.test.js`
- Modify: `apps/api/package.json`

- [ ] Add failing tests for heading order, mixed content ordering, malformed DOCX, and missing-heading hard-fail.
- [ ] Implement deterministic DOCX extractor using `mammoth`.
- [ ] Run tests and freeze 2B-1.

### Task 2: 2B-2 Marker Extraction
Pending after 2B-1 freeze.

### Task 3: 2B-3 Normalized Text Generation
Pending after 2B-2 freeze.

### Task 4: 2B-4 Strict PDF Extraction
Pending after 2B-3 freeze.

### Task 5: 2B-5 Contract Adapter
Pending after 2B-4 freeze.

### Task 6: 2B-6 Runtime Validation
Pending after adapter freeze.

### Task 7: 2B-7 Freeze
Pending all prior tasks complete.
