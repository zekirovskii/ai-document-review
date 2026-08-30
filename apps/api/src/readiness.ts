import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReadinessChecker {
  checkDatabase(): Promise<void>;
}

const readinessJobId = '00000000-0000-0000-0000-000000000000';

export const createSupabaseReadinessChecker = (supabase: SupabaseClient): ReadinessChecker => ({
  async checkDatabase() {
    // This restricted RPC takes a row lock only after finding an active job. The
    // all-zero UUID cannot match an application-created UUID, so its expected
    // validation error proves the API can reach PostgreSQL without mutating data.
    const { error } = await supabase.rpc('retry_processing_job', {
      p_job_id: readinessJobId,
      p_reason: 'readiness-check',
      p_next_attempt_at: '2099-01-01T00:00:00.000Z',
    });

    if (error?.code === 'P0001' && error.message === 'Processing job is not active') return;
    throw new Error('DATABASE_READINESS_FAILED');
  },
});

export const withReadinessTimeout = async (check: Promise<void>, timeoutMs: number): Promise<void> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('READINESS_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};
