## 📝 Description

Please provide a clear and concise summary of the changes introduced in this pull request, including the problem solved and technical implementation rationale.

Fixes / Closes #(issue)

---

## 🔍 Type of Change

- [ ] 🐛 Bug fix (non-breaking change fixing an identified defect)
- [ ] ✨ New feature (non-breaking change adding new capability)
- [ ] ⚡ Performance improvement / refactor (non-breaking code quality change)
- [ ] 🌐 Localization & i18n update (translations or direction fixes)
- [ ] 🛡️ Security hardening / vulnerability mitigation
- [ ] 📚 Documentation update (guides, templates, API specs)
- [ ] 💥 Breaking change (fix or feature causing existing functionality to not work as expected)

---

## 📦 Component Scope

- [ ] 🌐 Web Dashboard (Next.js 14 App Router, UI, Tailwind)
- [ ] 🤖 Telegram Bot (Commands, Callbacks, Keyboards, Telegraf)
- [ ] ⚙️ Core REST API & Backend Services (Express, Auth, Middleware)
- [ ] 🧙 Subdomain Wizard & Routing Engine
- [ ] 🔄 Safe Nginx Reverse Proxy Engine
- [ ] 🖥️ VPS Node Management & SSH Client
- [ ] ☁️ DNS Provider Engine (Cloudflare / Manual)
- [ ] 💾 Database, Migrations & Backup System
- [ ] 🌍 Localization System (`src/i18n`, `web/lib/i18n`, `locales.json`)

---

## 🧪 Testing & Verification

Describe the tests performed to verify this change:

- [ ] Automated tests pass locally (`npm test` executes all Jest suites).
- [ ] Frontend build succeeds without warnings (`cd web && npm run build`).
- [ ] Manual verification performed on the affected component.
- [ ] If user-facing strings were added/modified:
  - [ ] Keys added to all 12 locales in `src/i18n/locales/`
  - [ ] Exact parity maintained with `web/lib/locales.json`
  - [ ] Verified RTL presentation (Arabic / Urdu)
- [ ] If bot keyboard was modified:
  - [ ] Verified with `npx jest tests/bot/bot_keyboards_i18n.test.js`
  - [ ] No raw dotted keys rendered

---

## 🔒 Security & Privacy Checklist

- [ ] **No Secrets**: I have checked the git diff to ensure no passwords, API tokens, encryption keys, `.env` files, or `.db` files are committed.
- [ ] **Sanitized Output**: Passwords, tokens, and SSH keys are properly redacted from logs and API payloads.
- [ ] **Input Validation**: All incoming requests and parameters are sanitized and strictly validated.
- [ ] **Parameterized SQL**: All database queries use prepared parameterized statements.
