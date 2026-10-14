import type { CharacterData, DictionaryEntry, WordDetails } from './types';

// Same functions as the zh / cedict modes, answered by the server in
// server/ instead of bundled data. Every call is a network request, so every
// function returns a Promise.
export interface DictionaryClient {
  lookup(word: string): Promise<DictionaryEntry | null>;
  lookupAll(word: string): Promise<DictionaryEntry[]>;
  has(word: string): Promise<boolean>;
  describe(word: string): Promise<WordDetails | null>;
  character(char: string): Promise<CharacterData | null>;
  // Credit line that apps using this mode must display.
  attribution(): Promise<string>;
}

export interface ClientOptions {
  // Where the server runs, e.g. "https://dict.example.com".
  baseUrl: string;
  mode: 'zh' | 'cedict';
}

export function createClient({ baseUrl, mode }: ClientOptions): DictionaryClient {
  const base = `${baseUrl.replace(/\/+$/, '')}/v1/${mode}`;

  async function get<T>(fn: string, q?: string): Promise<T> {
    const url = q === undefined ? `${base}/${fn}` : `${base}/${fn}?q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`zh-dictionary: ${url}: HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  return {
    lookup: (word) => get('lookup', word),
    lookupAll: (word) => get('lookupAll', word),
    has: (word) => get('has', word),
    describe: (word) => get('describe', word),
    character: (char) => get('character', char),
    attribution: async () => (await get<{ attribution: string }>('attribution')).attribution,
  };
}
