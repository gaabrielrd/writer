declare module 'mammoth' {
  export interface ConvertResult {
    value: string;
    messages: Array<{
      type: 'warning' | 'error';
      message: string;
    }>;
  }

  export interface InputOptions {
    arrayBuffer?: ArrayBuffer;
    buffer?: Buffer;
    path?: string;
  }

  export function convertToHtml(
    input: InputOptions,
    options?: Record<string, unknown>,
  ): Promise<ConvertResult>;
  export function extractRawText(input: InputOptions): Promise<ConvertResult>;
}
