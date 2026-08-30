import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), '../../supabase/migrations/00011_retry_processing_jobs.sql'), 'utf8');

describe('retry scheduling migration', () => {
  it('does not claim retries before their scheduled time while keeping eligible retries claimable', () => {
    expect(migration).toContain("job.status = 'QUEUED'");
    expect(migration).toContain('(job.next_attempt_at is null or job.next_attempt_at <= now())');
    expect(migration).toContain('for update of job, doc skip locked');
  });

  it('requeues the active job in place and clears its claim metadata', () => {
    expect(migration).toContain('create function public.retry_processing_job');
    expect(migration).toContain("status = 'QUEUED'");
    expect(migration).toContain('claimed_at = null');
    expect(migration).toContain('claimed_by = null');
    expect(migration).toContain("'PROCESSING_RETRY_SCHEDULED'");
  });
});
