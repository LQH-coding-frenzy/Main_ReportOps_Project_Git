declare module 'docx-merger' {
  class DocxMerger {
    constructor(options: Record<string, unknown>, files: string[]);
    save(type: 'nodebuffer', callback: (data: Buffer) => void): void;
  }

  export = DocxMerger;
}
