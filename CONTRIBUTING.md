# Contributing to Commandor Dev Pack

Thank you for your interest in contributing to **Commandor Dev Pack**! We welcome community contributions to improve our cloud infrastructure control plane, multi-node VPS management, domain routing engine, and self-hosted developer tools.

This document outlines our development workflows, coding standards, testing requirements, localization guidelines, and security policies.

---

## 📋 Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Prerequisites & Development Environment](#prerequisites--development-environment)
- [Getting Started: Fork, Clone & Setup](#getting-started-fork-clone--setup)
- [Development Workflow](#development-workflow)
- [Reporting Bugs & Requesting Features](#reporting-bugs--requesting-features)
- [Branch & Commit Conventions](#branch--commit-conventions)
- [Coding & Architectural Standards](#coding--architectural-standards)
- [Translation & Localization (i18n) Rules](#translation--localization-i18n-rules)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Security Restrictions & Hygiene](#security-restrictions--hygiene)
- [Pull Request Guidelines](#pull-request-guidelines)

---

## Code of Conduct

All contributors and maintainers are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior through the designated maintainer channels.

---

## Prerequisites & Development Environment

Before setting up Commandor Dev Pack, ensure your local development system has:

- **Node.js**: v20.x or v22.x LTS (`node -v` >= 20.0.0)
- **npm**: v9+ or v10+
- **SQLite3**: Required for the local database (`better-sqlite3` native bindings)
- **OpenSSL**: For generating cryptographic tokens and secret keys
- **Nginx** *(optional)*: v1.18+ (needed if testing active reverse-proxy file generation and syntax pre-flights locally)
- **Git**: v2.30+

---

## Getting Started: Fork, Clone & Setup

### 1. Fork and Clone
```bash
# Fork the repository on GitHub: https://github.com/Masrofii/Commandor_dev_pack
git clone https://github.com/<your-username>/Commandor_dev_pack.git
cd Commandor_dev_pack
git remote add upstream https://github.com/Masrofii/Commandor_dev_pack.git
```

### 2. Install Dependencies
Commandor Dev Pack consists of a core Node.js backend/bot and a Next.js 14 dashboard:
```bash
# Install backend and Telegram bot dependencies
npm install

# Install web dashboard dependencies
cd web && npm install && cd ..
```

### 3. Configure Local Environment
Never edit `.env.example` directly for secrets. Instead, copy it to `.env`:
```bash
cp .env.example .env
```

Generate cryptographically secure keys for JWT and AES-256 encryption:
```bash
# Generate 32-byte hex keys
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

Update `.env` with your generated values:
```dotenv
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
JWT_SECRET=<your-generated-jwt-secret>
ENCRYPTION_KEY=<your-generated-32-byte-hex-key>
DOMAINS=localhost
DATABASE_PATH=data/commandor.db
```

### 4. Run Migrations
Initialize the SQLite schema:
```bash
npm run migrate
```

---

## Development Workflow

### Running Locally
You can run the backend and frontend in separate terminals during development:

```bash
# Terminal 1: Backend API & Telegram Bot
npm run dev

# Terminal 2: Next.js 14 Web Dashboard
cd web && npm run dev
```

The web dashboard is served at `http://localhost:3001` and proxies API requests to `http://localhost:3000`.

### Production Build Test
Verify that production assets compile properly before opening a pull request:
```bash
# Build the Next.js web application
cd web && npm run build && cd ..
```

---

## Reporting Bugs & Requesting Features

### Reporting Bugs
Before filing an issue, search existing [GitHub Issues](https://github.com/Masrofii/Commandor_dev_pack/issues) to avoid duplicates. When opening a new issue:
- Use our [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.yml).
- Provide minimal reproduction steps and expected vs. actual behavior.
- Specify the affected component (Web, Bot, API, DNS Wizard, Proxy, Nodes).
- Include sanitized logs: **strip all passwords, tokens, API keys, and IP addresses.**

### Requesting Features
- Use our [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.yml).
- Describe the problem clearly and explain why this belongs in Commandor Dev Pack.
- Propose an architectural or UI solution, mentioning any alternatives considered.

---

## Branch & Commit Conventions

### Branch Naming
Create focused, descriptive branches from `main`:
- `feature/<short-description>`: New platform capability or UI component
- `fix/<short-description>`: Bug fix or regression patch
- `docs/<short-description>`: Documentation updates or corrections
- `i18n/<locale-or-scope>`: Translation additions or parity adjustments
- `refactor/<short-description>`: Code restructuring without functional change

### Commit Messages
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
```
<type>(<scope>): <concise description in imperative mood>

[optional body explaining motivation and context]

[optional footer(s), e.g. Closes #123]
```

**Allowed Types:**
- `feat`: A new user-facing feature or API capability
- `fix`: A bug fix
- `docs`: Documentation changes only
- `style`: Formatting, missing semicolons, etc. (no code change)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or correcting tests
- `chore`: Dependency updates, build script modifications, migrations

*Examples:*
- `fix(bot): resolve missing translation keys in email suite keyboard`
- `feat(dns): add health check probe for CNAME records`
- `docs(readme): update environment setup instructions`

---

## Coding & Architectural Standards

1. **Layered Architecture**:
   - Route handlers in `src/api/` should be lean and delegate business logic to `src/services/`.
   - Bot callback/command handlers in `src/bot/` should remain decoupled from direct database calls wherever a service exists.
   - Database operations must utilize parameterized SQLite statements (`prepare().run()` / `prepare().get()`) to guarantee SQL injection safety.

2. **Nginx & Shell Command Safety**:
   - Never assemble Nginx configurations or shell execution strings with unvalidated user input.
   - Route mutations must use pre-flight syntax checks (`nginx -t`) and automated rollback snapshot hooks.

3. **Frontend Code (Next.js 14 App Router)**:
   - Use Tailwind CSS classes for styling. Follow existing cyber/slate design tokens.
   - All interactive UI components must handle light mode and dark mode cleanly.
   - Support bidirectional layouts: use logical or `rtl:` utilities (e.g. `rtl:rotate-180`, `rtl:border-r-0 rtl:border-l`).

---

## Translation & Localization (i18n) Rules

Commandor Dev Pack supports **12 languages** across both the Telegram bot and the Web Dashboard:
- `en` (English)
- `ar` (Arabic, RTL)
- `ru` (Russian)
- `fr` (French)
- `es` (Spanish)
- `de` (German)
- `tr` (Turkish)
- `pt` (Portuguese)
- `zh` (Chinese Simplified)
- `hi` (Hindi)
- `id` (Indonesian)
- `ur` (Urdu, RTL)

When modifying or adding user-facing text:
1. **Catalog Parity**: Any new translation key MUST be added to all 12 backend files in `src/i18n/locales/<lang>.json` AND to `web/lib/locales.json`.
2. **Never Hardcode Dotted Keys**: Always provide human-readable fallbacks or complete catalog entries.
3. **Variable Placeholders**: Use `{var}` or `{{var}}` placeholders.
4. **Direction Awareness**: Never hardcode direction-specific assumptions in strings. Test RTL presentation for Arabic (`ar`) and Urdu (`ur`).

---

## Testing & Quality Assurance

We maintain a Jest test suite covering APIs, bot keyboards, authentication, services, and i18n parity.

```bash
# Run all automated tests
npm test

# Run a specific test suite
npx jest tests/bot/bot_keyboards_i18n.test.js

# Run frontend build check
cd web && npm run build && cd ..
```

**Requirements for Pull Requests:**
- All existing 27+ test suites must pass without errors.
- New services or API routes must include accompanying unit/integration tests in `tests/`.
- Keyboard modifications must be verified against `tests/bot/bot_keyboards_i18n.test.js`.

---

## Security Restrictions & Hygiene

Security is paramount in Commandor Dev Pack. All contributors must adhere to strict security hygiene:

- **Zero Credential Commits**: Never commit `.env` files, production database snapshots (`.db`, `.db-wal`), SSL/TLS private keys, SSH credentials, or Telegram bot tokens.
- **Secret Redaction**: Passwords, tokens, and authorization headers must always be masked before logging or returning in HTTP responses.
- **AES-256 Encryption**: Remote server credentials, SSH keys, and application environment secrets must be stored encrypted using `src/utils/encryption.js`.
- **Public Disclosure Prohibition**: Do not open public issues to report exploitable security vulnerabilities. Follow our [Security Policy](SECURITY.md).

---

## Pull Request Guidelines

1. **Small & Focused**: Keep PRs focused on a single concern. Large PRs touching unrelated components take significantly longer to review.
2. **Up to Date**: Rebase or update your branch against the latest `upstream/main` before requesting review.
3. **Fill the Template**: Complete all sections of the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md).
4. **CI/Build Green**: Ensure `npm test` and `cd web && npm run build` pass before requesting a review.
5. **Review Process**: A maintainer will review your code, provide constructive feedback, and merge once all checklist items are verified.

Thank you for helping make Commandor Dev Pack the premier open-source infrastructure platform!
