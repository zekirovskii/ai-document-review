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
});
