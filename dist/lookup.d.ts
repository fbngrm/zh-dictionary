import type { Dictionary, DictionaryEntry } from './types';
declare const DICTIONARY: Dictionary;
export declare function lookupWord(word: string): DictionaryEntry | null;
export { DICTIONARY as dictionary };
