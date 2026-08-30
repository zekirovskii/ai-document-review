import { describe, expect, it, vi } from 'vitest';

import { claimNextProcessingJob, retryProcessingJob } from '../src/supabase-boundaries';

describe('claimNextProcessingJob', () => {
  it('invokes the database atomic-claim RPC with the worker identifier', async () => {
    const rpc = vi.fn(async () => ({
      data: { id: 'job-1', document_id: 'document-1', organization_id: 'organization-1', attempts: 1 },
      error: null,
    }));

    await expect(claimNextProcessingJob({ rpc }, 'worker-a')).resolves.toEqual({
      id: 'job-1',
      document_id: 'document-1',
      organization_id: 'organization-1',
      attempts: 1,
    });
    expect(rpc).toHaveBeenCalledWith('claim_next_processing_job', { p_claimed_by: 'worker-a' });
  });

  it('treats a null-composite RPC result as no available job', async () => {
    const rpc = vi.fn(async () => ({ data: { id: null, document_id: null, organization_id: null }, error: null }));

    await expect(claimNextProcessingJob({ rpc }, 'worker-a')).resolves.toBeNull();
  });

  it('propagates a claim RPC failure', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('claim unavailable') }));

    await expect(claimNextProcessingJob({ rpc }, 'worker-a')).rejects.toThrow('claim unavailable');
  });

  it('uses the same job ID when atomically scheduling a retry', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));

    await retryProcessingJob({ rpc }, 'job-1', 'STORAGE_DOWNLOAD_FAILED', '2026-01-01T00:00:05.000Z');

    expect(rpc).toHaveBeenCalledWith('retry_processing_job', {
      p_job_id: 'job-1',
      p_reason: 'STORAGE_DOWNLOAD_FAILED',
      p_next_attempt_at: '2026-01-01T00:00:05.000Z',
    });
  });
});
