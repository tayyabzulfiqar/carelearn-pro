const { spawn } = require('node:child_process');
const path = require('node:path');

const importer = path.join(__dirname, 'scripts/import-fire-safety-course.js');
const child = spawn(process.execPath, [importer], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code || 0));
