import { createClient } from '@supabase/supabase-js';

import { createAnalysisProvider } from './analysis.js';
import { extractTextFromPdf } from './extraction.js';
import { createLogger } from './logger.js';
import { processAvailableJob } from './poller.js';
import { processClaimedJob } from './processor.js';
import { claimNextProcessingJob } from './supabase-boundaries.js';

const required = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const positiveInteger = (key: string, fallback: number) => {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
  return value;
};

const interval = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000);
const workerId = process.env.WORKER_ID ?? 'local-worker-1';
const staleProcessingMs = positiveInteger('WORKER_STALE_PROCESSING_MS', 300000);
const logger = createLogger('worker', process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | undefined);
const analysisProvider = createAnalysisProvider({
  provider: process.env.ANALYSIS_PROVIDER,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  geminiMaxInputChars: process.env.GEMINI_MAX_INPUT_CHARS === undefined
    ? undefined
    : positiveInteger('GEMINI_MAX_INPUT_CHARS', 120000),
  logger,
});
const supabase = createClient(
  required('SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
let lastRecoveryAt = 0;

const jobContext = (job: { id: string; document_id: string; organization_id: string }) => ({
  workerId,
  jobId: job.id,
  documentId: job.document_id,
  organizationId: job.organization_id,
});

logger.info('Worker started', {
  workerId,
  pollIntervalMs: interval,
  staleProcessingMs,
  analysisProvider: process.env.ANALYSIS_PROVIDER ?? 'deterministic',
  ...(process.env.ANALYSIS_PROVIDER === 'gemini' ? { geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash' } : {}),
});

const processOne = async () => {
  const now = Date.now();
  if (now - lastRecoveryAt >= 60000) {
    const { data: reapedCount, error: recoveryError } = await supabase.rpc('reap_stale_processing_jobs', {
      p_claimed_before: new Date(now - staleProcessingMs).toISOString(),
    });
    if (recoveryError) throw new Error('STALE_JOB_RECOVERY_FAILED');
    if (reapedCount > 0) logger.warn('Stale processing jobs marked failed', { workerId, reapedCount });
    lastRecoveryAt = now;
  }

  return processAvailableJob({
    claimNextJob: () => claimNextProcessingJob({
      rpc: async (name, arguments_) => {
        const { data, error } = await supabase.rpc(name as never, arguments_ as never);
        return { data, error };
      },
    }, workerId),
    processJob: async (job) => {
      logger.info('Processing job started', jobContext(job));
      const result = await processClaimedJob(job, {
        loadDocument: async (claimedJob) => {
          const { data: document, error } = await supabase
            .from('documents')
            .select('storage_path, original_filename')
            .eq('id', claimedJob.document_id)
            .eq('organization_id', claimedJob.organization_id)
            .single();
          if (error || !document) {
            logger.warn('Document metadata load failed', { ...jobContext(claimedJob), errorCode: 'STORAGE_DOWNLOAD_FAILED' });
            return null;
          }
          return { storagePath: document.storage_path, originalFilename: document.original_filename };
        },
        downloadPdf: async (storagePath) => {
          const { data: blob, error } = await supabase.storage.from('documents').download(storagePath);
          if (error || !blob) {
            logger.warn('Document storage download failed', { ...jobContext(job), errorCode: 'STORAGE_DOWNLOAD_FAILED' });
            return null;
          }
          logger.info('Document storage download completed', jobContext(job));
          return Buffer.from(await blob.arrayBuffer());
        },
        extractText: async (pdf) => {
          try {
            const text = await extractTextFromPdf(pdf);
            logger.info('Document text extraction completed', jobContext(job));
            return text;
          } catch (error) {
            logger.warn('Document text extraction failed', { ...jobContext(job), errorCode: error instanceof Error ? error.message : 'PDF_TEXT_EXTRACTION_FAILED' });
            throw error;
          }
        },
        analyze: async (input) => {
          logger.info('Document analysis started', { ...jobContext(job), analysisProvider: process.env.ANALYSIS_PROVIDER ?? 'deterministic' });
          return analysisProvider.analyze(input);
        },
        complete: async (claimedJob, analysis) => {
          const { error } = await supabase.rpc('complete_processing_job', {
            p_job_id: claimedJob.id,
            p_document_type: analysis.documentType,
            p_language: analysis.language,
            p_summary: analysis.summary,
            p_risk_level: analysis.riskLevel,
            p_flags: analysis.flags,
          });
          if (error) throw new Error('ANALYSIS_PERSISTENCE_FAILED');
          logger.info('Document analysis validated and job completed', { ...jobContext(claimedJob), analysisProvider: process.env.ANALYSIS_PROVIDER ?? 'deterministic' });
        },
        fail: async (claimedJob, reason) => {
          const { error } = await supabase.rpc('fail_processing_job', {
            p_job_id: claimedJob.id,
            p_reason: reason,
          });
          if (error) throw new Error('JOB_FAILURE_RECORDING_FAILED');
          logger.warn('Processing job failed', { ...jobContext(claimedJob), errorCode: reason });
        },
      });

      return result;
    },
  });
};

const run = async () => {
  for (;;) {
    try {
      if (!await processOne()) await new Promise((resolve) => setTimeout(resolve, interval));
    } catch (error) {
      logger.error('Worker poll failed', { workerId, errorCode: error instanceof Error ? error.message : 'UNKNOWN' });
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
};

run().catch((error) => {
  logger.error('Worker startup failed', { workerId, errorCode: error instanceof Error ? error.message : 'UNKNOWN' });
  process.exit(1);
});
