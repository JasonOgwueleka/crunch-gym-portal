/**
 * SEC-01: per-IP rate limiting for the unauthenticated auth endpoints
 * (login, register, forgot-password). Each endpoint has its own counter:
 * at most N requests per minute per IP (default 10), then HTTP 429.
 *
 * Package: express-rate-limit 8.7.5 (MIT). Counters are kept in memory,
 * which is fine for a single server process (see limitations).
 */
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config.js';
import { audit } from '../utils/audit.js';

export function authRateLimit(name) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: config.authRateLimitPerMinute,
    standardHeaders: 'draft-8', // RateLimit + RateLimit-Policy headers
    legacyHeaders: false,
    // req.ip is the socket address unless TRUST_PROXY is set, so a client
    // cannot choose its own IP by sending an X-Forwarded-For header.
    // ipKeyGenerator groups IPv6 addresses by /56 so one host can't rotate
    // through its IPv6 range to get fresh counters.
    keyGenerator: (req) => `${name}:${ipKeyGenerator(req.ip)}`,
    validate: { xForwardedForHeader: false },
    handler: async (req, res, next, options) => {
      await audit(req, 'auth.rate_limited', 'endpoint', name, {
        ip: req.ip,
        limit_per_minute: options.limit,
      }, null);
      res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
    },
  });
}
