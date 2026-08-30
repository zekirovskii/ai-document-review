export const retryableProcessingErrorCodes = new Set([
  'STORAGE_DOWNLOAD_FAILED',
  'ANALYSIS_PERSISTENCE_FAILED',
]);

export const isRetryableProcessingError = (errorCode: string) => retryableProcessingErrorCodes.has(errorCode);

export const calculateRetryDelayMs = (attempt: number, baseDelayMs: number, maxDelayMs: number) =>
  Math.min(baseDelayMs * (2 ** Math.max(0, attempt - 1)), maxDelayMs);
