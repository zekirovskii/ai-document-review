import express, { type Express, type Request, type Response } from 'express';

import { errorHandler, notFound } from './errors.js';
import { parseDocumentId } from './documents.js';
import { authenticate, resolveOrganization } from './middleware.js';
import type { AuthVerifier, DocumentsService, MembershipResolver, RequestContext } from './types.js';

export interface ApiDependencies {
  authVerifier: AuthVerifier;
  membershipResolver: MembershipResolver;
  documentsService: DocumentsService;
}

type ContextResponse = Response<unknown, RequestContext>;

export const createApp = (dependencies: ApiDependencies): Express => {
  const app = express();
  app.use(express.json());

  app.get('/health', (_request, response) => response.json({ status: 'ok' }));

  const protectedRoute = [
    authenticate(dependencies.authVerifier),
    resolveOrganization(dependencies.membershipResolver),
  ];

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

  app.use(errorHandler);
  return app;
};
