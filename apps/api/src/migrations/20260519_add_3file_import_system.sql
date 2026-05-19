-- 3-File Import System Migration
-- Run once. All statements are idempotent (IF NOT EXISTS / IF EXISTS).

-- Import job tracking
CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisations(id),
  created_by UUID REFERENCES users(id),
  course_id UUID REFERENCES courses(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','parsing','validating','assembling','complete','failed')),
  file1_content TEXT,
  file2_content TEXT,
  parse_errors JSONB DEFAULT '[]',
  validation_errors JSONB DEFAULT '[]',
  block_count INTEGER DEFAULT 0,
  image_slot_count INTEGER DEFAULT 0,
  module_count INTEGER DEFAULT 0,
  lesson_count INTEGER DEFAULT 0,
  parse_report JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Image mapping index (parsed from FILE 2)
CREATE TABLE IF NOT EXISTS image_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_job_id UUID REFERENCES import_jobs(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id),
  image_id VARCHAR(20) NOT NULL,
  lesson_context TEXT,
  chapter_context TEXT,
  placement TEXT,
  position VARCHAR(30)
    CHECK (position IN ('full_width','centred_medium_width','full_width_banner','centred_small')),
  ratio VARCHAR(10),
  size_spec TEXT,
  alignment VARCHAR(10) CHECK (alignment IN ('center','left','right')),
  frame_style VARCHAR(30) DEFAULT 'none',
  filename TEXT,
  notes TEXT,
  media_asset_id UUID REFERENCES media_assets(id),
  resolution_status VARCHAR(20) DEFAULT 'unresolved'
    CHECK (resolution_status IN ('resolved','asset_pending','unresolved_error','unresolved')),
  is_sequential_set BOOLEAN DEFAULT false,
  sequential_set_key VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, image_id)
);

-- Parsed lesson blocks (the Course DOM in storage form)
CREATE TABLE IF NOT EXISTS lesson_blocks_parsed (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_job_id UUID REFERENCES import_jobs(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id),
  block_index INTEGER NOT NULL,
  block_type VARCHAR(30) NOT NULL,
  block_data JSONB NOT NULL DEFAULT '{}',
  image_mapping_id UUID REFERENCES image_mappings(id),
  resolution_status VARCHAR(20) DEFAULT 'na',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lesson_id, block_index)
);

-- Add 3-file columns to media_assets
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS image_id VARCHAR(20),
  ADD COLUMN IF NOT EXISTS image_mapping_id UUID REFERENCES image_mappings(id),
  ADD COLUMN IF NOT EXISTS course_namespace VARCHAR(10);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_import_jobs_course ON import_jobs(course_id);
CREATE INDEX IF NOT EXISTS idx_image_mappings_course_imgid ON image_mappings(course_id, image_id);
CREATE INDEX IF NOT EXISTS idx_image_mappings_asset ON image_mappings(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_lesson_blocks_lesson ON lesson_blocks_parsed(lesson_id, block_index);
CREATE INDEX IF NOT EXISTS idx_lesson_blocks_import ON lesson_blocks_parsed(import_job_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_image_id ON media_assets(image_id) WHERE image_id IS NOT NULL;
