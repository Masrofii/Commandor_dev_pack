'use strict';
const fs=require('fs');
const path=require('path');
const config=require('../../config/config');
class LocalStorageDriver{
  constructor(dir){this.dir=dir;if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});}
  _safe(fp){const r=path.resolve(this.dir,fp);if(!r.startsWith(path.resolve(this.dir)))throw new Error('Path traversal detected');return r;}
  async save(fp,data){const full=this._safe(fp);const d=path.dirname(full);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});fs.writeFileSync(full,data);return fp;}
  async read(fp){return fs.readFileSync(this._safe(fp));}
  async delete(fp){const full=this._safe(fp);if(fs.existsSync(full))fs.unlinkSync(full);}
  async exists(fp){try{return fs.existsSync(this._safe(fp));}catch{return false;}}
  async getSize(fp){try{return fs.statSync(this._safe(fp)).size;}catch{return 0;}}
  async getReadStream(fp){return fs.createReadStream(this._safe(fp));}
}
let _driver;
function getDriver(){if(!_driver)_driver=new LocalStorageDriver(config.storage.uploadDir);return _driver;}
module.exports={getDriver};
