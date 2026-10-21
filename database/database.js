'use strict';
const Database=require('better-sqlite3');
const path=require('path');
const fs=require('fs');
const config=require('../config/config');
let db;
function getDb(){if(!db)throw new Error('DB not initialized');return db;}
function initDatabase(){
  const dbPath=config.database.path;
  const dbDir=path.dirname(dbPath);
  if(!fs.existsSync(dbDir))fs.mkdirSync(dbDir,{recursive:true});
  db=new Database(dbPath);
  db.pragma('journal_mode=WAL');
  db.pragma('foreign_keys=ON');
  db.pragma('synchronous=NORMAL');
  db.pragma('cache_size=-64000');
  db.pragma('busy_timeout=30000');
  db.pragma('temp_store=MEMORY');
  return db;
}
function runMigrations(){
  if(!db)initDatabase();
  const dir=path.join(__dirname,'migrations');
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
  db.exec(`CREATE TABLE IF NOT EXISTS migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,filename TEXT NOT NULL UNIQUE,applied_at DATETIME NOT NULL DEFAULT(datetime('now')))`);
  const applied=new Set(db.prepare('SELECT filename FROM migrations').all().map(r=>r.filename));
  for(const file of files){
    if(applied.has(file))continue;
    const sql=fs.readFileSync(path.join(dir,file),'utf8');
    try{db.exec(sql);db.prepare('INSERT INTO migrations(filename)VALUES(?)').run(file);console.log('Migration applied:',file);}
    catch(err){console.error('Migration failed:',file,err.message);throw err;}
  }
}
function closeDatabase(){if(db){db.close();db=null;}}
function transaction(fn){return getDb().transaction(fn);}
module.exports={initDatabase,getDb,runMigrations,closeDatabase,transaction};
