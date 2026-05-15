const bcrypt = require('bcryptjs');
const { randomUUID: uuidv4 } = require('crypto');
const db = require('./config/database');
const { createTables } = require('./models');

let bootstrapPromise;

async function ensureSuperAdminFromEnv() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
     VALUES ($1, $2, $3, $4, $5, 'super_admin', true)
     ON CONFLICT (email)
     DO UPDATE SET role = 'super_admin', is_active = true`,
    [
      uuidv4(),
      email.toLowerCase().trim(),
      passwordHash,
      process.env.SUPER_ADMIN_FIRST_NAME || 'Super',
      process.env.SUPER_ADMIN_LAST_NAME || 'Admin',
    ]
  );
}

async function ensurePlatformOwnerFromEnv() {
  const email = process.env.PLATFORM_OWNER_EMAIL;
  const password = process.env.PLATFORM_OWNER_PASSWORD;
  if (!email || !password) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
     VALUES ($1, $2, $3, $4, $5, 'platform_owner', true)
     ON CONFLICT (email)
     DO UPDATE SET role = 'platform_owner', is_active = true`,
    [
      uuidv4(),
      email.toLowerCase().trim(),
      passwordHash,
      process.env.PLATFORM_OWNER_FIRST_NAME || 'Platform',
      process.env.PLATFORM_OWNER_LAST_NAME || 'Owner',
    ]
  );
}

function bootstrapDatabase() {
  if (!bootstrapPromise) {
    bootstrapPromise = createTables()
      .then(() => ensureSuperAdminFromEnv())
      .then(() => ensurePlatformOwnerFromEnv());
  }
  return bootstrapPromise;
}

module.exports = { bootstrapDatabase };
