import type { AnalysisOutput } from '@goatech/shared';

export type AnalysisProvider = (text: string) => AnalysisOutput;

export const deterministicAnalysisProvider: AnalysisProvider = (text) => {
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
