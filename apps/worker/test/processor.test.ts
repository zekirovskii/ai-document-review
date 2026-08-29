import { describe, expect, it, vi } from 'vitest';

import { deterministicAnalysisProvider } from '../src/analysis';
import type { ClaimedProcessingJob, ProcessingDependencies } from '../src/processor';
import { processClaimedJob } from '../src/processor';

const job: ClaimedProcessingJob = {
  id: 'job-1',
  document_id: 'document-1',
  organization_id: 'organization-1',
};
const text = 'This agreement describes a contract between parties with a termination clause.';

const createDependencies = (overrides: Partial<ProcessingDependencies> = {}) => ({
  loadDocument: vi.fn(async () => ({ storagePath: 'organization-1/document-1/file.pdf', originalFilename: 'file.pdf' })),
  downloadPdf: vi.fn(async () => Buffer.from('%PDF-1.4')),
  extractText: vi.fn(async () => text),
  analyze: vi.fn(deterministicAnalysisProvider),
  complete: vi.fn(async () => {}),
  fail: vi.fn(async () => {}),
  ...overrides,
}) satisfies ProcessingDependencies;

describe('processClaimedJob', () => {
  it('validates and persists a successful same-tenant analysis', async () => {
    const dependencies = createDependencies();

    await expect(processClaimedJob(job, dependencies)).resolves.toEqual({ status: 'COMPLETED' });

    expect(dependencies.loadDocument).toHaveBeenCalledWith(job);
    expect(dependencies.complete).toHaveBeenCalledWith(job, expect.objectContaining({
      documentType: 'contract',
      language: 'en',
    }));
    expect(dependencies.fail).not.toHaveBeenCalled();
  });

  it('records a controlled failure when private Storage download fails', async () => {
    const dependencies = createDependencies({ downloadPdf: vi.fn(async () => null) });

    await expect(processClaimedJob(job, dependencies)).resolves.toEqual({ status: 'FAILED', reason: 'STORAGE_DOWNLOAD_FAILED' });
    expect(dependencies.complete).not.toHaveBeenCalled();
    expect(dependencies.fail).toHaveBeenCalledWith(job, 'STORAGE_DOWNLOAD_FAILED');
  });

  it('does not analyze or complete when extraction fails', async () => {
    const dependencies = createDependencies({ extractText: vi.fn(async () => { throw new Error('PDF_TEXT_EXTRACTION_FAILED'); }) });

    await processClaimedJob(job, dependencies);

    expect(dependencies.analyze).not.toHaveBeenCalled();
    expect(dependencies.complete).not.toHaveBeenCalled();
    expect(dependencies.fail).toHaveBeenCalledWith(job, 'PDF_TEXT_EXTRACTION_FAILED');
  });

  it('records no extractable text as a controlled failure', async () => {
    const dependencies = createDependencies({ extractText: vi.fn(async () => { throw new Error('NO_EXTRACTABLE_TEXT'); }) });

    await expect(processClaimedJob(job, dependencies)).resolves.toEqual({ status: 'FAILED', reason: 'NO_EXTRACTABLE_TEXT' });
    expect(dependencies.complete).not.toHaveBeenCalled();
    expect(dependencies.fail).toHaveBeenCalledWith(job, 'NO_EXTRACTABLE_TEXT');
  });

  it('records an analysis-provider failure without completing', async () => {
    const dependencies = createDependencies({ analyze: vi.fn(() => { throw new Error('ANALYSIS_FAILED'); }) });

    await expect(processClaimedJob(job, dependencies)).resolves.toEqual({ status: 'FAILED', reason: 'ANALYSIS_FAILED' });
    expect(dependencies.complete).not.toHaveBeenCalled();
    expect(dependencies.fail).toHaveBeenCalledWith(job, 'ANALYSIS_FAILED');
  });

  it('rejects malformed provider output before persistence', async () => {
    const dependencies = createDependencies({ analyze: vi.fn(() => ({ documentType: 'contract', language: '', summary: '', riskLevel: 'low', flags: [] })) });

    await expect(processClaimedJob(job, dependencies)).resolves.toEqual({ status: 'FAILED', reason: 'ANALYSIS_VALIDATION_FAILED' });
    expect(dependencies.complete).not.toHaveBeenCalled();
    expect(dependencies.fail).toHaveBeenCalledWith(job, 'ANALYSIS_VALIDATION_FAILED');
  });

  it('records a failure when completion persistence fails', async () => {
    const dependencies = createDependencies({ complete: vi.fn(async () => { throw new Error('ANALYSIS_PERSISTENCE_FAILED'); }) });

    await expect(processClaimedJob(job, dependencies)).resolves.toEqual({ status: 'FAILED', reason: 'ANALYSIS_PERSISTENCE_FAILED' });
    expect(dependencies.fail).toHaveBeenCalledWith(job, 'ANALYSIS_PERSISTENCE_FAILED');
  });

  it('does not swallow a failure-persistence error', async () => {
    const dependencies = createDependencies({
      downloadPdf: vi.fn(async () => null),
      fail: vi.fn(async () => { throw new Error('JOB_FAILURE_RECORDING_FAILED'); }),
    });

    await expect(processClaimedJob(job, dependencies)).rejects.toThrow('JOB_FAILURE_RECORDING_FAILED');
  });
});
