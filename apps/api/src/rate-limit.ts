import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';

import { rateLimited } from './errors.js';
import type { Logger } from './logger.js';

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

const createLimiter = (windowMs: number, limit: number, category: string, logger: Logger): RateLimitRequestHandler => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (request, response, next) => {
    logger.warn('Rate limit exceeded', { requestId: response.locals.requestId, path: request.path, clientIp: request.ip, rateLimitCategory: category });
    next(rateLimited());
  },
});

// Called once per Express app so each app instance has isolated in-memory counters.
export const createApiRateLimiters = (config: RateLimitConfig, logger: Logger): ApiRateLimiters => ({
  general: createLimiter(config.windowMs, config.maxRequests, 'general', logger),
  upload: createLimiter(config.windowMs, config.uploadMaxRequests, 'upload', logger),
  mutation: createLimiter(config.windowMs, config.mutationMaxRequests, 'mutation', logger),
});
