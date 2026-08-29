import pdf from 'pdf-parse';

export type PdfTextParser = (input: Buffer) => Promise<{ text: string }>;

const pdfParser: PdfTextParser = (input) => pdf(input);

export const extractTextFromPdf = async (input: Buffer, parser: PdfTextParser = pdfParser): Promise<string> => {
  let text: string;
  try {
    text = (await parser(input)).text.trim();
  } catch {
    throw new Error('PDF_TEXT_EXTRACTION_FAILED');
  }

  if (text.length < 40) {
    throw new Error('NO_EXTRACTABLE_TEXT');
  }

  return text;
};
