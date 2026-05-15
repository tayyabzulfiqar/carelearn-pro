// Database migration — run this once to create all tables
const db = require('../config/database');

const createTables = async () => {
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS organisations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      logo_url TEXT,
      primary_color VARCHAR(7) DEFAULT '#0D1F3C',
      subscription_plan VARCHAR(50) DEFAULT 'starter',
      max_seats INTEGER DEFAULT 50,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'learner'
        CHECK (role IN ('platform_owner','super_admin','agency_admin','org_admin','trainer','learner','staff_user')),
      avatar_url TEXT,
      is_active BOOLEAN DEFAULT true,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS organisation_members (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(50) DEFAULT 'learner',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(organisation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS courses (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE,
      description TEXT,
      category VARCHAR(100) NOT NULL,
      thumbnail_url TEXT,
      cqc_reference VARCHAR(100),
      skills_for_care_ref VARCHAR(100),
      target_roles TEXT[],
      duration_minutes INTEGER DEFAULT 30,
      renewal_years INTEGER DEFAULT 1,
      pass_mark INTEGER DEFAULT 80,
      is_mandatory BOOLEAN DEFAULT false,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS modules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      parent_module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      content JSONB DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      is_visible BOOLEAN DEFAULT true,
      published_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}',
      order_index INTEGER NOT NULL DEFAULT 0,
      duration_minutes INTEGER DEFAULT 5,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      organisation_id UUID REFERENCES organisations(id),
      due_date DATE,
      status VARCHAR(20) DEFAULT 'enrolled'
        CHECK (status IN ('enrolled','in_progress','completed','overdue','expired')),
      enrolled_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS progress (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      lesson_id UUID NOT NULL REFERENCES lessons(id),
      completed BOOLEAN DEFAULT false,
      time_spent_seconds INTEGER DEFAULT 0,
      completed_at TIMESTAMPTZ,
      UNIQUE(enrollment_id, lesson_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_questions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      module_id UUID REFERENCES modules(id),
      lesson_number INTEGER,
      question_text TEXT NOT NULL,
      question_type VARCHAR(20) DEFAULT 'multiple_choice',
      options JSONB NOT NULL DEFAULT '[]',
      correct_answer INTEGER NOT NULL,
      explanation TEXT,
      difficulty VARCHAR(20),
      is_final_assessment BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      version_tag VARCHAR(100),
      question_key VARCHAR(150),
      option_order JSONB DEFAULT '[]',
      order_index INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS assessment_attempts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id),
      module_id UUID REFERENCES modules(id),
      lesson_number INTEGER,
      is_final BOOLEAN DEFAULT false,
      score INTEGER NOT NULL,
      passed BOOLEAN NOT NULL,
      answers JSONB DEFAULT '[]',
      attempted_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      enrollment_id UUID NOT NULL REFERENCES enrollments(id),
      user_id UUID NOT NULL REFERENCES users(id),
      course_id UUID NOT NULL REFERENCES courses(id),
      organisation_id UUID REFERENCES organisations(id),
      certificate_number VARCHAR(50) UNIQUE NOT NULL,
      issued_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      pdf_url TEXT,
      is_valid BOOLEAN DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id),
      organisation_id UUID REFERENCES organisations(id),
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(50),
      resource_id UUID,
      metadata JSONB DEFAULT '{}',
      ip_address INET,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agencies (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(120) UNIQUE NOT NULL,
      owner_user_id UUID REFERENCES users(id),
      status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
      billing_email VARCHAR(255),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS organisation_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      key VARCHAR(120) NOT NULL,
      value JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (organisation_id, key)
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'learner',
      invited_by UUID REFERENCES users(id),
      token VARCHAR(255) UNIQUE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
      uploaded_by UUID REFERENCES users(id),
      file_name VARCHAR(255) NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type VARCHAR(120),
      file_size_bytes BIGINT DEFAULT 0,
      tags TEXT[] DEFAULT '{}',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(80) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT,
      channel VARCHAR(40) DEFAULT 'in_app',
      is_read BOOLEAN DEFAULT false,
      read_at TIMESTAMPTZ,
      payload JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    CREATE TABLE IF NOT EXISTS notification_delivery_state (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      type VARCHAR(80) NOT NULL,
      dedup_key VARCHAR(255) NOT NULL,
      last_sent_at TIMESTAMPTZ NOT NULL,
      cooldown_until TIMESTAMPTZ NOT NULL,
      send_count INTEGER NOT NULL DEFAULT 1,
      payload_hash VARCHAR(128),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(organisation_id, type, dedup_key)
    );

    CREATE TABLE IF NOT EXISTS compliance_snapshots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      snapshot_type VARCHAR(80) NOT NULL DEFAULT 'compliance_dashboard',
      snapshot JSONB NOT NULL,
      checksum VARCHAR(128) NOT NULL,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS report_exports (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      requested_by UUID REFERENCES users(id),
      report_type VARCHAR(80) NOT NULL,
      format VARCHAR(20) NOT NULL CHECK (format IN ('csv', 'pdf')),
      filters JSONB DEFAULT '{}',
      row_count INTEGER NOT NULL DEFAULT 0,
      checksum VARCHAR(128) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      key VARCHAR(120) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT false,
      metadata JSONB NOT NULL DEFAULT '{}',
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(organisation_id, key)
    );

    CREATE TABLE IF NOT EXISTS background_jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
      queue_name VARCHAR(80) NOT NULL,
      job_type VARCHAR(120) NOT NULL,
      dedup_key VARCHAR(255),
      payload JSONB NOT NULL DEFAULT '{}',
      state VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','processing','succeeded','failed','dead_letter','cancelled')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_at TIMESTAMPTZ,
      locked_by VARCHAR(120),
      last_error TEXT,
      result JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (organisation_id, queue_name, dedup_key)
    );

    CREATE TABLE IF NOT EXISTS job_executions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES background_jobs(id) ON DELETE CASCADE,
      organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
      attempt_number INTEGER NOT NULL,
      state VARCHAR(30) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      duration_ms INTEGER,
      error TEXT,
      metadata JSONB DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS email_deliveries (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      recipient_email VARCHAR(255) NOT NULL,
      template_key VARCHAR(120) NOT NULL,
      template_version VARCHAR(40) NOT NULL DEFAULT 'v1',
      provider VARCHAR(40) NOT NULL DEFAULT 'local_log',
      dedup_key VARCHAR(255),
      payload JSONB NOT NULL DEFAULT '{}',
      status VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','suppressed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (organisation_id, dedup_key)
    );

    CREATE TABLE IF NOT EXISTS storage_objects (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
      bucket VARCHAR(80) NOT NULL,
      object_key TEXT NOT NULL,
      provider VARCHAR(40) NOT NULL,
      checksum_sha256 VARCHAR(128) NOT NULL,
      byte_size BIGINT NOT NULL,
      mime_type VARCHAR(120),
      ref_type VARCHAR(80) NOT NULL,
      ref_id UUID,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, bucket, object_key)
    );

    CREATE TABLE IF NOT EXISTS scheduler_runs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      task_key VARCHAR(120) NOT NULL UNIQUE,
      last_run_at TIMESTAMPTZ,
      last_status VARCHAR(20) CHECK (last_status IN ('success','failed')),
      lock_until TIMESTAMPTZ,
      run_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      last_duration_ms INTEGER,
      last_error TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS monitoring_snapshots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      snapshot_type VARCHAR(80) NOT NULL,
      payload JSONB NOT NULL,
      checksum VARCHAR(128) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS release_metadata (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      release_tag VARCHAR(120) NOT NULL,
      commit_hash VARCHAR(64) NOT NULL,
      env_fingerprint VARCHAR(128) NOT NULL,
      startup_check_passed BOOLEAN NOT NULL DEFAULT false,
      created_by UUID REFERENCES users(id),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS recovery_artifacts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      environment VARCHAR(30) NOT NULL CHECK (environment IN ('staging','production')),
      artifact_type VARCHAR(80) NOT NULL,
      storage_path TEXT NOT NULL,
      checksum_sha256 VARCHAR(128) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'created' CHECK (status IN ('created','verified','restore_tested','failed')),
      metadata JSONB DEFAULT '{}',
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      verified_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id),
      event_name VARCHAR(120) NOT NULL,
      event_category VARCHAR(80),
      event_payload JSONB DEFAULT '{}',
      occurred_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS training_categories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(120) UNIQUE NOT NULL,
      slug VARCHAR(140) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS training_tags (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(120) UNIQUE NOT NULL,
      slug VARCHAR(140) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS training_course_categories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      category_id UUID NOT NULL REFERENCES training_categories(id) ON DELETE CASCADE,
      UNIQUE(course_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS training_course_tags (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      tag_id UUID NOT NULL REFERENCES training_tags(id) ON DELETE CASCADE,
      UNIQUE(course_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL,
      quiz_type VARCHAR(20) DEFAULT 'final' CHECK (quiz_type IN ('lesson', 'module', 'final')),
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      pass_mark INTEGER DEFAULT 75,
      retry_limit INTEGER DEFAULT 3,
      time_limit_seconds INTEGER,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      question_type VARCHAR(20) DEFAULT 'single_choice',
      options JSONB NOT NULL DEFAULT '[]',
      correct_answer TEXT NOT NULL,
      explanation TEXT,
      weight INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS certificate_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
      name VARCHAR(150) NOT NULL,
      template_type VARCHAR(80) DEFAULT 'completion',
      template_data JSONB NOT NULL DEFAULT '{}',
      is_default BOOLEAN DEFAULT false,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE assessment_questions
      ADD COLUMN IF NOT EXISTS lesson_number INTEGER,
      ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20),
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS version_tag VARCHAR(100),
      ADD COLUMN IF NOT EXISTS question_key VARCHAR(150),
      ADD COLUMN IF NOT EXISTS option_order JSONB DEFAULT '[]';

    ALTER TABLE assessment_attempts
      ADD COLUMN IF NOT EXISTS lesson_number INTEGER;

    ALTER TABLE courses
      ADD COLUMN IF NOT EXISTS slug VARCHAR(255),
      ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

    ALTER TABLE modules
      ADD COLUMN IF NOT EXISTS parent_module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';

    ALTER TABLE lessons
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

    ALTER TABLE certificates
      ADD COLUMN IF NOT EXISTS verification_token VARCHAR(120);

    ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('platform_owner','super_admin','agency_admin','org_admin','trainer','learner','staff_user'));

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
    CREATE INDEX IF NOT EXISTS idx_progress_enrollment ON progress(enrollment_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_questions_course_active
      ON assessment_questions(course_id, is_active, is_final_assessment);
    CREATE INDEX IF NOT EXISTS idx_assessment_questions_version
      ON assessment_questions(course_id, version_tag);
    CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_org_members_org ON organisation_members(organisation_id);
    CREATE INDEX IF NOT EXISTS idx_invites_org_email ON invitations(organisation_id, email);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_notification_delivery_state_org_type ON notification_delivery_state(organisation_id, type);
    CREATE INDEX IF NOT EXISTS idx_compliance_snapshots_org_created ON compliance_snapshots(organisation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_report_exports_org_created ON report_exports(organisation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_feature_flags_org_key ON feature_flags(organisation_id, key);
    CREATE INDEX IF NOT EXISTS idx_jobs_queue_state_available ON background_jobs(queue_name, state, available_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_org_state ON background_jobs(organisation_id, state);
    CREATE INDEX IF NOT EXISTS idx_job_exec_job ON job_executions(job_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_org_status ON email_deliveries(organisation_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_storage_org_ref ON storage_objects(organisation_id, ref_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_monitoring_snapshots_type ON monitoring_snapshots(snapshot_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_release_created ON release_metadata(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recovery_env_created ON recovery_artifacts(environment, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_org_time ON analytics_events(organisation_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);
    CREATE INDEX IF NOT EXISTS idx_modules_course_parent ON modules(course_id, parent_module_id);
    CREATE INDEX IF NOT EXISTS idx_lessons_module_order ON lessons(module_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_quizzes_course_status ON quizzes(course_id, status);
    CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_order ON quiz_questions(quiz_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_certificates_verification_token ON certificates(verification_token);
  `);
  console.log('All tables created successfully.');
};

module.exports = { createTables };
