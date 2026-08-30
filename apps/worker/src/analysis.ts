import { GoogleGenAI } from '@google/genai';
import { analysisOutputSchema, type AnalysisOutput } from '@goatech/shared';

export const DEFAULT_ANALYSIS_PROVIDER = 'deterministic';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
// This is deliberately far below Gemini 2.5 Flash's context window to bound cost and request size.
export const DEFAULT_GEMINI_MAX_INPUT_CHARS = 120_000;

export interface AnalysisInput {
  text: string;
  filename?: string;
}

export interface AnalysisProvider {
  analyze(input: AnalysisInput): Promise<AnalysisOutput>;
}

export interface GeminiGenerateContentRequest {
  model: string;
  contents: string;
  config: {
    responseMimeType: 'application/json';
    responseJsonSchema: object;
  };
}

export interface GeminiClient {
  models: {
    generateContent(request: GeminiGenerateContentRequest): Promise<{ text?: string }>;
  };
}

export interface AnalysisProviderConfig {
  provider?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiMaxInputChars?: number;
}

const analysisJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    documentType: { type: 'string', enum: ['contract', 'invoice', 'report', 'other'] },
    language: { type: 'string' },
    summary: { type: 'string' },
    riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
    flags: { type: 'array', items: { type: 'string' } },
  },
  required: ['documentType', 'language', 'summary', 'riskLevel', 'flags'],
} as const;

const promptFor = (text: string) => `Analyze the extracted PDF text below. Return only a JSON object matching the requested schema. Do not use markdown, prose outside JSON, or extra fields.

- documentType must be one of contract, invoice, report, other.
- language must be the detected primary language.
- summary must be concise and must not reproduce the full document.
- riskLevel must be one of low, medium, high.
- flags must contain short, human-readable review concerns, or [] when there are none.

Extracted document text:
${text}`;

const truncateForGemini = (text: string, maxInputChars: number) => text.slice(0, maxInputChars);

export const deterministicAnalysisProvider = (text: string): AnalysisOutput => {
  const lower = text.toLowerCase();
  const terms = [
    'termination', 'penalty', 'breach', 'liability', 'lawsuit', 'overdue', 'fraud',
    'fesih', 'ceza', 'ihlal', 'sorumluluk', 'dava', 'gecikmiş', 'dolandırıcılık',
  ];
  const flags = terms.filter((term) => lower.includes(term)).map((term) => `Risk keyword: ${term}`);
  const documentType = /invoice|fatura/.test(lower)
    ? 'invoice'
    : /agreement|contract|sözleşme/.test(lower)
      ? 'contract'
      : /report|assessment|rapor/.test(lower)
        ? 'report'
        : 'other';
  const language = /\b(ve|ile|bir|için|sözleşme)\b/.test(lower)
    ? 'tr'
    : /\b(the|and|this|agreement)\b/.test(lower)
      ? 'en'
      : 'unknown';

  return {
    documentType,
    language,
    summary: text.replace(/\s+/g, ' ').slice(0, 500),
    riskLevel: flags.length >= 2 ? 'high' : flags.length ? 'medium' : 'low',
    flags,
  };
};

export class DeterministicAnalysisProvider implements AnalysisProvider {
  async analyze({ text }: AnalysisInput): Promise<AnalysisOutput> {
    return deterministicAnalysisProvider(text);
  }
}

export class GeminiAnalysisProvider implements AnalysisProvider {
  constructor(
    private readonly client: GeminiClient,
    private readonly model: string,
    private readonly maxInputChars: number,
  ) {}

  async analyze({ text }: AnalysisInput): Promise<AnalysisOutput> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: promptFor(truncateForGemini(text, this.maxInputChars)),
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: analysisJsonSchema,
      },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text ?? '');
    } catch {
      throw new Error('GEMINI_RESPONSE_PARSE_FAILED');
    }

    const analysis = analysisOutputSchema.safeParse(parsed);
    if (!analysis.success) throw new Error('GEMINI_RESPONSE_VALIDATION_FAILED');
    return analysis.data;
  }
}

class GeminiFallbackAnalysisProvider implements AnalysisProvider {
  constructor(
    private readonly gemini: AnalysisProvider,
    private readonly deterministic: AnalysisProvider,
  ) {}

  async analyze(input: AnalysisInput): Promise<AnalysisOutput> {
    try {
      return await this.gemini.analyze(input);
    } catch (error) {
      const category = error instanceof Error
        && ['GEMINI_RESPONSE_PARSE_FAILED', 'GEMINI_RESPONSE_VALIDATION_FAILED'].includes(error.message)
        ? error.message
        : 'GEMINI_REQUEST_FAILED';
      console.warn(`Gemini analysis failed (${category}); using deterministic fallback`);
      return this.deterministic.analyze(input);
    }
  }
}

export const createAnalysisProvider = (
  config: AnalysisProviderConfig,
  createGeminiClient: (apiKey: string) => GeminiClient = (apiKey) => new GoogleGenAI({ apiKey }),
): AnalysisProvider => {
  const provider = config.provider ?? DEFAULT_ANALYSIS_PROVIDER;
  const deterministic = new DeterministicAnalysisProvider();

  if (provider === 'deterministic') return deterministic;
  if (provider !== 'gemini') throw new Error(`Unknown ANALYSIS_PROVIDER: ${provider}`);
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is required when ANALYSIS_PROVIDER=gemini');

  const maxInputChars = config.geminiMaxInputChars ?? DEFAULT_GEMINI_MAX_INPUT_CHARS;
  if (!Number.isInteger(maxInputChars) || maxInputChars <= 0) {
    throw new Error('GEMINI_MAX_INPUT_CHARS must be a positive integer');
  }

  const gemini = new GeminiAnalysisProvider(
    createGeminiClient(config.geminiApiKey),
    config.geminiModel || DEFAULT_GEMINI_MODEL,
    maxInputChars,
  );
  return new GeminiFallbackAnalysisProvider(gemini, deterministic);
};
