-- Migration: 20260520_add_structured_lesson_flag.sql
-- Adds is_structured_import flag to lessons table.
-- Default false: all existing lessons remain in legacy/manual mode.
-- Only lessons created by courseAssembler are set to true.

BEGIN;

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS is_structured_import BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lessons_structured_import
  ON lessons(is_structured_import)
  WHERE is_structured_import = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'is_structured_import'
  ) THEN
    RAISE EXCEPTION 'Column is_structured_import was not created';
  END IF;
  RAISE NOTICE 'is_structured_import column verified present';
END $$;

COMMIT;
