import { describe, expect, it, vi } from 'vitest';

import { analysisOutputSchema } from '@goatech/shared';

import {
  DEFAULT_GEMINI_MAX_INPUT_CHARS,
  DEFAULT_GEMINI_MODEL,
  createAnalysisProvider,
  type GeminiClient,
  type GeminiGenerateContentRequest,
} from '../src/analysis';

const validAnalysis = {
  documentType: 'contract',
  language: 'en',
  summary: 'A concise contract summary.',
  riskLevel: 'medium',
  flags: ['Contains a termination clause.'],
};

const createClient = (response: { text?: string } | Error) => {
  const generateContent = vi.fn(async (_request: GeminiGenerateContentRequest) => {
    void _request;
    if (response instanceof Error) throw response;
    return response;
  });
  return { models: { generateContent } } satisfies GeminiClient;
};

describe('Gemini analysis provider', () => {
  it('accepts a valid structured Gemini response and sends the configured JSON schema', async () => {
    const client = createClient({ text: JSON.stringify(validAnalysis) });
    const provider = createAnalysisProvider(
      { provider: 'gemini', geminiApiKey: 'test-key' },
      () => client,
    );

    await expect(provider.analyze({ text: 'A contract with a termination clause.' })).resolves.toEqual(validAnalysis);
    expect(client.models.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_GEMINI_MODEL,
      config: expect.objectContaining({
        responseMimeType: 'application/json',
        responseJsonSchema: expect.objectContaining({
          required: ['documentType', 'language', 'summary', 'riskLevel', 'flags'],
        }),
      }),
    }));
  });

  it('truncates Gemini input deterministically to the configured limit', async () => {
    const client = createClient({ text: JSON.stringify(validAnalysis) });
    const provider = createAnalysisProvider(
      { provider: 'gemini', geminiApiKey: 'test-key', geminiMaxInputChars: 12 },
      () => client,
    );

    await provider.analyze({ text: '123456789012345' });

    expect(client.models.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      contents: expect.stringContaining('123456789012'),
    }));
    expect(client.models.generateContent.mock.calls[0]?.[0].contents).not.toContain('1234567890123');
  });

  it('uses deterministic fallback when Gemini returns malformed JSON', async () => {
    const client = createClient({ text: '{not json' });
    const provider = createAnalysisProvider({ provider: 'gemini', geminiApiKey: 'test-key' }, () => client);

    const result = await provider.analyze({ text: 'Invoice number 42 is payable.' });

    expect(result.documentType).toBe('invoice');
    expect(analysisOutputSchema.safeParse(result).success).toBe(true);
  });

  it('uses deterministic fallback when Gemini returns invalid schema values', async () => {
    const client = createClient({ text: JSON.stringify({ ...validAnalysis, riskLevel: 'urgent' }) });
    const provider = createAnalysisProvider({ provider: 'gemini', geminiApiKey: 'test-key' }, () => client);

    const result = await provider.analyze({ text: 'This agreement has a breach clause.' });

    expect(result.documentType).toBe('contract');
    expect(result.riskLevel).toBe('medium');
    expect(analysisOutputSchema.safeParse(result).success).toBe(true);
  });

  it('uses deterministic fallback when the Gemini request fails', async () => {
    const client = createClient(new Error('network unavailable'));
    const provider = createAnalysisProvider({ provider: 'gemini', geminiApiKey: 'test-key' }, () => client);

    await expect(provider.analyze({ text: 'This report has no concerns.' })).resolves.toMatchObject({
      documentType: 'report',
    });
  });

  it('fails Gemini configuration without an API key', () => {
    expect(() => createAnalysisProvider({ provider: 'gemini' })).toThrow(
      'GEMINI_API_KEY is required when ANALYSIS_PROVIDER=gemini',
    );
  });

  it('does not construct or invoke a Gemini client in deterministic mode', async () => {
    const createGeminiClient = vi.fn(() => createClient({ text: JSON.stringify(validAnalysis) }));
    const provider = createAnalysisProvider({ provider: 'deterministic' }, createGeminiClient);

    await expect(provider.analyze({ text: 'Invoice number 42 is payable.' })).resolves.toMatchObject({
      documentType: 'invoice',
    });
    expect(createGeminiClient).not.toHaveBeenCalled();
  });

  it('uses the documented default input limit', () => {
    expect(DEFAULT_GEMINI_MAX_INPUT_CHARS).toBe(120_000);
  });
});
