import { describe, expect, it, vi } from 'vitest';

import { claimNextProcessingJob } from '../src/supabase-boundaries';

describe('claimNextProcessingJob', () => {
  it('invokes the database atomic-claim RPC with the worker identifier', async () => {
    const rpc = vi.fn(async () => ({
      data: { id: 'job-1', document_id: 'document-1', organization_id: 'organization-1' },
      error: null,
    }));

    await expect(claimNextProcessingJob({ rpc }, 'worker-a')).resolves.toEqual({
      id: 'job-1',
      document_id: 'document-1',
      organization_id: 'organization-1',
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
});
