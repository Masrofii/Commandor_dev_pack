# Commandor Dev Pack — Internationalization (i18n) Architecture & Guide

**Version:** 1.0.0  
**Supported Languages:** 12 Official Launch Locales  

---

## 1. Architectural Overview

Commandor Dev Pack features a unified, fault-tolerant internationalization system supporting **12 languages** across the Express REST API, Telegram Bot, and Next.js Web Frontend.

### Supported Locales

| Code | Language | Native Name | Flag | Layout Direction |
| :---: | :--- | :--- | :---: | :---: |
| `en` | English (Base) | English | 🇬🇧 | LTR |
| `ar` | Arabic | العربية | 🇸🇦 | **RTL** |
| `ru` | Russian | Русский | 🇷🇺 | LTR |
| `fr` | French | Français | 🇫🇷 | LTR |
| `es` | Spanish | Español | 🇪🇸 | LTR |
| `de` | German | Deutsch | 🇩🇪 | LTR |
| `tr` | Turkish | Türkçe | 🇹🇷 | LTR |
| `pt` | Portuguese | Português | 🇵🇹 | LTR |
| `zh` | Chinese | 简体中文 | 🇨🇳 | LTR |
| `hi` | Hindi | हिन्दी | 🇮🇳 | LTR |
| `id` | Indonesian | Bahasa Indonesia | 🇮🇩 | LTR |
| `ur` | Urdu | اردو | 🇵🇰 | **RTL** |

---

## 2. Catalog Storage & Synchronization

Translation catalogs are stored in:
- **Backend & Bot Catalogs**: `/src/i18n/locales/<lang>.json`
- **Web Frontend Bundled Catalogs**: `/web/lib/locales.json` and `/web/i18n/<lang>.json`

Both repositories are kept 100% in sync using automated scripts:
- `node scripts/validate-translations.js`: Validates 100% key completeness against the base English dictionary.
- `node scripts/sync_all_translations.js`: Merges new keys into all 12 language files and updates `web/lib/locales.json`.

---

## 3. The 3-Tier Resolution Cascade

To prevent raw keys (such as `nav.nodes` or `bot.btn.my_aliases`) from leaking into user interfaces, both the backend resolver (`src/i18n/index.js`) and frontend resolver (`web/lib/i18n.js`) follow a 3-tier cascade:

```
[Key Requested]
      │
      ▼
1. Active Locale Catalog Check ──(Found?)──► Return Translation
      │ No
      ▼
2. English Base Catalog Check ───(Found?)──► Return English Translation
      │ No
      ▼
3. Humanizer Fallback ─────────────────────► Format Key as Title Case
                                              e.g. "bot.btn.my_aliases" -> "My Aliases"
                                              Logs warning in development mode
```

### Key Aliases & Synonyms
Common naming conventions and legacy keys are normalized via `KEY_ALIASES`:
```javascript
const KEY_ALIASES = {
  'bot.btn.my_aliases': 'menu.aliases',
  'bot.btn.new_alias': 'menu.new_alias',
  'api_keys.title': 'apikeys.title',
  'admin.tab_sites': 'admin.tab_hosting'
};
```

---

## 4. Variable Interpolation & Pluralization

Both single curly brace `{var}` and double curly brace `{{var}}` placeholders are supported:

```javascript
// Catalog definition
"bot.dash.main_message": "👋 Welcome back, <b>{{name}}</b>! You have <b>{unreadCount}</b> unread emails."

// Code invocation
t('bot.dash.main_message', lang, { name: 'Alex', unreadCount: 3 });
```

All values are safely interpolated. Missing variables are converted to empty strings without throwing runtime errors.

---

## 5. Right-to-Left (RTL) Guidelines

For Arabic (`ar`) and Urdu (`ur`), the layout direction is set to `dir="rtl"`.

### CSS Logical Properties & Layout Rules
- Use logical CSS properties: `margin-inline-start`, `padding-inline-start`, `start-0`, `end-0`.
- Do not invert technical strings: Code blocks, email addresses, IP addresses, ports, URLs, and numeric identifiers must remain left-to-right (`ltr`).
- The global stylesheet (`web/app/globals.css`) enforces:
  ```css
  [dir="rtl"] pre,
  [dir="rtl"] code,
  [dir="rtl"] input[type="url"],
  [dir="rtl"] input[type="email"],
  [dir="rtl"] input[type="tel"],
  [dir="rtl"] input[type="password"],
  [dir="rtl"] input.font-mono,
  [dir="rtl"] .font-mono,
  [dir="rtl"] .ltr-force {
    direction: ltr;
    unicode-bidi: isolate;
    text-align: left;
  }
  ```

---

## 6. Telegram Bot Formatting Safeguards

When constructing Telegram messages:
1. Always use HTML parse mode via the `send(ctx, text, extra)` or `replyHtml(ctx, text, extra)` helpers.
2. Dynamic user input (email subjects, names, labels) MUST be sanitized using `escapeHtml(str)` before concatenating with HTML templates.
3. Message entities in broadcasts are converted safely via `formatTelegramEntitiesToHtml(text, entities)`.

---

## 7. How to Add a New Language

Follow these steps to add language `<lang_code>` (e.g. `it` for Italian):

### Step 1: Register in Language Metadata
Add to `SUPPORTED_LANGUAGES` in both `src/i18n/index.js` and `web/lib/i18n.js`:
```javascript
{ code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', dir: 'ltr' }
```

### Step 2: Create Language Catalog File
Create `/src/i18n/locales/it.json` copying `/src/i18n/locales/en.json` and translate the values.

### Step 3: Run Validation & Sync
```bash
node scripts/validate-translations.js
```
The validator will check for 100% key coverage and variable placeholder consistency.

### Step 4: Run the Test Suite
```bash
npx jest tests/bot/bot_keyboards_i18n.test.js
```
