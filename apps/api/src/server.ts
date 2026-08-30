import { createApp } from './app.js';
import { createSupabaseAuthVerifier } from './auth.js';
import { getApiConfig } from './config.js';
import { createDocumentsService } from './documents.js';
import { createUploadService } from './upload.js';
import { createMembershipResolver } from './membership.js';
import { createLogger } from './logger.js';
import { createSupabaseAdminClient } from './supabase.js';
import { createSupabaseReadinessChecker } from './readiness.js';

const config = getApiConfig();
const logger = createLogger('api', config.logLevel);
const supabase = createSupabaseAdminClient(config);
const app = createApp({
  authVerifier: createSupabaseAuthVerifier(supabase),
  membershipResolver: createMembershipResolver(supabase),
  documentsService: createDocumentsService(supabase),
  uploadService: createUploadService(supabase),
  maxPdfSizeBytes: config.maxPdfSizeBytes,
  corsOrigin: config.corsOrigin,
  rateLimit: {
    windowMs: config.rateLimitWindowMs,
    maxRequests: config.rateLimitMaxRequests,
    uploadMaxRequests: config.uploadRateLimitMaxRequests,
    mutationMaxRequests: config.mutationRateLimitMaxRequests,
  },
  logger,
  readiness: createSupabaseReadinessChecker(supabase),
  readinessTimeoutMs: config.readinessTimeoutMs,
});

app.listen(config.port, () => {
  logger.info('API server started', { port: config.port });
});
