import type { ClaimedProcessingJob, ProcessingResult } from './processor.js';

export interface PollingDependencies {
  claimNextJob(): Promise<ClaimedProcessingJob | null>;
  processJob(job: ClaimedProcessingJob): Promise<ProcessingResult>;
}

export const processAvailableJob = async (dependencies: PollingDependencies): Promise<boolean> => {
  const job = await dependencies.claimNextJob();
  if (!job?.id) return false;

  await dependencies.processJob(job);
  return true;
};
