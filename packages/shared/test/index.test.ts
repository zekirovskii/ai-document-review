import { describe, expect, it } from 'vitest';

import { analysisOutputSchema, documentStatusSchema } from '../src';

describe('shared domain schemas', () => {
  it('accepts every allowed document status', () => {
    expect(documentStatusSchema.options).toEqual([
      'QUEUED',
      'PROCESSING',
      'REVIEW_REQUIRED',
      'APPROVED',
      'FAILED',
    ]);
  });

  it('accepts the required analysis result shape', () => {
    expect(
      analysisOutputSchema.parse({
        documentType: 'contract',
        language: 'en',
        summary: 'A valid summary.',
        riskLevel: 'medium',
        flags: ['Auto-renewal clause'],
      }),
    ).toMatchObject({ documentType: 'contract', riskLevel: 'medium' });
  });

  it('rejects incomplete analysis results', () => {
    expect(
      analysisOutputSchema.safeParse({
        documentType: 'contract',
        language: 'en',
        summary: 'Missing required fields.',
      }).success,
    ).toBe(false);
  });
});
