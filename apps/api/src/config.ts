import { isLogLevel, type LogLevel } from './logger.js';

export interface ApiConfig {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  maxPdfSizeBytes: number;
  corsOrigin: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  uploadRateLimitMaxRequests: number;
  mutationRateLimitMaxRequests: number;
  logLevel: LogLevel;
}

const required = (environment: NodeJS.ProcessEnv, key: string): string => {
  const value = environment[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const getApiConfig = (environment: NodeJS.ProcessEnv = process.env): ApiConfig => {
  const port = Number(environment.PORT ?? environment.API_PORT ?? 3001);
  const maxPdfSizeBytes = Number(environment.MAX_PDF_SIZE_BYTES ?? 10485760);
  const rateLimitWindowMs = Number(environment.RATE_LIMIT_WINDOW_MS ?? 60000);
  const rateLimitMaxRequests = Number(environment.RATE_LIMIT_MAX_REQUESTS ?? 120);
  const uploadRateLimitMaxRequests = Number(environment.UPLOAD_RATE_LIMIT_MAX_REQUESTS ?? 10);
  const mutationRateLimitMaxRequests = Number(environment.MUTATION_RATE_LIMIT_MAX_REQUESTS ?? 60);
  const logLevel = environment.LOG_LEVEL ?? 'info';
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer');
  }
  if (!Number.isInteger(maxPdfSizeBytes) || maxPdfSizeBytes <= 0) throw new Error('MAX_PDF_SIZE_BYTES must be a positive integer');
  for (const [key, value] of [
    ['RATE_LIMIT_WINDOW_MS', rateLimitWindowMs],
    ['RATE_LIMIT_MAX_REQUESTS', rateLimitMaxRequests],
    ['UPLOAD_RATE_LIMIT_MAX_REQUESTS', uploadRateLimitMaxRequests],
    ['MUTATION_RATE_LIMIT_MAX_REQUESTS', mutationRateLimitMaxRequests],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
  }
  if (!isLogLevel(logLevel)) throw new Error('LOG_LEVEL must be debug, info, warn, or error');

  return {
    port,
    supabaseUrl: required(environment, 'SUPABASE_URL'),
    supabaseServiceRoleKey: required(environment, 'SUPABASE_SERVICE_ROLE_KEY'),
    maxPdfSizeBytes,
    corsOrigin: environment.CORS_ORIGIN ?? 'http://localhost:3000',
    rateLimitWindowMs,
    rateLimitMaxRequests,
    uploadRateLimitMaxRequests,
    mutationRateLimitMaxRequests,
    logLevel,
  };
};
