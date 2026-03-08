declare module 'pos' {
  export class Lexer {
    lex(text: string): string[];
  }
  export class Tagger {
    tag(words: string[]): [string, string][];
    extendLexicon(lexicon: Record<string, string[]>): void;
  }
}
