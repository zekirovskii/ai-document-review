import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  analysisOutputSchema,
  documentIdSchema,
  documentStatusSchema,
  organizationIdSchema,
} from '@goatech/shared';

import { ApiError, conflict } from './errors.js';
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
  async updateAnalysis(organizationId, documentId, userId, analysis) {
    const existing = await this.findById(organizationId, documentId);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Document not found');
    if (existing.status !== 'REVIEW_REQUIRED') throw conflict();
    const { error } = await supabase.rpc('update_review_analysis', { p_document_id: documentId, p_organization_id: organizationId, p_user_id: userId, p_document_type: analysis.documentType, p_language: analysis.language, p_summary: analysis.summary, p_risk_level: analysis.riskLevel, p_flags: analysis.flags });
    if (error) throw new ApiError(500, 'DATABASE_ERROR', 'Unable to update analysis');
    return analysis;
  },
  async approve(organizationId, documentId, userId) {
    const existing = await this.findById(organizationId, documentId);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Document not found');
    if (existing.status !== 'REVIEW_REQUIRED') throw conflict();
    if (!existing.analysis) throw new ApiError(500, 'INVALID_ANALYSIS', 'Persisted analysis is invalid');
    analysisOutputSchema.parse(existing.analysis);
    const { error } = await supabase.rpc('approve_document', { p_document_id: documentId, p_organization_id: organizationId, p_user_id: userId });
    if (error) throw new ApiError(500, 'DATABASE_ERROR', 'Unable to approve document');
  },
});

export const parseDocumentId = (value: string) => {
  const result = documentIdSchema.safeParse(value);
  return result.success ? result.data : null;
};

export const parseOrganizationId = (value: string) => organizationIdSchema.parse(value);
