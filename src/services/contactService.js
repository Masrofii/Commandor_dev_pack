'use strict';
const{getDb}=require('../../database/database');
function getContacts(tgId,search){const db=getDb();let q='SELECT * FROM contacts WHERE tg_id=?';const p=[tgId];if(search){q+=' AND(name LIKE ? OR email LIKE ?)';p.push(`%${search}%`,`%${search}%`);}q+=' ORDER BY name ASC';return db.prepare(q).all(...p);}
function createContact({tgId,name,email,notes,trusted}){const db=getDb();const r=db.prepare('INSERT INTO contacts(tg_id,name,email,notes,trusted)VALUES(?,?,?,?,?)').run(tgId,name,email.toLowerCase(),notes||null,trusted?1:0);return db.prepare('SELECT * FROM contacts WHERE id=?').get(r.lastInsertRowid);}
function deleteContact(id,tgId){return getDb().prepare('DELETE FROM contacts WHERE id=? AND tg_id=?').run(id,tgId).changes>0;}
module.exports={getContacts,createContact,deleteContact};
