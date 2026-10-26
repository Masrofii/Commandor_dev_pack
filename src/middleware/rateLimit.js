'use strict';
const rateLimit = require('express-rate-limit');

const shared = {
  standardHeaders: true,
  legacyHeaders: false
};

// General dashboard/API budget. The UI polls a few endpoints, so keep enough
// headroom for normal navigation while still bounding abuse.
const defaultLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: { error: 'Too many requests. Please slow down and try again shortly.' }
});

// Login and token exchange endpoints are deliberately much stricter.
const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts. Try again in 15 minutes.' }
});

// The inbound mail worker is a machine client, not the dashboard.
const incomingEmailLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Incoming mail rate limit exceeded' }
});

const apiLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => req.apiKey?.id ? `key:${req.apiKey.id}` : (req.user?.tg_id ? `user:${req.user.tg_id}` : req.ip),
  message: { error: 'API rate limit exceeded' }
});

module.exports = { defaultLimiter, authLimiter, incomingEmailLimiter, apiLimiter };
