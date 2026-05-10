#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const webRoot = path.resolve(__dirname, '..');
const requiredModules = [
  'next/package.json',
  'react/package.json',
  'tailwindcss/package.json',
  'postcss/package.json',
  'autoprefixer/package.json',
];

const requiredFiles = [
  'postcss.config.js',
  'tailwind.config.js',
  'src/app/globals.css',
  'next.config.js',
];

function checkModules() {
  const missing = [];
  for (const mod of requiredModules) {
    try {
      require.resolve(mod, { paths: [webRoot] });
    } catch {
      missing.push(mod);
    }
  }
  return missing;
}

function checkFiles() {
  return requiredFiles.filter((file) => !fs.existsSync(path.join(webRoot, file)));
}

const missingModules = checkModules();
const missingFiles = checkFiles();

if (missingModules.length || missingFiles.length) {
  console.error('Frontend build prerequisites check failed.');
  if (missingModules.length) {
    console.error(`Missing modules: ${missingModules.join(', ')}`);
  }
  if (missingFiles.length) {
    console.error(`Missing files: ${missingFiles.join(', ')}`);
  }
  process.exit(1);
}

console.log('Frontend build prerequisites check passed.');
