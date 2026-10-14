import type { CharacterIndex, DictionaryData, EtymologyData, FrequencyData, HanziData, HskData } from './types';
export declare function createCharacterIndex(options: {
    hanzi: HanziData;
    words?: DictionaryData | DictionaryData[];
    etymology?: EtymologyData;
    frequency?: FrequencyData;
    hsk?: HskData;
}): CharacterIndex;
export declare function sentenceFile(word: string): string;
export declare function strokeFile(char: string): string;
