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
    radicalNumber?: number;
    extraStrokes?: number;
    level?: 1 | 2 | 3;
    readingFrequency?: Record<string, number>;
    semanticVariants?: string[];
    phoneticGroups?: number[];
}
export type HanziData = Record<string, CharacterData>;
export interface UnihanReadings {
    cantonese?: string[];
    japanese?: string[];
    korean?: string[];
    vietnamese?: string[];
    middleChinese?: string[];
    cangjie?: string;
    fourCorner?: string[];
}
export type UnihanData = Record<string, UnihanReadings>;
export interface Etymology {
    type?: 'pictographic' | 'ideographic' | 'pictophonetic';
    hint?: string;
    semantic?: string;
    phonetic?: string;
    decomposition?: string;
    matches?: (number[] | null)[];
}
export type EtymologyData = Record<string, Etymology>;
export interface StrokeData {
    strokes: string[];
    medians: [number, number][][];
}
export interface HskLevels {
    hsk2?: number;
    hsk3?: number;
}
export type HskData = Record<string, HskLevels>;
export interface FrequencyData {
    characters: Record<string, number>;
    words: Record<string, number>;
}
export interface Sentence {
    text: string;
    en?: string;
    source: 'tatoeba' | 'aishell1' | 'aishell3';
    id: number | string;
    enId?: number;
    by?: string;
}
export type SentenceData = Record<string, Sentence[]>;
export interface DecompositionNode {
    char: string;
    decomposition?: string;
    components: DecompositionNode[];
}
export interface CharacterIndex {
    wordsWith(char: string, options?: {
        position?: 'start' | 'end' | 'any';
        limit?: number;
    }): string[];
    usedIn(component: string): string[];
    phoneticSeries(char: string): string[];
    decompose(char: string, maxDepth?: number): DecompositionNode;
    characterRank(char: string): number | null;
    wordRank(word: string): number | null;
    coverage(char: string): number | null;
    hsk(word: string): HskLevels | null;
    characterHsk(char: string): HskLevels | null;
    etymology(char: string): Etymology | null;
}
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
