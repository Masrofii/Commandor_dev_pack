'use strict';
const{verifyWebSession}=require('../auth/sessions');
const{verifyApiKey}=require('../services/apiKeyService');
function extractToken(req){const ah=req.headers.authorization;if(ah?.startsWith('Bearer '))return ah.slice(7);if(req.cookies?.session_token)return req.cookies.session_token;if(typeof req.query?.token==='string'&&req.query.token)return req.query.token;return null;}
function requireAuth(req,res,next){const t=extractToken(req);if(!t)return res.status(401).json({error:'Unauthorized'});const s=verifyWebSession(t);if(!s)return res.status(401).json({error:'Session invalid or expired'});if(s.is_banned)return res.status(403).json({error:'Account suspended'});req.user=s;req.tgId=s.tg_id;next();}
function requireAdmin(req,res,next){
  const ah = req.headers.authorization;
  if (ah?.startsWith('Bearer tmk_')) {
    const k = verifyApiKey(ah.slice(7));
    if (!k) return res.status(401).json({ error: 'Invalid or revoked API key' });
    const { getDb } = require('../../database/database');
    const u = getDb().prepare('SELECT role FROM users WHERE tg_id=?').get(k.tg_id);
    const config = require('../../config/config');
    const isAdmin = (u?.role === 'admin') || (config.telegram?.adminId && (String(k.tg_id) === String(config.telegram.adminId)));
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
    req.apiKey = k;
    req.tgId = k.tg_id;
    req.user = { tg_id: k.tg_id, role: 'admin' };
    return next();
  }
  requireAuth(req, res, () => {
    const { getDb } = require('../../database/database');
    const u = getDb().prepare('SELECT role FROM users WHERE tg_id=?').get(req.user.tg_id);
    const config = require('../../config/config');
    const isAdmin = (u?.role === 'admin') || (req.user.role === 'admin') || (config.telegram?.adminId && (String(req.user.tg_id) === String(config.telegram.adminId)));
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}
function requireApiKey(scopes=[]){return(req,res,next)=>{const ah=req.headers.authorization;if(!ah?.startsWith('Bearer '))return res.status(401).json({error:'API key required'});const k=verifyApiKey(ah.slice(7));if(!k)return res.status(401).json({error:'Invalid or revoked API key'});const ks=JSON.parse(k.scopes||'[]');for(const s of scopes)if(!ks.includes(s))return res.status(403).json({error:`Missing scope: ${s}`});req.apiKey=k;req.tgId=k.tg_id;next();};}
function requireAuthOrApiKey(scopes=[]){return(req,res,next)=>{const ah=req.headers.authorization;if(ah?.startsWith('Bearer tmk_'))return requireApiKey(scopes)(req,res,next);return requireAuth(req,res,next);};}
module.exports={requireAuth,requireAdmin,requireApiKey,requireAuthOrApiKey};
