import type { ClaimedProcessingJob } from './processor.js';

export interface RpcClient {
  rpc(name: string, arguments_: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

export const claimNextProcessingJob = async (
  client: RpcClient,
  workerId: string,
): Promise<ClaimedProcessingJob | null> => {
  const { data, error } = await client.rpc('claim_next_processing_job', { p_claimed_by: workerId });
  if (error) throw error;

  const job = data as Partial<ClaimedProcessingJob> | null;
  return job?.id && job.document_id && job.organization_id && Number.isInteger(job.attempts)
    ? job as ClaimedProcessingJob
    : null;
};

export const retryProcessingJob = async (
  client: RpcClient,
  jobId: string,
  reason: string,
  nextAttemptAt: string,
) => {
  const { error } = await client.rpc('retry_processing_job', {
    p_job_id: jobId,
    p_reason: reason,
    p_next_attempt_at: nextAttemptAt,
  });
  if (error) throw error;
};
