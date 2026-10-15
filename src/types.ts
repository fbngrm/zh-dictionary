export interface DictionaryEntry {
  // Tone-marked pinyin, e.g. "kǒu zhào".
  pinyin: string;
  translation: string;
  // Not present in CC-CEDICT data.
  part_of_speech?: string;
  // Traditional form, only present when it differs from the simplified key.
  traditional?: string;
  // Only present for entries originally generated with related-word data
  // (e.g. zh-patterns' story dictionary) — optional so apps that don't
  // populate it don't need to handle a required-but-empty field.
  related?: string[];
}

// Shape of every word file under data/: simplified word → one entry, or
// several when the word has more than one reading (e.g. 行 háng / xíng).
export type DictionaryData = Record<string, DictionaryEntry | DictionaryEntry[]>;

// Shape of data/hanzi: one record per character (simplified and
// traditional forms both have their own).
export interface CharacterData {
  // All Mandarin readings, most common first.
  pinyin?: string[];
  definition?: string;
  radical?: string;
  strokes?: number;
  // Ideographic description sequence, e.g. "⿰女子". "{1}"… or "？" stand
  // for components that have no encoded character.
  decomposition?: string;
  // The characters in `decomposition`, in order. Look them up again to
  // decompose further.
  components?: string[];
  traditional?: string[];
  simplified?: string[];
  // Kangxi radical number and the strokes beyond the radical (好: 38, 3).
  radicalNumber?: number;
  extraStrokes?: number;
  // Level in the 2013 Table of General Standard Chinese Characters: 1 = the
  // 3500 common characters, 2 = the next 3000, 3 = the rest.
  level?: 1 | 2 | 3;
  // Occurrences per reading in the Xiandai Hanyu Pinlu Cidian (1986).
  readingFrequency?: Record<string, number>;
  // Characters with the same meaning, usable in its place.
  semanticVariants?: string[];
  // Casey's phonetic groups: characters sharing a number share a phonetic
  // element.
  phoneticGroups?: number[];
}

export type HanziData = Record<string, CharacterData>;

// Shape of data/hanzi/unihan.json: other languages' readings and input codes.
export interface UnihanReadings {
  cantonese?: string[];
  // Kana: on readings in katakana, kun readings in hiragana.
  japanese?: string[];
  korean?: string[];
  vietnamese?: string[];
  // Tang-era (Middle Chinese) reconstructions.
  middleChinese?: string[];
  cangjie?: string;
  fourCorner?: string[];
}

export type UnihanData = Record<string, UnihanReadings>;

// Shape of data/etymology (Make Me a Hanzi): how a character was formed.
export interface Etymology {
  type?: 'pictographic' | 'ideographic' | 'pictophonetic';
  // For pictophonetic characters, what the semantic part means.
  hint?: string;
  // The component that gives the meaning and the one that gives the sound.
  semantic?: string;
  phonetic?: string;
  // Make Me a Hanzi's own decomposition, which `matches` refers to.
  decomposition?: string;
  // Per stroke, the path to its component in `decomposition` ([1] = second
  // part, [1, 0] = first part of the second part), or null.
  matches?: (number[] | null)[];
}

export type EtymologyData = Record<string, Etymology>;

// One file of data/strokes: SVG outlines of each stroke in stroke order,
// and each stroke's median line, on a 1024×1024 grid with y pointing up
// (draw with transform="scale(1, -1) translate(0, -900)").
export interface StrokeData {
  strokes: string[];
  medians: [number, number][][];
}

export interface HskLevels {
  // HSK 2.0 level 1–6.
  hsk2?: number;
  // HSK 3.0 level 1–6, or 7 for the 7–9 band.
  hsk3?: number;
}

export type HskData = Record<string, HskLevels>;

// Shape of data/frequency: occurrences per million characters, most
// frequent first.
export interface FrequencyData {
  characters: Record<string, number>;
  words: Record<string, number>;
}

// One example sentence from data/sentences.
export interface Sentence {
  text: string;
  // English translation (Tatoeba sentences only).
  en?: string;
  source: 'tatoeba' | 'aishell1' | 'aishell3';
  // Tatoeba sentence number, or the AISHELL utterance id.
  id: number | string;
  // Tatoeba: the English sentence's number and the contributor's username.
  enId?: number;
  by?: string;
}

// One file of data/sentences: word → example sentences.
export type SentenceData = Record<string, Sentence[]>;

export interface DecompositionNode {
  char: string;
  decomposition?: string;
  components: DecompositionNode[];
}

export interface CharacterIndex {
  // Words of two or more characters containing `char` in their simplified or
  // traditional form, most frequent first. Words are returned by their
  // dictionary key (simplified).
  wordsWith(char: string, options?: { position?: 'start' | 'end' | 'any'; limit?: number }): string[];
  // Characters that have `component` as a direct component, most frequent first.
  usedIn(component: string): string[];
  // Characters sharing the character's phonetic component, most frequent first.
  phoneticSeries(char: string): string[];
  // The decomposition tree, down to maxDepth levels (default: all).
  decompose(char: string, maxDepth?: number): DecompositionNode;
  // 1 = most frequent, null when not counted.
  characterRank(char: string): number | null;
  wordRank(word: string): number | null;
  // Share of running text made up of this and all more frequent characters.
  coverage(char: string): number | null;
  hsk(word: string): HskLevels | null;
  // The lowest level of any HSK word containing the character.
  characterHsk(char: string): HskLevels | null;
  etymology(char: string): Etymology | null;
}

// One character of a word, as returned by describe().
export interface WordCharacter {
  char: string;
  // The matching character of the word's traditional form.
  traditional: string;
  // Reading in this word (e.g. 行 → "háng" in 银行), when it can be read off
  // the word's pinyin.
  pinyin?: string;
  // Dictionary entry for the character in that reading, else its general
  // definition.
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
  // First entry from the first source that has the word, else null.
  lookup(word: string): DictionaryEntry | null;
  // Every entry from every source, in source order.
  lookupAll(word: string): DictionaryEntry[];
  has(word: string): boolean;
  // The word's first entry plus a per-character breakdown, else null.
  describe(word: string): WordDetails | null;
  // Character data, else null (or always null without hanzi data).
  character(char: string): CharacterData | null;
}
