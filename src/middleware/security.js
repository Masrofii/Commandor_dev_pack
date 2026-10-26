'use strict';
const helmet=require('helmet');
const cors=require('cors');
const config=require('../../config/config');
function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins() {
  const allowed = new Set();
  for (const value of config.server.corsOrigins || []) {
    const origin = normalizeOrigin(value);
    if (origin) allowed.add(origin);
  }
  // The dashboard web URL and the public API URL are first-party origins even
  // when the operator has not repeated them in CORS_ORIGINS.
  for (const value of [config.server.webUrl, config.server.baseUrl]) {
    const origin = normalizeOrigin(value);
    if (origin) allowed.add(origin);
  }
  return allowed;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (getAllowedOrigins().has(origin)) return true;
  // Local development convenience only. Production relies exclusively on
  // configured origins so a random local process cannot call the API.
  return !config.isProduction &&
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
}

function applySecurity(app){
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: config.isProduction ? {maxAge: 31536000, includeSubDomains: true} : false
  }));
  app.use(cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  }));
  const express=require('express');
  // The SMTP ingest endpoint must always receive raw bytes, even when the
  // relay omits or mislabels Content-Type.
  app.use('/api/incoming',express.raw({type:()=>true,limit:'25mb'}));
  app.use(express.json({limit:'2mb'}));
  app.use(express.urlencoded({extended:true,limit:'2mb'}));
}
module.exports={applySecurity,isAllowedOrigin};
