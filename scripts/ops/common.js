const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function run(command, args = [], opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      cwd: opts.cwd || process.cwd(),
      env: opts.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (error) => resolve({ code: 127, stdout, stderr: String(error && error.message ? error.message : error) }));
  });
}

async function existsCommand(command) {
  const result = await run('where.exe', [command]);
  return result.code === 0;
}

function writeReport(name, payload) {
  const dir = path.resolve('tmp/ops');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

module.exports = {
  parseEnvFile,
  run,
  existsCommand,
  writeReport,
};

