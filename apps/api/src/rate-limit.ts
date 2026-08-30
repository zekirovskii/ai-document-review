import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';

import { rateLimited } from './errors.js';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  uploadMaxRequests: number;
  mutationMaxRequests: number;
}

export interface ApiRateLimiters {
  general: RateLimitRequestHandler;
  upload: RateLimitRequestHandler;
  mutation: RateLimitRequestHandler;
}

const createLimiter = (windowMs: number, limit: number): RateLimitRequestHandler => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, _response, next) => next(rateLimited()),
});

// Called once per Express app so each app instance has isolated in-memory counters.
export const createApiRateLimiters = (config: RateLimitConfig): ApiRateLimiters => ({
  general: createLimiter(config.windowMs, config.maxRequests),
  upload: createLimiter(config.windowMs, config.uploadMaxRequests),
  mutation: createLimiter(config.windowMs, config.mutationMaxRequests),
});
