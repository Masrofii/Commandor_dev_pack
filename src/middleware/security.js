'use strict';
const helmet=require('helmet');
const cors=require('cors');
const config=require('../../config/config');
function applySecurity(app){
  app.use(helmet({
    contentSecurityPolicy: false,
    hsts: config.isProduction ? {maxAge: 31536000, includeSubDomains: true} : false
  }));
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (config.server.corsOrigins.includes(origin)) return cb(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1|74\.248\.38\.38)(:\d+)?$/.test(origin)) return cb(null, true);
      if (/^https?:\/\/(.+\.)?commandor\.my\.id(:\d+)?$/.test(origin)) return cb(null, true);
      cb(null, false);
    },
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
module.exports={applySecurity};
