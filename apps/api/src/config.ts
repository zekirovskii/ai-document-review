export interface ApiConfig {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  maxPdfSizeBytes: number;
  corsOrigin: string;
}

const required = (environment: NodeJS.ProcessEnv, key: string): string => {
  const value = environment[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const getApiConfig = (environment: NodeJS.ProcessEnv = process.env): ApiConfig => {
  const port = Number(environment.API_PORT ?? 3001);
  const maxPdfSizeBytes = Number(environment.MAX_PDF_SIZE_BYTES ?? 10485760);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('API_PORT must be a positive integer');
  }
  if (!Number.isInteger(maxPdfSizeBytes) || maxPdfSizeBytes <= 0) throw new Error('MAX_PDF_SIZE_BYTES must be a positive integer');

  return {
    port,
    supabaseUrl: required(environment, 'SUPABASE_URL'),
    supabaseServiceRoleKey: required(environment, 'SUPABASE_SERVICE_ROLE_KEY'),
    maxPdfSizeBytes,
    corsOrigin: environment.CORS_ORIGIN ?? 'http://localhost:3000',
  };
};
