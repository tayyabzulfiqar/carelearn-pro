# Layer 2B Extraction Engine Design

## Goal
Build a deterministic extraction engine that converts DOCX/PDF documents into normalized structure compatible with frozen Layer 2A contract.

## Frozen Constraints
- Do not modify Layer 1.
- Do not modify Layer 2A contract grammar.
- No AI inference.
- No rendering/preview/publish logic in this layer.

## Selected Decisions
- Extraction stack: `mammoth` (DOCX), `pdfjs-dist` (PDF).
- API-only extraction path first.
- DOCX content before first heading: hard fail.
- Duplicate image markers: hard fail globally.
- PDF headings: only explicit `## ` lines.
- Input: single document file + optional image manifest array.

## Pipeline
1. Extract format-specific ordered blocks.
2. Normalize into deterministic text representation.
3. Adapt through frozen Layer 2A contract validator to canonical JSON.

## Sublayer Plan
- 2B-1: DOCX heading extraction (Heading 1..6 + paragraph order, hard-fail ambiguities)
- 2B-2: image marker extraction
- 2B-3: normalized text generation
- 2B-4: strict PDF extraction
- 2B-5: contract adapter
- 2B-6: runtime validation
- 2B-7: freeze
