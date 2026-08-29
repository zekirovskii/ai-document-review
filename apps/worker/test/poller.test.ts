import { describe, expect, it, vi } from 'vitest';

import { processAvailableJob } from '../src/poller';
import type { ClaimedProcessingJob } from '../src/processor';

const firstJob: ClaimedProcessingJob = { id: 'job-1', document_id: 'document-1', organization_id: 'organization-1' };
const secondJob: ClaimedProcessingJob = { id: 'job-2', document_id: 'document-2', organization_id: 'organization-1' };

describe('processAvailableJob', () => {
  it('calls the claim boundary and exits cleanly when no job is available', async () => {
    const claimNextJob = vi.fn(async () => null);
    const processJob = vi.fn();

    await expect(processAvailableJob({ claimNextJob, processJob })).resolves.toBe(false);
    expect(claimNextJob).toHaveBeenCalledOnce();
    expect(processJob).not.toHaveBeenCalled();
  });

  it('passes the claimed job into processing without application-side claim logic', async () => {
    const claimNextJob = vi.fn(async () => firstJob);
    const processJob = vi.fn(async () => ({ status: 'COMPLETED' as const }));

    await expect(processAvailableJob({ claimNextJob, processJob })).resolves.toBe(true);
    expect(processJob).toHaveBeenCalledWith(firstJob);
  });

  it('can process a later job after an earlier document failure', async () => {
    const claimNextJob = vi.fn()
      .mockResolvedValueOnce(firstJob)
      .mockResolvedValueOnce(secondJob);
    const processJob = vi.fn()
      .mockResolvedValueOnce({ status: 'FAILED' as const, reason: 'PDF_TEXT_EXTRACTION_FAILED' })
      .mockResolvedValueOnce({ status: 'COMPLETED' as const });

    await expect(processAvailableJob({ claimNextJob, processJob })).resolves.toBe(true);
    await expect(processAvailableJob({ claimNextJob, processJob })).resolves.toBe(true);
    expect(processJob).toHaveBeenNthCalledWith(1, firstJob);
    expect(processJob).toHaveBeenNthCalledWith(2, secondJob);
  });
});
