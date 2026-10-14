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
  // Many words in few requests: one result per item, in order, e.g.
  // batch('describe', ['银行', '头发']). Long lists are split into requests
  // of at most 1000 items.
  batch<F extends BatchFunction>(fn: F, items: string[]): Promise<BatchResults[F][]>;
}

// What each function returns per item in a batch.
export interface BatchResults {
  lookup: DictionaryEntry | null;
  lookupAll: DictionaryEntry[];
  has: boolean;
  describe: WordDetails | null;
  character: CharacterData | null;
}

export type BatchFunction = keyof BatchResults;

// The server's limit per batch request.
const MAX_BATCH = 1000;

export interface ClientOptions {
  // Where the server runs, e.g. "https://dict.example.com".
  baseUrl: string;
  mode: 'zh' | 'cedict';
}

export function createClient({ baseUrl, mode }: ClientOptions): DictionaryClient {
  const base = `${baseUrl.replace(/\/+$/, '')}/v1/${mode}`;

  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`zh-dictionary: ${url}: HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  function get<T>(fn: string, q?: string): Promise<T> {
    return request(q === undefined ? `${base}/${fn}` : `${base}/${fn}?q=${encodeURIComponent(q)}`);
  }

  async function batch<F extends BatchFunction>(fn: F, items: string[]): Promise<BatchResults[F][]> {
    const chunks: string[][] = [];
    for (let i = 0; i < items.length; i += MAX_BATCH) chunks.push(items.slice(i, i + MAX_BATCH));
    const results = await Promise.all(chunks.map((q) => request<BatchResults[F][]>(`${base}/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q }),
    })));
    return results.flat() as BatchResults[F][];
  }

  return {
    lookup: (word) => get('lookup', word),
    lookupAll: (word) => get('lookupAll', word),
    has: (word) => get('has', word),
    describe: (word) => get('describe', word),
    character: (char) => get('character', char),
    attribution: async () => (await get<{ attribution: string }>('attribution')).attribution,
    batch,
  };
}
