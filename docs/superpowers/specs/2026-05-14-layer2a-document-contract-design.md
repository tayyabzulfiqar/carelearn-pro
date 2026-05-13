# Layer 2A Document Contract Design

## Goal
Define and enforce a deterministic ingestion contract for healthcare training content before parser/render expansion.

## Scope
This layer implements only contract definition and API-side enforcement. It does not implement DOCX/PDF extraction, visual preview rendering, or publish workflows.

## Deterministic Rules
1. Allowed image markers:
- `[IMAGE_n]`
- `[IMAGE_n_LEFT]`
- `[IMAGE_n_RIGHT]`
- `[IMAGE_n_CENTER]`
2. `n` must be a positive integer.
3. Heading fallback syntax for normalized text is explicit `## ` at line start.
4. Unknown marker syntax is rejected.
5. Empty sections are rejected.
6. Image mapping is strict by base key:
- `IMAGE_1` marker requires `IMAGE_1.<ext>` in image manifest.
7. Accepted image extensions: `.jpg`, `.jpeg`, `.png`, `.webp`.
8. No AI inference, no auto-generated headings, no semantic guessing.

## Canonical JSON Shape (Layer 2A)
```json
{
  "title": "Fire Safety Awareness",
  "sections": [
    {
      "heading": "Introduction",
      "blocks": [
        { "type": "paragraph", "text": "Intro paragraph..." },
        { "type": "image_marker", "key": "IMAGE_1", "align": "right" }
      ]
    }
  ]
}
```

## API Enforcement
- Endpoint validates normalized source text and image filename manifest.
- Endpoint returns:
- `passed` boolean
- canonical JSON on success
- structured error list on failure
- Validation result is persisted into organisation settings for reload/persistence checks.

## Non-Goals
- DOCX parser implementation
- PDF parser implementation
- frontend contract validation
- publish/visibility transitions

## Freeze Gate
Layer 2A is considered frozen only when:
1. Contract unit tests pass.
2. Marker and section edge cases are covered.
3. API-side validation endpoint enforces rules.
4. Validation payload persistence survives read-after-write.
