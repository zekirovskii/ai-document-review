import { describe, expect, it, vi } from 'vitest';

import { createAnalysisProvider } from '../src/analysis';
import { createLogger, type Logger } from '../src/logger';

describe('worker structured logging', () => {
  it('emits a structured lifecycle event with safe worker context', () => {
    const lines: string[] = [];
    const logger = createLogger('worker', 'info', (line) => lines.push(line));

    logger.info('Processing job started', { workerId: 'worker-1', jobId: 'job-1', documentId: 'document-1', organizationId: 'organization-1' });

    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      service: 'worker',
      level: 'info',
      message: 'Processing job started',
      workerId: 'worker-1',
      jobId: 'job-1',
      documentId: 'document-1',
      organizationId: 'organization-1',
    });
  });

  it('logs Gemini fallback without API key or document text', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } satisfies Logger;
    const apiKey = 'gemini-secret-key';
    const text = 'private document text';
    const provider = createAnalysisProvider({ provider: 'gemini', geminiApiKey: apiKey, logger }, () => ({
      models: { generateContent: vi.fn(async () => ({ text: '{not-json' })) },
    }));

    await provider.analyze({ text });

    expect(logger.warn).toHaveBeenCalledWith('Gemini analysis fallback used', {
      analysisProvider: 'gemini',
      errorCode: 'GEMINI_RESPONSE_PARSE_FAILED',
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(apiKey);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(text);
  });
});
