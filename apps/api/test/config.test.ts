import { describe, expect, it } from 'vitest';

import { getApiConfig } from '../src/config';

describe('getApiConfig', () => {
  it('uses Railway PORT ahead of the local API_PORT fallback', () => {
    const config = getApiConfig({
      PORT: '4567',
      API_PORT: '3001',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    expect(config.port).toBe(4567);
  });

  it('uses the documented rate-limit defaults', () => {
    const config = getApiConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    expect(config).toMatchObject({
      rateLimitWindowMs: 60_000,
      rateLimitMaxRequests: 120,
      uploadRateLimitMaxRequests: 10,
      mutationRateLimitMaxRequests: 60,
      logLevel: 'info',
    });
  });

  it('rejects invalid rate-limit configuration', () => {
    expect(() => getApiConfig({
      RATE_LIMIT_MAX_REQUESTS: '0',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    })).toThrow('RATE_LIMIT_MAX_REQUESTS must be a positive integer');
  });

  it('rejects an unsupported log level', () => {
    expect(() => getApiConfig({
      LOG_LEVEL: 'verbose',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    })).toThrow('LOG_LEVEL must be debug, info, warn, or error');
  });
});
