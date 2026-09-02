declare module "pdf-parse" {
  interface PDFParseOptions {
    max?: number;
  }
  interface PDFInfo {
    PDFFormatVersion?: string;
    IsAcroFormPresent?: boolean;
    IsXFAPresent?: boolean;
    [key: string]: unknown;
  }
  interface PDFMetadata {
    info?: PDFInfo;
    metadata?: unknown;
    version?: string;
    numpages?: number;
    numrender?: number;
    text: string;
  }
  function pdfParse(
    dataBuffer: Buffer,
    options?: PDFParseOptions
  ): Promise<PDFMetadata>;
  export default pdfParse;
}
