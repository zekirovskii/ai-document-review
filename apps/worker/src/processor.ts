import { analysisOutputSchema, type AnalysisOutput } from '@goatech/shared';

export interface ClaimedProcessingJob {
  id: string;
  document_id: string;
  organization_id: string;
}

export interface StoredDocument {
  storagePath: string;
  originalFilename: string;
}

export interface ProcessingDependencies {
  loadDocument(job: ClaimedProcessingJob): Promise<StoredDocument | null>;
  downloadPdf(storagePath: string): Promise<Buffer | null>;
  extractText(input: Buffer): Promise<string>;
  analyze(text: string): unknown;
  complete(job: ClaimedProcessingJob, analysis: AnalysisOutput): Promise<void>;
  fail(job: ClaimedProcessingJob, reason: string): Promise<void>;
}

export type ProcessingResult =
  | { status: 'COMPLETED' }
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
    const analysis = analysisOutputSchema.safeParse(dependencies.analyze(text));
    if (!analysis.success) throw new Error('ANALYSIS_VALIDATION_FAILED');

    await dependencies.complete(job, analysis.data);
    return { status: 'COMPLETED' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'ANALYSIS_FAILED';
    await dependencies.fail(job, reason);
    return { status: 'FAILED', reason };
  }
};
