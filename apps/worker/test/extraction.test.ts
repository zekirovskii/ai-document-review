import { describe, expect, it, vi } from 'vitest';

import { extractTextFromPdf, type PdfTextParser } from '../src/extraction';

const textBasedPdf = Buffer.from('%PDF-1.4\nsynthetic text-based PDF fixture');
const meaningfulText = 'This text-based contract contains enough selectable content for the worker test.';

describe('extractTextFromPdf', () => {
  it('returns meaningful text from a text-based PDF parser result', async () => {
    const parser: PdfTextParser = vi.fn(async () => ({ text: meaningfulText }));

    await expect(extractTextFromPdf(textBasedPdf, parser)).resolves.toBe(meaningfulText);
    expect(parser).toHaveBeenCalledWith(textBasedPdf);
  });

  it('converts invalid PDF parser failures to a controlled extraction failure', async () => {
    const parser: PdfTextParser = vi.fn(async () => { throw new Error('invalid bytes'); });

    await expect(extractTextFromPdf(Buffer.from('not a PDF'), parser)).rejects.toThrow('PDF_TEXT_EXTRACTION_FAILED');
  });

  it('rejects PDFs with no meaningful selectable text', async () => {
    const parser: PdfTextParser = vi.fn(async () => ({ text: '   \n tiny text \t' }));

    await expect(extractTextFromPdf(textBasedPdf, parser)).rejects.toThrow('NO_EXTRACTABLE_TEXT');
  });

  it('trims outer extracted whitespace without changing meaningful text', async () => {
    const parser: PdfTextParser = vi.fn(async () => ({ text: `  ${meaningfulText}  \n` }));

    await expect(extractTextFromPdf(textBasedPdf, parser)).resolves.toBe(meaningfulText);
  });
});
