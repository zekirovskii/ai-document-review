import { z } from 'zod';

export const documentStatusValues = [
  'QUEUED',
  'PROCESSING',
  'REVIEW_REQUIRED',
  'APPROVED',
  'FAILED',
] as const;

export const documentStatusSchema = z.enum(documentStatusValues);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const organizationIdSchema = z.string().uuid().brand<'OrganizationId'>();
export type OrganizationId = z.infer<typeof organizationIdSchema>;

export const documentIdSchema = z.string().uuid().brand<'DocumentId'>();
export type DocumentId = z.infer<typeof documentIdSchema>;

export const processingJobIdSchema = z.string().uuid().brand<'ProcessingJobId'>();
export type ProcessingJobId = z.infer<typeof processingJobIdSchema>;

export const analysisOutputSchema = z.object({
  documentType: z.enum(['contract', 'invoice', 'report', 'other']),
  language: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  riskLevel: z.enum(['low', 'medium', 'high']),
  flags: z.array(z.string().trim().min(1)),
});

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;
