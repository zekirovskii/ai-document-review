import { createClient } from '@supabase/supabase-js';

import { deterministicAnalysisProvider } from './analysis.js';
import { extractTextFromPdf } from './extraction.js';
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
const supabase = createClient(
  required('SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
let lastRecoveryAt = 0;

const processOne = async () => {
  const now = Date.now();
  if (now - lastRecoveryAt >= 60000) {
    const { data: reapedCount, error: recoveryError } = await supabase.rpc('reap_stale_processing_jobs', {
      p_claimed_before: new Date(now - staleProcessingMs).toISOString(),
    });
    if (recoveryError) throw new Error('STALE_JOB_RECOVERY_FAILED');
    if (reapedCount > 0) console.warn(`Marked ${reapedCount} stale processing job(s) as failed`);
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
      console.info(`Processing job ${job.id}`);
      const result = await processClaimedJob(job, {
        loadDocument: async (claimedJob) => {
          const { data: document, error } = await supabase
            .from('documents')
            .select('storage_path, original_filename')
            .eq('id', claimedJob.document_id)
            .eq('organization_id', claimedJob.organization_id)
            .single();
          if (error || !document) return null;
          return { storagePath: document.storage_path, originalFilename: document.original_filename };
        },
        downloadPdf: async (storagePath) => {
          const { data: blob, error } = await supabase.storage.from('documents').download(storagePath);
          return error || !blob ? null : Buffer.from(await blob.arrayBuffer());
        },
        extractText: extractTextFromPdf,
        analyze: deterministicAnalysisProvider,
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
        },
        fail: async (claimedJob, reason) => {
          const { error } = await supabase.rpc('fail_processing_job', {
            p_job_id: claimedJob.id,
            p_reason: reason,
          });
          if (error) throw new Error('JOB_FAILURE_RECORDING_FAILED');
        },
      });

      if (result.status === 'COMPLETED') console.info(`Completed processing job ${job.id}`);
      else console.warn(`Failed processing job ${job.id}: ${result.reason}`);
      return result;
    },
  });
};

const run = async () => {
  for (;;) {
    try {
      if (!await processOne()) await new Promise((resolve) => setTimeout(resolve, interval));
    } catch (error) {
      console.error('Worker poll failed', error instanceof Error ? error.message : 'unknown');
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
};

run().catch((error) => {
  console.error('Worker startup failed', error instanceof Error ? error.message : 'unknown');
  process.exit(1);
});
