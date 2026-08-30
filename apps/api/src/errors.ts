import type { ErrorRequestHandler } from 'express';

import { serializeError, type Logger } from './logger.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = (message = 'Authentication required') =>
  new ApiError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Organization membership is required') =>
  new ApiError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found') =>
  new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message = 'Invalid document lifecycle state') => new ApiError(409, 'CONFLICT', message);
export const rateLimited = () => new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');

export const errorHandler = (logger: Logger): ErrorRequestHandler => (error, request, response, next) => {
  void next;
  const requestId = response.locals.requestId as string | undefined;
  if (error instanceof ApiError) {
    if (error.code !== 'RATE_LIMITED') {
      const log = error.status >= 500 ? logger.error : logger.warn;
      log('API request failed', { requestId, method: request.method, path: request.path, statusCode: error.status, errorCode: error.code });
    }
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  logger.error('Unexpected API error', { requestId, method: request.method, path: request.path, statusCode: 500, error: serializeError(error) });
  response.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
  });
};
