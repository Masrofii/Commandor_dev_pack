# Commandor Dev Pack — Incident Response & Troubleshooting Runbook

This runbook guides platform administrators in diagnosing and resolving common operational issues.

---

## 1. Quick Diagnostic Checklist

| Check | Command | Expected State |
| :--- | :--- | :--- |
| **PM2 Process Status** | `pm2 list` | Status `online` for all 3 processes |
| **Backend Health** | `curl -s http://127.0.0.1:3000/api/health` | `{"status":"ok"}` |
| **Database Integrity** | `npm run migrate` | No unapplied or failing migrations |
| **Disk Capacity** | `df -h /` | Less than 90% utilization |
| **Recent Errors** | `tail -n 50 /opt/temp-mail-manager/logs/pm2-error-0.log` | Clean output without repeating exceptions |

---

## 2. Common Failure Scenarios & Solutions

### Scenario A: Bot Message Displays Literal HTML (`<b>Text</b>`)
- **Cause**: Message dispatched via plain `ctx.reply()` without `parse_mode: 'HTML'`.
- **Solution**: Always use `send(ctx, text, extra)` or `replyHtml(ctx, text, extra)`.

### Scenario B: Document Uploads in Telegram Bot Ignored
- **Cause**: Middleware chain stopped in previous handler without calling `next()`.
- **Solution**: Verify that `bot.on(['photo', ...])` invokes `if (typeof next === 'function') return next();` when not handling a broadcast.

### Scenario C: Application Deployment Shows "Port in Use" (EADDRINUSE)
- **Cause**: An orphaned process or background service is still listening on the assigned port.
- **Diagnosis**: `lsof -i :<PORT>`
- **Solution**: Kill the orphaned process or reassign the application port via dashboard settings.

### Scenario D: SQLite Database Busy (`SQLITE_BUSY` or Lock Error)
- **Cause**: Long-running synchronous transaction blocking writers.
- **Solution**: Check that WAL mode is active (`PRAGMA journal_mode;`). Better-sqlite3 is configured with a 30-second busy timeout (`busy_timeout=30000`) and synchronous=NORMAL.

### Scenario E: Web Dashboard Translation Key Shown as Title Case
- **Cause**: A key is missing in the target locale catalog and English catalog; the 3-tier cascade fallback humanizer formatted the key.
- **Solution**: Run `node scripts/validate-translations.js` to detect missing keys across catalogs, add the translation, and sync with `node scripts/sync_all_translations.js`.

---

## 3. Safe Service Restart Procedure

```bash
# Gracefully reload processes without dropping incoming requests
pm2 reload all

# If PM2 daemon needs a complete restart
pm2 restart all --update-env
```
