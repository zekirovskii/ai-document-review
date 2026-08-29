import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { documentIdSchema, documentStatusSchema } from '@goatech/shared';
import { ApiError } from './errors.js';
import type { UploadService } from './types.js';

const createdSchema = z.object({ id: documentIdSchema, original_filename: z.string(), status: documentStatusSchema, created_at: z.string(), updated_at: z.string() });

export const safePdfFilename = (value: string) => {
  const base = basename(value).normalize('NFKC').replaceAll('/', '').replaceAll('\\', '').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^\.+/, '');
  const stem = base.replace(/\.pdf$/i, '').replace(/\.+$/, '');
  return `${stem || 'document'}.pdf`;
};

export const validatePdf = (file: Express.Multer.File, maxSize: number) => {
  if (file.mimetype !== 'application/pdf') throw new ApiError(400, 'INVALID_FILE_TYPE', 'Only PDF files are allowed');
  if (file.size > maxSize) throw new ApiError(413, 'FILE_TOO_LARGE', 'PDF exceeds the configured upload limit');
  if (!file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new ApiError(400, 'INVALID_PDF', 'File does not have a valid PDF signature');
};

export const createUploadService = (supabase: SupabaseClient): UploadService => ({
  async upload(path, content) {
    const { error } = await supabase.storage.from('documents').upload(path, content, { contentType: 'application/pdf', upsert: false });
    if (error) throw new ApiError(502, 'STORAGE_ERROR', 'Unable to store PDF');
  },
  async remove(path) { await supabase.storage.from('documents').remove([path]); },
  async createQueued(input) {
    const { data, error } = await supabase.rpc('create_queued_document', {
      p_document_id: input.documentId, p_organization_id: input.organizationId, p_uploaded_by: input.userId,
      p_original_filename: input.originalFilename, p_storage_path: input.storagePath, p_file_size: input.fileSize,
    });
    if (error) throw new ApiError(500, 'DATABASE_ERROR', 'Unable to queue document');
    const row = createdSchema.parse(data);
    return { id: row.id, originalFilename: row.original_filename, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
  },
});

export const newUpload = (organizationId: string, originalFilename: string) => {
  const documentId = documentIdSchema.parse(randomUUID());
  const storagePath = `${organizationId}/${documentId}/${safePdfFilename(originalFilename)}`;
  return { documentId, storagePath };
};
