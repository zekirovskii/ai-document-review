import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createApp, type ApiDependencies } from '../src/app';
import { createLogger } from '../src/logger';

const organizationId = '11111111-1111-4111-8111-111111111111' as const;

const createDependencies = (lines: string[]): ApiDependencies => ({
  authVerifier: { verifyAccessToken: vi.fn(async () => ({ userId: 'user-1' })) },
  membershipResolver: { resolveOrganizationId: vi.fn(async () => organizationId as never) },
  documentsService: {
    list: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    updateAnalysis: vi.fn(async (_organizationId, _documentId, _userId, analysis) => analysis),
    approve: vi.fn(async () => {}),
  },
  uploadService: { upload: vi.fn(async () => {}), remove: vi.fn(async () => {}), createQueued: vi.fn(async () => { throw new Error('not configured'); }) },
  maxPdfSizeBytes: 1024,
  corsOrigin: 'http://localhost:3000',
  rateLimit: { windowMs: 60_000, maxRequests: 120, uploadMaxRequests: 10, mutationMaxRequests: 60 },
  logger: createLogger('api', 'info', (line) => lines.push(line)),
  readiness: { checkDatabase: vi.fn(async () => {}) },
  readinessTimeoutMs: 3000,
});

describe('API structured logging', () => {
  it('logs request completion without serializing authorization headers', async () => {
    const lines: string[] = [];
    const token = 'secret-access-token';
    const response = await request(createApp(createDependencies(lines)))
      .get('/documents')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', 'session=secret-cookie');

    expect(response.status).toBe(200);
    const entry = JSON.parse(lines.find((line) => line.includes('HTTP request completed')) ?? '{}');
    expect(entry).toMatchObject({ service: 'api', level: 'info', method: 'GET', path: '/documents', statusCode: 200, userId: 'user-1', organizationId });
    expect(entry.requestId).toBe(response.headers['x-request-id']);
    expect(JSON.stringify(entry)).not.toContain(token);
    expect(JSON.stringify(entry)).not.toContain('secret-cookie');
  });
});
