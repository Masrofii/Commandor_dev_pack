'use strict';
process.env.NODE_ENV='test';
process.env.DATABASE_PATH='/tmp/test-migrations.db';
process.env.DOMAINS='test.com';
process.env.SESSION_SECRET='test';
process.env.JWT_SECRET='test';
process.env.SPAM_THRESHOLD_SCORE='5';
process.env.SPAM_BLOCK_SCORE='8';
process.env.MAX_EMAIL_SIZE='10485760';
process.env.BURNER_TTL_MINUTES='60';
process.env.EMAIL_TTL_DAYS='7';
process.env.ALIAS_TTL_DAYS='30';
process.env.MAX_ALIASES='5';
process.env.MAX_STORAGE_BYTES='104857600';
process.env.BACKUP_DIR='/tmp/test-backups';
process.env.LOG_DIR='/tmp/test-logs';
const{initDatabase,runMigrations,closeDatabase,getDb}=require('../../database/database');
const fs=require('fs');
// WAL is not available on :memory: databases, so this suite runs against a
// real file to verify the journal mode used in production.
beforeAll(()=>{for(const f of['','-wal','-shm']){try{fs.rmSync(process.env.DATABASE_PATH+f,{force:true});}catch{}}initDatabase();runMigrations();});
afterAll(()=>{closeDatabase();for(const f of['','-wal','-shm']){try{fs.rmSync(process.env.DATABASE_PATH+f,{force:true});}catch{}}});
describe('Database Schema',()=>{
  test('users table has correct columns',()=>{const cols=getDb().prepare("PRAGMA table_info(users)").all().map(c=>c.name);['tg_id','created_at','is_banned','role','storage_limit','alias_limit'].forEach(c=>expect(cols).toContain(c));});
  test('aliases table has correct columns',()=>{const cols=getDb().prepare("PRAGMA table_info(aliases)").all().map(c=>c.name);['address','tg_id','domain','burner','expires_at','auto_reply_enabled'].forEach(c=>expect(cols).toContain(c));});
  test('emails table has all required columns',()=>{const cols=getDb().prepare("PRAGMA table_info(emails)").all().map(c=>c.name);['id','alias_address','sender','subject','spam_score','spf_result','dkim_result','is_read','is_deleted','received_at'].forEach(c=>expect(cols).toContain(c));});
  test('foreign keys are enforced',()=>{expect(getDb().prepare('PRAGMA foreign_keys').get().foreign_keys).toBe(1);});
  test('WAL mode is enabled',()=>{expect(getDb().prepare('PRAGMA journal_mode').get().journal_mode).toBe('wal');});
  test('migrations table tracks applied migrations',()=>{const ms=getDb().prepare('SELECT filename FROM migrations ORDER BY filename').all();expect(ms.length).toBeGreaterThanOrEqual(9);expect(ms[0].filename).toBe('001_initial.sql');});
  test('FTS5 table exists',()=>{const t=getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='emails_fts'").all();expect(t.length).toBe(1);});
  test('cascade delete works',()=>{const db=getDb();db.prepare("INSERT INTO users(tg_id)VALUES(55555)").run();db.prepare("INSERT INTO aliases(address,tg_id,domain,alias_type)VALUES('cascade@test.com',55555,'test.com','throwaway')").run();db.prepare('DELETE FROM users WHERE tg_id=55555').run();expect(db.prepare('SELECT * FROM aliases WHERE address=?').get('cascade@test.com')).toBeUndefined();});
});
