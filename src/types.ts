export interface DictionaryEntry {
  // Tone-marked pinyin, e.g. "kǒu zhào".
  pinyin: string;
  translation: string;
  // Not present in CC-CEDICT data.
  part_of_speech?: string;
  // Traditional form, only present when it differs from the simplified key.
  traditional?: string;
  // Register or category, only present when one applies (zh data only).
  tags?: Tag[];
  // Only present for entries originally generated with related-word data
  // (e.g. zh-patterns' story dictionary) — optional so apps that don't
  // populate it don't need to handle a required-but-empty field.
  related?: string[];
}

// vulgar: swear word, insult or vulgar; slang: informal slang; internet:
// internet slang, meme or online buzzword; place: place name.
export type Tag = 'vulgar' | 'slang' | 'internet' | 'place';

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
}

export type HanziData = Record<string, CharacterData>;

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
  tags?: Tag[];
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
