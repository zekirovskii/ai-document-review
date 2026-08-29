import { describe, expect, it } from 'vitest';

import { analysisOutputSchema } from '@goatech/shared';

import { deterministicAnalysisProvider } from '../src/analysis';

describe('deterministicAnalysisProvider', () => {
  it('classifies contract-like text', () => {
    expect(deterministicAnalysisProvider('This agreement is a contract between two parties.').documentType).toBe('contract');
  });

  it('classifies invoice-like text', () => {
    expect(deterministicAnalysisProvider('Invoice number 42 is payable this month.').documentType).toBe('invoice');
  });

  it('classifies report-like text', () => {
    expect(deterministicAnalysisProvider('This assessment report describes the review findings.').documentType).toBe('report');
  });

  it('classifies unrelated text as other', () => {
    expect(deterministicAnalysisProvider('A short note about a picnic in the park.').documentType).toBe('other');
  });

  it('identifies likely Turkish text', () => {
    expect(deterministicAnalysisProvider('Bu sözleşme taraflar ile bir anlaşma için hazırlanmıştır.').language).toBe('tr');
  });

  it('identifies likely English text', () => {
    expect(deterministicAnalysisProvider('This agreement is between the customer and the supplier.').language).toBe('en');
  });

  it('turns configured risk keywords into flags and a high risk level', () => {
    const analysis = deterministicAnalysisProvider('A breach may result in a penalty and liability.');

    expect(analysis.flags).toEqual(expect.arrayContaining([
      'Risk keyword: breach',
      'Risk keyword: penalty',
      'Risk keyword: liability',
    ]));
    expect(analysis.riskLevel).toBe('high');
  });

  it('always produces a shared-schema-valid analysis result', () => {
    const texts = [
      'This agreement describes termination requirements.',
      'Fatura gecikmiş ödeme içerir ve ceza uygulanabilir.',
      'This assessment report has no notable concerns.',
      'A short note about a picnic in the park.',
    ];

    for (const text of texts) {
      expect(analysisOutputSchema.safeParse(deterministicAnalysisProvider(text)).success).toBe(true);
    }
  });
});
