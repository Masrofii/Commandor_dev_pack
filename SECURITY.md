# Security Policy

At **Commandor Dev Pack**, the security of our platform, user data, managed infrastructure nodes, and reverse proxy routing is of paramount importance. We appreciate the responsible disclosure of security vulnerabilities by security researchers and the open-source community.

---

## Supported Versions

Only the latest active major/minor release branch receives official security updates and patches.

| Version | Supported          | Status                                 |
|---------|--------------------|----------------------------------------|
| `1.x`   | :white_check_mark: | Current active release branch           |
| `< 1.0` | :x:                | Deprecated / EOL (Upgrade recommended) |

---

## Reporting a Vulnerability

**Please do NOT file public GitHub issues for security vulnerabilities, exploits, or sensitive credential leaks.**

Publicly reporting an active vulnerability puts self-hosted instances and production servers at risk. Instead, please report all vulnerabilities privately through one of the following methods:

### 1. GitHub Private Vulnerability Reporting (Preferred)
If you have a GitHub account, please submit a report directly via the repository's security advisory portal:
- Go to [https://github.com/Masrofii/Commandor_dev_pack/security/advisories](https://github.com/Masrofii/Commandor_dev_pack/security/advisories)
- Click **"Report a vulnerability"** to open a confidential discussion draft with maintainers.

### 2. Private Maintainer Contact
If the GitHub Advisory portal is inaccessible, contact the maintainers directly via:

> **Designated Security Contact:** `[INSERT SECURITY REPORTING EMAIL / PRIVATE CHANNEL]`  
> *(Please clearly prefix the message subject with `[SECURITY ISSUE]`)*

---

## What to Include in a Report

To help us triage, reproduce, and resolve the issue quickly, please provide as much relevant information as possible:

1. **Vulnerability Type**: Category (e.g., Remote Code Execution, Authentication Bypass, Privilege Escalation, SQL Injection, SSRF, Cross-Site Scripting, Insecure Direct Object Reference).
2. **Affected Component**:
   - Web Dashboard (Next.js 14)
   - Commandor API & Backend Services (Node/Express)
   - Telegram Bot (`telegraf` handlers & callbacks)
   - Node VPS Manager & SSH Provisioning
   - Nginx Reverse Proxy Route Generator
   - Cloudflare / Authoritative DNS Abstraction
   - SQLite Database & Backup Engine
3. **Reproduction Steps**: Detailed, step-by-step instructions or a minimal, sanitized Proof of Concept (PoC).
4. **Impact Assessment**: Real-world threat model (e.g., unauthorized data access, host compromise, denial of service).
5. **Environment Details**: Node.js version, platform OS, and configuration flags relevant to reproducing the bug.
6. **Suggested Remediation**: Any code patch, configuration adjustment, or architectural mitigation you recommend.

> [!CAUTION]
> **Sanitization Requirement**: Never include active production credentials, live SSH private keys, real customer email data, or valid Cloudflare API tokens in your report. Use placeholder strings (e.g. `example.com`, `0123456789abcdef...`).

---

## Responsible Disclosure & Coordination

When reporting a vulnerability to Commandor Dev Pack:

- **Confidentiality**: Maintainers will treat your report confidentially during the triage and remediation period.
- **Grace Period**: We ask that you give the project maintainers a reasonable window of time to investigate, create a fix, and release a patched version before disclosing the vulnerability publicly.
- **Attribution**: If you wish, we will gladly credit you in release notes and the project security advisory once the patch is published.
- **Bug Bounty Notice**: Commandor Dev Pack is an open-source project supported by community contributors and does not currently operate a paid bug bounty program.

---

## Security Best Practices for Operators

If you self-host Commandor Dev Pack in production, we strongly recommend:
- Keeping Node.js updated to the latest LTS version.
- Using dedicated, unprivileged Linux service accounts to run the Node.js process.
- Storing cryptographic keys (`JWT_SECRET`, `ENCRYPTION_KEY`) in an environment that restricts read access (`chmod 600 .env`).
- Restricting SSH access on managed VPS nodes using key-based authentication with strict host key verification.
- Ensuring Nginx reverse proxy syntax pre-flight checks remain enabled before reloading production proxy configurations.
