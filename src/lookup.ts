import dictionaryData from './data/dictionary.json';
import type { Dictionary, DictionaryEntry } from './types';

const DICTIONARY = dictionaryData as Dictionary;

export function lookupWord(word: string): DictionaryEntry | null {
  return DICTIONARY[word] ?? null;
}

export { DICTIONARY as dictionary };
