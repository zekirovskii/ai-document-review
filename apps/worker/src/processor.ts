import { analysisOutputSchema, type AnalysisOutput } from '@goatech/shared';

import type { AnalysisInput } from './analysis.js';
import { calculateRetryDelayMs, isRetryableProcessingError } from './retry.js';

export interface ClaimedProcessingJob {
  id: string;
  document_id: string;
  organization_id: string;
  attempts: number;
}

export interface StoredDocument {
  storagePath: string;
  originalFilename: string;
}

export interface ProcessingDependencies {
  loadDocument(job: ClaimedProcessingJob): Promise<StoredDocument | null>;
  downloadPdf(storagePath: string): Promise<Buffer | null>;
  extractText(input: Buffer): Promise<string>;
  analyze(input: AnalysisInput): unknown | Promise<unknown>;
  complete(job: ClaimedProcessingJob, analysis: AnalysisOutput): Promise<void>;
  retry(job: ClaimedProcessingJob, reason: string, nextAttemptAt: string, retryDelayMs: number): Promise<void>;
  fail(job: ClaimedProcessingJob, reason: string): Promise<void>;
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}

export type ProcessingResult =
  | { status: 'COMPLETED' }
  | { status: 'RETRY_SCHEDULED'; reason: string; retryDelayMs: number; nextAttemptAt: string }
  | { status: 'FAILED'; reason: string };

export const processClaimedJob = async (
  job: ClaimedProcessingJob,
  dependencies: ProcessingDependencies,
): Promise<ProcessingResult> => {
  try {
    const document = await dependencies.loadDocument(job);
    if (!document) throw new Error('STORAGE_DOWNLOAD_FAILED');

    const pdf = await dependencies.downloadPdf(document.storagePath);
    if (!pdf) throw new Error('STORAGE_DOWNLOAD_FAILED');

    const text = await dependencies.extractText(pdf);
    const analysis = analysisOutputSchema.safeParse(await dependencies.analyze({
      text,
      filename: document.originalFilename,
    }));
    if (!analysis.success) throw new Error('ANALYSIS_VALIDATION_FAILED');

    await dependencies.complete(job, analysis.data);
    return { status: 'COMPLETED' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'ANALYSIS_FAILED';
    if (isRetryableProcessingError(reason) && job.attempts < dependencies.maxAttempts) {
      const retryDelayMs = calculateRetryDelayMs(job.attempts, dependencies.retryBaseDelayMs, dependencies.retryMaxDelayMs);
      const nextAttemptAt = new Date(Date.now() + retryDelayMs).toISOString();
      await dependencies.retry(job, reason, nextAttemptAt, retryDelayMs);
      return { status: 'RETRY_SCHEDULED', reason, retryDelayMs, nextAttemptAt };
    }
    await dependencies.fail(job, reason);
    return { status: 'FAILED', reason };
  }
};
