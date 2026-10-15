import type { Dictionary, DictionaryData, HanziData } from './types';
export type { CharacterData, CharacterIndex, DecompositionNode, Dictionary, DictionaryData, DictionaryEntry, Etymology, EtymologyData, FrequencyData, HanziData, HskData, HskLevels, Sentence, SentenceGrade, SentenceData, StrokeData, UnihanData, UnihanReadings, WordCharacter, WordDetails, } from './types';
export { splitPinyin, toneless } from './pinyin.js';
export { createCharacterIndex, sentenceFile, strokeFile } from './characters.js';
export declare function createDictionary(sources: DictionaryData | DictionaryData[], options?: {
    hanzi?: HanziData;
}): Dictionary;
export { sentenceAudioUrl, sentenceMetadataUrl, SENTENCE_CORPUS_BASE } from './corpus.js';
