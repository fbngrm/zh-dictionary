import type { Dictionary, DictionaryData, HanziData } from './types';
export type { CharacterData, Dictionary, DictionaryData, DictionaryEntry, HanziData, Tag, WordCharacter, WordDetails, } from './types';
export { splitPinyin, toneless } from './pinyin.js';
export declare function createDictionary(sources: DictionaryData | DictionaryData[], options?: {
    hanzi?: HanziData;
}): Dictionary;
