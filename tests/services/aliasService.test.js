'use strict';
process.env.NODE_ENV='test';
process.env.DATABASE_PATH=':memory:';
process.env.DOMAINS='test.example.com';
process.env.DEFAULT_DOMAIN='test.example.com';
process.env.MAX_ALIASES='5';
process.env.MAX_STORAGE_BYTES='104857600';
process.env.BURNER_TTL_MINUTES='60';
process.env.EMAIL_TTL_DAYS='7';
process.env.ALIAS_TTL_DAYS='0';
process.env.SESSION_SECRET='test';
process.env.JWT_SECRET='test';
process.env.SPAM_THRESHOLD_SCORE='5';
process.env.SPAM_BLOCK_SCORE='8';
process.env.MAX_EMAIL_SIZE='10485760';
process.env.BACKUP_DIR='/tmp/test-backups';
process.env.LOG_DIR='/tmp/test-logs';
const{initDatabase,runMigrations,closeDatabase,getDb}=require('../../database/database');
const{createAlias,getUserAliases,deleteAlias,getAllowedDomains}=require('../../src/services/aliasService');
beforeAll(()=>{initDatabase();runMigrations();getDb().prepare("INSERT INTO users(tg_id,username)VALUES(1001,'user1')").run();});
afterAll(()=>closeDatabase());
afterEach(()=>getDb().prepare('DELETE FROM aliases WHERE tg_id=1001').run());
describe('Alias Service',()=>{
  test('creates alias on allowed domain',()=>{const a=createAlias({tgId:1001,domain:'test.example.com',type:'throwaway'});expect(a.address).toMatch(/@test\.example\.com$/);expect(a.tg_id).toBe(1001);});
  test('rejects alias on disallowed domain',()=>{expect(()=>createAlias({tgId:1001,domain:'evil.com',type:'throwaway'})).toThrow('Domain not allowed');});
  test('enforces alias limit',()=>{for(let i=0;i<5;i++)createAlias({tgId:1001,domain:'test.example.com',type:'throwaway'});expect(()=>createAlias({tgId:1001,domain:'test.example.com',type:'throwaway'})).toThrow('Alias limit reached');});
  test('creates burner alias with expiry',()=>{const a=createAlias({tgId:1001,domain:'test.example.com',type:'burner',burner:true});expect(a.burner).toBe(1);expect(a.burner_expires_at).toBeDefined();expect(new Date(a.burner_expires_at).getTime()).toBeGreaterThan(Date.now());});
  test('deletes own alias',()=>{const a=createAlias({tgId:1001,domain:'test.example.com',type:'throwaway'});expect(deleteAlias(a.address,1001)).toBe(true);});
  test('cannot delete another users alias',()=>{const db=getDb();db.prepare("INSERT OR IGNORE INTO users(tg_id)VALUES(9999)").run();db.prepare("INSERT INTO aliases(address,tg_id,domain,alias_type)VALUES('other@test.example.com',9999,'test.example.com','throwaway')").run();expect(deleteAlias('other@test.example.com',1001)).toBe(false);});
  test('generates unique addresses',()=>{const addrs=new Set();for(let i=0;i<5;i++){const a=createAlias({tgId:1001,domain:'test.example.com',type:'throwaway'});addrs.add(a.address);}expect(addrs.size).toBe(5);});
  test('creates custom alias with -ca suffix appended automatically',()=>{
    const a = createAlias({ tgId: 1001, domain: 'test.example.com', customName: 'myalias' });
    expect(a.address).toBe('myalias-ca@test.example.com');
    expect(a.alias_type).toBe('custom');
  });
  test('creates custom alias preserving existing -ca suffix',()=>{
    const a = createAlias({ tgId: 1001, domain: 'test.example.com', customName: 'testuser-ca' });
    expect(a.address).toBe('testuser-ca@test.example.com');
  });
  test('blocks non-admin users from claiming admin or owner names',()=>{
    expect(()=>createAlias({ tgId: 1001, domain: 'test.example.com', customName: 'admin' })).toThrow(/reserved/i);
    expect(()=>createAlias({ tgId: 1001, domain: 'test.example.com', customName: 'owner' })).toThrow(/reserved/i);
    expect(()=>createAlias({ tgId: 1001, domain: 'test.example.com', customName: 'admin-ca' })).toThrow(/reserved/i);
    expect(()=>createAlias({ tgId: 1001, domain: 'test.example.com', customName: 'root' })).toThrow(/reserved/i);
  });
  test('allows admin user to create custom alias with reserved name',()=>{
    const db = getDb();
    db.prepare("INSERT OR IGNORE INTO users(tg_id,username,role)VALUES(7777,'adminuser','admin')").run();
    const a = createAlias({ tgId: 7777, domain: 'test.example.com', customName: 'admin' });
    expect(a.address).toBe('admin@test.example.com');
  });
  test('rejects custom alias with invalid characters',()=>{
    expect(()=>createAlias({ tgId: 1001, domain: 'test.example.com', customName: 'bad name!' })).toThrow(/invalid|alphanumeric/i);
  });
});
