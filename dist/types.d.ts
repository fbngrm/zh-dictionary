export interface DictionaryEntry {
    pinyin: string;
    translation: string;
    part_of_speech: string;
    related?: string[];
}
export type Dictionary = Record<string, DictionaryEntry>;
