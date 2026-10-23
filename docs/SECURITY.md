# Commandor Dev Pack — Security Architecture & Threat Model

**Status:** Production Hardened  
**Reference Frameworks:** OWASP ASVS, OWASP Top 10  

---

## 1. Threat Model & Security Controls

```
┌─────────────────────────┬────────────────────────────────────────────────────────┐
│ Threat Category         │ Platform Mitigation                                   │
├─────────────────────────┼────────────────────────────────────────────────────────┤
│ SQL Injection           │ 100% Parameterized queries via better-sqlite3          │
│ Cross-Site Scripting    │ sanitize-html with strict tag/protocol allowlist       │
│ CSRF                    │ SameSite cookies, custom Authorization Bearer headers  │
│ Tenant Data Leakage     │ Server-enforced tg_id ownership on every data lookup   │
│ Credential Exposure     │ AES-256-GCM encryption at rest, masked in API/logs     │
│ Command Injection       │ Fixed arguments, forbidden pattern regex blocks        │
│ Directory Traversal     │ path.resolve, basename sanitization, regex hostname   │
│ Denial of Service (DoS) │ express-rate-limit, request payload caps (2MB/25MB)   │
└─────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Tenant Isolation

Multi-user isolation is enforced server-side on every resource path:

1. **Emails & Attachments**:
   - `SELECT ... FROM emails e JOIN aliases a ON e.alias_address = a.address WHERE a.tg_id = ? AND e.id = ?`
   - Attachment download verifies `al.tg_id = ? AND a.id = ?`.
2. **Applications & Deployments**:
   - `applications.user_tg_id` records ownership.
   - All lifecycle commands (`deploy`, `rollback`, `start`, `stop`, `delete`) verify `checkApplicationOwnership`.
3. **Subdomains & Reverse Proxy**:
   - Hostnames are bound to user IDs in `subdomains.tg_id`.
   - Modifying proxy routes or web handlers checks user ownership.

---

## 3. Remote Node Execution Safeguards

When administrators execute diagnostic commands across VPS nodes:
1. Privileges: Requires verified server-side administrator session (`role === 'admin'`).
2. Blocklist: Destructive commands matching `FORBIDDEN_NODE_COMMANDS` are rejected prior to SSH transmission:
   - Recursive root/home removal (`rm -rf /`)
   - Filesystem formatting (`mkfs.*`)
   - Direct raw block device manipulation (`/dev/sd*`)
   - Fork bombs (`:(){ :|:& };:`)
   - Unrestricted permissions (`chmod -R 777 /`)
3. Audit Trail: All remote executions are immutably logged with actor, target node, command preview, duration, and exit code.

---

## 4. Reporting a Vulnerability

If you discover a security vulnerability in Commandor Dev Pack, please submit a report directly to the lead maintainer:

- **Maintainer**: `@xpT_T`
- **Security Contact**: Contact via Telegram or open a confidential GitHub Security Advisory.
- **Response Target**: Acknowledgement within 24 hours with remediation timeline.
