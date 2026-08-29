import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  analysisOutputSchema,
  documentIdSchema,
  documentStatusSchema,
  organizationIdSchema,
} from '@goatech/shared';

import { ApiError } from './errors.js';
import type { DocumentDetail, DocumentListItem, DocumentsService } from './types.js';

const documentRowSchema = z.object({
  id: documentIdSchema,
  original_filename: z.string(),
  status: documentStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

const analysisRowSchema = z.object({
  document_type: z.enum(['contract', 'invoice', 'report', 'other']),
  language: z.string(),
  summary: z.string(),
  risk_level: z.enum(['low', 'medium', 'high']),
  flags: z.array(z.string()),
});

const toDocumentListItem = (row: z.infer<typeof documentRowSchema>): DocumentListItem => ({
  id: row.id,
  originalFilename: row.original_filename,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createDocumentsService = (supabase: SupabaseClient): DocumentsService => ({
  async list(organizationId) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, original_filename, status, created_at, updated_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new ApiError(500, 'DATABASE_ERROR', 'Unable to load documents');
    }

    return z.array(documentRowSchema).parse(data ?? []).map(toDocumentListItem);
  },

  async findById(organizationId, documentId): Promise<DocumentDetail | null> {
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id, original_filename, status, created_at, updated_at')
      .eq('id', documentId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (documentError) {
      throw new ApiError(500, 'DATABASE_ERROR', 'Unable to load document');
    }
    if (!document) {
      return null;
    }

    const parsedDocument = documentRowSchema.parse(document);
    const { data: analysis, error: analysisError } = await supabase
      .from('analyses')
      .select('document_type, language, summary, risk_level, flags')
      .eq('document_id', documentId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (analysisError) {
      throw new ApiError(500, 'DATABASE_ERROR', 'Unable to load analysis');
    }

    const parsedAnalysis = analysis ? analysisRowSchema.parse(analysis) : null;
    return {
      ...toDocumentListItem(parsedDocument),
      analysis: parsedAnalysis
        ? analysisOutputSchema.parse({
            documentType: parsedAnalysis.document_type,
            language: parsedAnalysis.language,
            summary: parsedAnalysis.summary,
            riskLevel: parsedAnalysis.risk_level,
            flags: parsedAnalysis.flags,
          })
        : null,
    };
  },
});

export const parseDocumentId = (value: string) => {
  const result = documentIdSchema.safeParse(value);
  return result.success ? result.data : null;
};

export const parseOrganizationId = (value: string) => organizationIdSchema.parse(value);
