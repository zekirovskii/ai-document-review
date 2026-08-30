import { describe, expect, it } from 'vitest';

import { calculateRetryDelayMs, isRetryableProcessingError } from '../src/retry';

describe('retry policy', () => {
  it('classifies only transient infrastructure failures as retryable', () => {
    expect(isRetryableProcessingError('STORAGE_DOWNLOAD_FAILED')).toBe(true);
    expect(isRetryableProcessingError('ANALYSIS_PERSISTENCE_FAILED')).toBe(true);
    expect(isRetryableProcessingError('PDF_TEXT_EXTRACTION_FAILED')).toBe(false);
    expect(isRetryableProcessingError('NO_EXTRACTABLE_TEXT')).toBe(false);
    expect(isRetryableProcessingError('ANALYSIS_VALIDATION_FAILED')).toBe(false);
  });

  it('calculates deterministic exponential backoff with a cap', () => {
    expect(calculateRetryDelayMs(1, 5000, 60000)).toBe(5000);
    expect(calculateRetryDelayMs(2, 5000, 60000)).toBe(10000);
    expect(calculateRetryDelayMs(8, 5000, 60000)).toBe(60000);
  });
});
