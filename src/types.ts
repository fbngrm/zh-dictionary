export interface DictionaryEntry {
  pinyin: string;
  translation: string;
  part_of_speech: string;
  // Only present for entries originally generated with related-word data
  // (e.g. zh-patterns' story dictionary) — optional so apps that don't
  // populate it don't need to handle a required-but-empty field.
  related?: string[];
}

export type Dictionary = Record<string, DictionaryEntry>;
