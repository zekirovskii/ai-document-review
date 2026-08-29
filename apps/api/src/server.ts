import { createApp } from './app.js';
import { createSupabaseAuthVerifier } from './auth.js';
import { getApiConfig } from './config.js';
import { createDocumentsService } from './documents.js';
import { createUploadService } from './upload.js';
import { createMembershipResolver } from './membership.js';
import { createSupabaseAdminClient } from './supabase.js';

const config = getApiConfig();
const supabase = createSupabaseAdminClient(config);
const app = createApp({
  authVerifier: createSupabaseAuthVerifier(supabase),
  membershipResolver: createMembershipResolver(supabase),
  documentsService: createDocumentsService(supabase),
  uploadService: createUploadService(supabase),
  maxPdfSizeBytes: config.maxPdfSizeBytes,
  corsOrigin: config.corsOrigin,
});

app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
});
