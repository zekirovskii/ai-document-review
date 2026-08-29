import { createClient } from '@supabase/supabase-js';
import { analysisOutputSchema } from '@goatech/shared';
import pdf from 'pdf-parse';

const required = (key: string) => { const value = process.env[key]; if (!value) throw new Error(`Missing required environment variable: ${key}`); return value; };
const interval = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000);
const workerId = process.env.WORKER_ID ?? 'local-worker-1';
const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });

const analyze = (text: string, filename = '') => {
  const lower = text.toLowerCase(); const terms = ['termination', 'penalty', 'breach', 'liability', 'lawsuit', 'overdue', 'fraud', 'fesih', 'ceza', 'ihlal', 'sorumluluk', 'dava', 'gecikmiş', 'dolandırıcılık'];
  const flags = terms.filter((term) => lower.includes(term)).map((term) => `Risk keyword: ${term}`);
  const documentType = /invoice|fatura/.test(lower) ? 'invoice' : /agreement|contract|sözleşme/.test(lower) ? 'contract' : /report|assessment|rapor/.test(lower) ? 'report' : 'other';
  const language = /\b(ve|ile|bir|için|sözleşme)\b/.test(lower) ? 'tr' : /\b(the|and|this|agreement)\b/.test(lower) ? 'en' : 'unknown';
  return { documentType, language, summary: text.replace(/\s+/g, ' ').slice(0, 500), riskLevel: flags.length >= 2 ? 'high' : flags.length ? 'medium' : 'low', flags } as const;
};

const processOne = async () => {
  const { data: job, error } = await supabase.rpc('claim_next_processing_job', { p_claimed_by: workerId });
  if (error) throw error; if (!job) return false;
  try {
    const { data: document, error: documentError } = await supabase.from('documents').select('storage_path, original_filename').eq('id', job.document_id).eq('organization_id', job.organization_id).single();
    if (documentError || !document) throw new Error('STORAGE_DOWNLOAD_FAILED');
    const { data: blob, error: storageError } = await supabase.storage.from('documents').download(document.storage_path);
    if (storageError || !blob) throw new Error('STORAGE_DOWNLOAD_FAILED');
    let text: string; try { text = (await pdf(Buffer.from(await blob.arrayBuffer()))).text.trim(); } catch { throw new Error('PDF_TEXT_EXTRACTION_FAILED'); }
    if (text.length < 40) throw new Error('NO_EXTRACTABLE_TEXT');
    const parsed = analysisOutputSchema.safeParse(analyze(text, document.original_filename));
    if (!parsed.success) throw new Error('ANALYSIS_VALIDATION_FAILED');
    const { error: completeError } = await supabase.rpc('complete_processing_job', { p_job_id: job.id, p_document_type: parsed.data.documentType, p_language: parsed.data.language, p_summary: parsed.data.summary, p_risk_level: parsed.data.riskLevel, p_flags: parsed.data.flags });
    if (completeError) throw new Error('ANALYSIS_PERSISTENCE_FAILED');
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : 'ANALYSIS_FAILED';
    await supabase.rpc('fail_processing_job', { p_job_id: job.id, p_reason: reason });
  }
  return true;
};

const run = async () => { for (;;) { try { if (!await processOne()) await new Promise((resolve) => setTimeout(resolve, interval)); } catch (error) { console.error('Worker poll failed', error instanceof Error ? error.message : 'unknown'); await new Promise((resolve) => setTimeout(resolve, interval)); } } };
run().catch((error) => { console.error('Worker startup failed', error instanceof Error ? error.message : 'unknown'); process.exit(1); });
