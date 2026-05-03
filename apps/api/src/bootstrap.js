const bcrypt = require('bcryptjs');
const { randomUUID: uuidv4 } = require('crypto');
const db = require('./config/database');
const { createTables } = require('./models');

let bootstrapPromise;

async function ensureDemoUser() {
  const passwordHash = await bcrypt.hash('Test1234!', 12);
  await db.query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO NOTHING`,
    [uuidv4(), 'test@care.com', passwordHash, 'Test', 'User', 'learner']
  );
}

function bootstrapDatabase() {
  if (!bootstrapPromise) {
    bootstrapPromise = ensureDemoUser().catch(async (err) => {
      if (err.code !== '42P01') throw err;
      await createTables();
      await ensureDemoUser();
    });
  }
  return bootstrapPromise;
}

module.exports = { bootstrapDatabase };
