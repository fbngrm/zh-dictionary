import dictionaryData from './data/dictionary.json';
const DICTIONARY = dictionaryData;
export function lookupWord(word) {
    return DICTIONARY[word] ?? null;
}
export { DICTIONARY as dictionary };
