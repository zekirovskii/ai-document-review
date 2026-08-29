import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';

import { ApiError, errorHandler, notFound } from './errors.js';
import { parseDocumentId } from './documents.js';
import { newUpload, validatePdf } from './upload.js';
import { authenticate, resolveOrganization } from './middleware.js';
import type { AuthVerifier, DocumentsService, MembershipResolver, RequestContext, UploadService } from './types.js';

export interface ApiDependencies {
  authVerifier: AuthVerifier;
  membershipResolver: MembershipResolver;
  documentsService: DocumentsService;
  uploadService: UploadService;
  maxPdfSizeBytes: number;
  corsOrigin: string;
}

type ContextResponse = Response<unknown, RequestContext>;

export const createApp = (dependencies: ApiDependencies): Express => {
  const app = express();
  app.use(cors({ origin: dependencies.corsOrigin }));
  app.use(express.json());

  app.get('/health', (_request, response) => response.json({ status: 'ok' }));

  const protectedRoute = [
    authenticate(dependencies.authVerifier),
    resolveOrganization(dependencies.membershipResolver),
  ];
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: dependencies.maxPdfSizeBytes, files: 1 } });

  app.post('/documents', ...protectedRoute, upload.single('file'), async (request: Request, response: ContextResponse, next) => {
    try {
      if (!request.file) throw new ApiError(400, 'FILE_REQUIRED', 'A PDF file is required');
      validatePdf(request.file, dependencies.maxPdfSizeBytes);
      const organizationId = response.locals.organizationId!;
      const user = response.locals.user!;
      const { documentId, storagePath } = newUpload(organizationId, request.file.originalname);
      await dependencies.uploadService.upload(storagePath, request.file.buffer);
      try {
        const document = await dependencies.uploadService.createQueued({ documentId, organizationId, userId: user.userId, originalFilename: request.file.originalname, storagePath, fileSize: request.file.size });
        response.status(201).json({ document });
      } catch (error) {
        await dependencies.uploadService.remove(storagePath);
        throw error;
      }
    } catch (error) { next(error); }
  });

  app.get('/documents', ...protectedRoute, async (_request: Request, response: ContextResponse, next) => {
    try {
      const documents = await dependencies.documentsService.list(response.locals.organizationId!);
      response.json({ documents });
    } catch (error) {
      next(error);
    }
  });

  app.get('/documents/:id', ...protectedRoute, async (request: Request, response: ContextResponse, next) => {
    try {
      const documentId = typeof request.params.id === 'string'
        ? parseDocumentId(request.params.id)
        : null;
      if (!documentId) {
        throw notFound('Document not found');
      }
      const document = await dependencies.documentsService.findById(
        response.locals.organizationId!,
        documentId,
      );
      if (!document) {
        throw notFound('Document not found');
      }
      response.json({ document });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: Request, _response: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) next(new ApiError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_MULTIPART', 'Invalid upload request'));
    else next(error);
  });
  app.use(errorHandler);
  return app;
};
