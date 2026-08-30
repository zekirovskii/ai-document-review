import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import type { Logger } from './logger.js';
import type { RequestContext } from './types.js';

type ContextResponse = Response<unknown, RequestContext>;

const requestIdPattern = /^[A-Za-z0-9._-]{1,128}$/;

export const requestId = (request: Request, response: ContextResponse, next: NextFunction) => {
  const incoming = request.header('x-request-id');
  const value = incoming && requestIdPattern.test(incoming) ? incoming : randomUUID();
  response.locals.requestId = value;
  response.setHeader('x-request-id', value);
  next();
};

export const requestLogger = (logger: Logger) => (request: Request, response: ContextResponse, next: NextFunction) => {
  const startedAt = performance.now();
  response.on('finish', () => {
    logger.info('HTTP request completed', {
      requestId: response.locals.requestId,
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
      ...(response.locals.user ? { userId: response.locals.user.userId } : {}),
      ...(response.locals.organizationId ? { organizationId: response.locals.organizationId } : {}),
    });
  });
  next();
};
