declare module 'qrcode-terminal' {
  export type GenerateOptions = {
    small?: boolean; // Default to false
  }

  export function generate(input: string, callback?: (output: string) => void): void;
  export function generate(input: string, options: GenerateOptions, callback?: (output: string) => void): void;

  export function setErrorLevel(error: 'L' | 'M' | 'Q' | 'H'): void;
}
