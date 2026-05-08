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
        CHECK (role IN ('super_admin','org_admin','trainer','learner')),
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
      description TEXT,
      category VARCHAR(100) NOT NULL,
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
      title VARCHAR(255) NOT NULL,
      description TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      content JSONB DEFAULT '{}',
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

    CREATE TABLE IF NOT EXISTS analytics_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id),
      event_name VARCHAR(120) NOT NULL,
      event_category VARCHAR(80),
      event_payload JSONB DEFAULT '{}',
      occurred_at TIMESTAMPTZ DEFAULT NOW()
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
    CREATE INDEX IF NOT EXISTS idx_analytics_events_org_time ON analytics_events(organisation_id, occurred_at DESC);
  `);
  console.log('All tables created successfully.');
};

module.exports = { createTables };
