import type { CharacterData, DictionaryEntry, WordDetails } from './types';
export interface DictionaryClient {
    lookup(word: string): Promise<DictionaryEntry | null>;
    lookupAll(word: string): Promise<DictionaryEntry[]>;
    has(word: string): Promise<boolean>;
    describe(word: string): Promise<WordDetails | null>;
    character(char: string): Promise<CharacterData | null>;
    attribution(): Promise<string>;
    batch<F extends BatchFunction>(fn: F, items: string[]): Promise<BatchResults[F][]>;
}
export interface BatchResults {
    lookup: DictionaryEntry | null;
    lookupAll: DictionaryEntry[];
    has: boolean;
    describe: WordDetails | null;
    character: CharacterData | null;
}
export type BatchFunction = keyof BatchResults;
export interface ClientOptions {
    baseUrl: string;
    mode: 'zh' | 'cedict';
}
export declare function createClient({ baseUrl, mode }: ClientOptions): DictionaryClient;
