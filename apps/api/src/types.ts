import type { AnalysisOutput, DocumentId, DocumentStatus, OrganizationId } from '@goatech/shared';

export interface AuthenticatedUser {
  userId: string;
  email?: string;
}

export interface RequestContext {
  requestId?: string;
  user?: AuthenticatedUser;
  organizationId?: OrganizationId;
}

export interface DocumentListItem {
  id: DocumentId;
  originalFilename: string;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentListItem {
  analysis: AnalysisOutput | null;
}

export interface AuthVerifier {
  verifyAccessToken(token: string): Promise<AuthenticatedUser | null>;
}

export interface MembershipResolver {
  resolveOrganizationId(userId: string): Promise<OrganizationId>;
}

export interface DocumentsService {
  list(organizationId: OrganizationId): Promise<DocumentListItem[]>;
  findById(organizationId: OrganizationId, documentId: DocumentId): Promise<DocumentDetail | null>;
  updateAnalysis(organizationId: OrganizationId, documentId: DocumentId, userId: string, analysis: AnalysisOutput): Promise<AnalysisOutput>;
  approve(organizationId: OrganizationId, documentId: DocumentId, userId: string): Promise<void>;
}

export interface UploadService {
  upload(path: string, content: Buffer): Promise<void>;
  remove(path: string): Promise<void>;
  createQueued(input: { documentId: DocumentId; organizationId: OrganizationId; userId: string; originalFilename: string; storagePath: string; fileSize: number }): Promise<DocumentListItem>;
}
