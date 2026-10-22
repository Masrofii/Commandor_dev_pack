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

const CRITICAL_KEYS = [
  'common.back',
  'common.cancel',
  'common.confirm',
  'common.retry',
  'broadcast.title',
  'broadcast.request_content',
  'broadcast.preview',
  'broadcast.edit',
  'broadcast.confirm',
  'broadcast.cancelled',
  'broadcast.completed',
  'broadcast.failed',
  'aliases.create',
  'aliases.empty',
  'inbox.empty',
  'settings.language',
  'errors.generic',
  'nav.overview',
  'nav.inbox',
  'nav.aliases',
  'nav.subdomains',
  'nav.hosting',
  'nav.api_keys',
  'nav.webhooks',
  'nav.sessions',
  'nav.settings',
  'nav.admin'
];

const EXPECTED_LANGS = ['en', 'ar', 'ru', 'fr', 'es', 'de', 'tr', 'pt', 'zh', 'hi', 'id', 'ur'];
let totalErrors = 0;
let totalWarnings = 0;

function extractVars(str) {
  if (typeof str !== 'string') return [];
  const matches = str.match(/\{([a-zA-Z0-9_]+)\}/g);
  return matches ? [...new Set(matches)].sort() : [];
}

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

  let emptyCount = 0;
  let varMismatchCount = 0;
  let missingCritical = 0;

  for (const crit of CRITICAL_KEYS) {
    if (!catalog[crit]) {
      missingCritical++;
      console.error(`❌ [${lang}] Missing critical key: ${crit}`);
      totalErrors++;
    }
  }

  for (const k of baseKeys) {
    const val = catalog[k];
    if (typeof val === 'string' && val.trim() === '') {
      emptyCount++;
      console.error(`❌ [${lang}] Empty translation for key: ${k}`);
      totalErrors++;
    }

    // Verify variable interpolation consistency
    const enVars = extractVars(en[k]);
    const langVars = extractVars(val);
    const missingVars = enVars.filter(v => !langVars.includes(v));
    if (missingVars.length > 0) {
      varMismatchCount++;
      console.warn(`⚠️ [${lang}] Key '${k}' missing interpolation variables: ${missingVars.join(', ')}`);
      totalWarnings++;
    }
  }

  if (missing.length === 0 && extra.length === 0 && emptyCount === 0 && missingCritical === 0) {
    console.log(`✅ [${lang}] 100% Complete (${keys.length}/${baseKeys.length} keys, 0 empty, all critical keys present)`);
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
