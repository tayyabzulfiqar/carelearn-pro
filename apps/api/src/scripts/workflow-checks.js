#!/usr/bin/env node
const { spawn } = require('node:child_process');

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptName], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exited ${code}`));
    });
  });
}

async function main() {
  await runScript(require.resolve('./verify-health'));
  await runScript(require.resolve('./smoke-api'));
  console.log('workflow_ok');
}

main().catch((err) => {
  console.error(`workflow_fail ${err.message}`);
  process.exit(1);
});
