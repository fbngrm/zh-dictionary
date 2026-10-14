export interface DictionaryEntry {
    pinyin: string;
    translation: string;
    part_of_speech?: string;
    traditional?: string;
    related?: string[];
}
export type DictionaryData = Record<string, DictionaryEntry | DictionaryEntry[]>;
export interface CharacterData {
    pinyin?: string[];
    definition?: string;
    radical?: string;
    strokes?: number;
    decomposition?: string;
    components?: string[];
    traditional?: string[];
    simplified?: string[];
}
export type HanziData = Record<string, CharacterData>;
export interface WordCharacter {
    char: string;
    traditional: string;
    pinyin?: string;
    meaning?: string;
    radical?: string;
    strokes?: number;
    decomposition?: string;
    components: string[];
}
export interface WordDetails {
    word: string;
    traditional: string;
    pinyin: string;
    translation: string;
    part_of_speech?: string;
    characters: WordCharacter[];
}
export interface Dictionary {
    lookup(word: string): DictionaryEntry | null;
    lookupAll(word: string): DictionaryEntry[];
    has(word: string): boolean;
    describe(word: string): WordDetails | null;
    character(char: string): CharacterData | null;
}
