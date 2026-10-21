#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../src/i18n/locales');
const enPath = path.join(localesDir, 'en.json');

if (!fs.existsSync(enPath)) {
  console.error('❌ Base English catalog en.json does not exist!');
  process.exit(1);
}

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const baseKeys = Object.keys(en);
console.log(`\n🔍 Found base English catalog with ${baseKeys.length} keys.`);

const EXPECTED_LANGS = ['en', 'ar', 'ru', 'fr', 'es', 'de', 'tr', 'pt', 'zh', 'hi', 'id', 'ur'];
let totalErrors = 0;
let totalWarnings = 0;

console.log('\n📊 Validating 12 launch language translation catalogs...\n');

for (const lang of EXPECTED_LANGS) {
  const filePath = path.join(localesDir, `${lang}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ [${lang}] Missing catalog file: ${lang}.json`);
    totalErrors++;
    continue;
  }

  let catalog;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    catalog = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ [${lang}] Malformed JSON: ${err.message}`);
    totalErrors++;
    continue;
  }

  const keys = Object.keys(catalog);
  const missing = baseKeys.filter(k => !(k in catalog));
  const extra = keys.filter(k => !baseKeys.includes(k));

  if (missing.length === 0 && extra.length === 0) {
    console.log(`✅ [${lang}] 100% Complete (${keys.length}/${baseKeys.length} keys)`);
  } else {
    if (missing.length > 0) {
      console.warn(`⚠️ [${lang}] Missing ${missing.length} keys: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`);
      totalWarnings += missing.length;
    }
    if (extra.length > 0) {
      console.warn(`ℹ️ [${lang}] Contains ${extra.length} extra keys not in en.json`);
    }
  }
}

console.log('\n──────────────────────────────────────────────');
if (totalErrors === 0 && totalWarnings === 0) {
  console.log('🎉 All translations are valid, complete, and verified with 0 errors!\n');
  process.exit(0);
} else {
  console.log(`Validation finished with ${totalErrors} errors and ${totalWarnings} warnings.\n`);
  process.exit(totalErrors > 0 ? 1 : 0);
}
