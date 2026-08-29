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
  },
});

describe('API foundation', () => {
  it('serves health without authentication', async () => {
    const response = await request(createApp(createDependencies())).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
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
});
