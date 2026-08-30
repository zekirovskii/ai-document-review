import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app';
import type { ApiDependencies } from '../src/app';
import { ApiError } from '../src/errors';

const organizationId = '11111111-1111-4111-8111-111111111111' as const;
const documentId = '22222222-2222-4222-8222-222222222222' as const;

const createDependencies = (): ApiDependencies => ({
  authVerifier: { verifyAccessToken: vi.fn(async (token) => (token === 'valid-token' ? { userId: 'user-1' } : null)) },
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
  rateLimit: {
    windowMs: 60_000,
    maxRequests: 120,
    uploadMaxRequests: 10,
    mutationMaxRequests: 60,
  },
});

const rateLimitedDependencies = () => {
  const dependencies = createDependencies();
  dependencies.rateLimit = {
    windowMs: 60_000,
    maxRequests: 2,
    uploadMaxRequests: 1,
    mutationMaxRequests: 2,
  };
  return dependencies;
};

describe('API foundation', () => {
  it('serves health without authentication', async () => {
    const response = await request(createApp(createDependencies())).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('does not rate limit repeated health checks', async () => {
    const app = createApp(rateLimitedDependencies());

    for (let index = 0; index < 4; index += 1) {
      await expect(request(app).get('/health')).resolves.toMatchObject({ status: 200 });
    }
  });

  it('uses exactly one trusted proxy hop for the Railway reverse proxy', () => {
    expect(createApp(createDependencies()).get('trust proxy')).toBe(1);
  });

  it('allows the configured web origin to preflight document uploads', async () => {
    const response = await request(createApp(createDependencies()))
      .options('/documents')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('allows the loopback web origin configured for local development', async () => {
    const dependencies = createDependencies();
    dependencies.corsOrigin = 'http://localhost:3000,http://127.0.0.1:3000';
    const response = await request(createApp(dependencies))
      .options('/documents')
      .set('Origin', 'http://127.0.0.1:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
  });

  it('rejects a protected endpoint without a token', async () => {
    const response = await request(createApp(createDependencies())).get('/documents');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid token', async () => {
    const response = await request(createApp(createDependencies()))
      .get('/documents')
      .set('Authorization', 'Bearer invalid-token');
    expect(response.status).toBe(401);
  });

  it('keeps unauthenticated protected requests outside the authenticated rate-limit bucket', async () => {
    const app = createApp(rateLimitedDependencies());

    await expect(request(app).get('/documents')).resolves.toMatchObject({ status: 401 });
    await expect(request(app).get('/documents')).resolves.toMatchObject({ status: 401 });
  });

  it('limits general protected routes and returns the standard 429 error', async () => {
    const app = createApp(rateLimitedDependencies());

    await expect(request(app).get('/documents').set('Authorization', 'Bearer valid-token')).resolves.toMatchObject({ status: 200 });
    const second = await request(app).get('/documents').set('Authorization', 'Bearer valid-token');
    const limited = await request(app).get('/documents').set('Authorization', 'Bearer valid-token');

    expect(second.status).toBe(200);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });
    expect(limited.headers.ratelimit).toBeDefined();
  });

  it('uses the stricter upload limit before multipart processing', async () => {
    const app = createApp(rateLimitedDependencies());

    await expect(request(app).post('/documents').set('Authorization', 'Bearer valid-token')).resolves.toMatchObject({ status: 400 });
    const limited = await request(app).post('/documents').set('Authorization', 'Bearer valid-token');

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });

  it('shares the mutation limit between review edits and approvals', async () => {
    const app = createApp(rateLimitedDependencies());
    const analysis = { documentType: 'contract', language: 'en', summary: 'Summary', riskLevel: 'low', flags: [] };

    await expect(request(app).patch(`/documents/${documentId}/analysis`).set('Authorization', 'Bearer valid-token').send(analysis)).resolves.toMatchObject({ status: 200 });
    await expect(request(app).post(`/documents/${documentId}/approve`).set('Authorization', 'Bearer valid-token')).resolves.toMatchObject({ status: 200 });
    const limited = await request(app).patch(`/documents/${documentId}/analysis`).set('Authorization', 'Bearer valid-token').send(analysis);

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });

  it('returns a controlled denial when membership is missing', async () => {
    const dependencies = createDependencies();
    dependencies.membershipResolver.resolveOrganizationId = vi.fn(async () => {
      throw new ApiError(403, 'FORBIDDEN', 'Organization membership is required');
    });
    const response = await request(createApp(dependencies))
      .get('/documents')
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('uses the resolved organization for document listing', async () => {
    const dependencies = createDependencies();
    const response = await request(createApp(dependencies))
      .get('/documents')
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(200);
    expect(dependencies.documentsService.list).toHaveBeenCalledWith(organizationId);
  });

  it('returns 404 for a document outside the resolved organization', async () => {
    const response = await request(createApp(createDependencies()))
      .get(`/documents/${documentId}`)
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects invalid PDF uploads before storage', async () => {
    const dependencies = createDependencies();
    const response = await request(createApp(dependencies)).post('/documents').set('Authorization', 'Bearer valid-token').attach('file', Buffer.from('not-a-pdf'), { filename: 'fake.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(400);
    expect(dependencies.uploadService.upload).not.toHaveBeenCalled();
  });

  it('uploads a valid PDF and queues it without processing inline', async () => {
    const dependencies = createDependencies();
    dependencies.uploadService.createQueued = vi.fn(async (input) => ({ id: input.documentId, originalFilename: input.originalFilename, status: 'QUEUED' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }));
    const response = await request(createApp(dependencies)).post('/documents').set('Authorization', 'Bearer valid-token').attach('file', Buffer.from('%PDF-1.4\n'), { filename: '../agreement.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(201);
    expect(response.body.document.status).toBe('QUEUED');
    expect(dependencies.uploadService.upload).toHaveBeenCalledOnce();
    expect(dependencies.uploadService.createQueued).toHaveBeenCalledOnce();
  });
});
