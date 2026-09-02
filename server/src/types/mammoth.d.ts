declare module "mammoth" {
  interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  const mammoth: {
    extractRawText(input: { buffer: Buffer }): Promise<MammothResult>;
  };
  export default mammoth;
}
