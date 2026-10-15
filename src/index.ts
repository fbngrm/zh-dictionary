import type {
  CharacterData, Dictionary, DictionaryData, DictionaryEntry, HanziData, WordCharacter, WordDetails,
} from './types';
import { splitPinyin, toneless } from './pinyin.js';

export type {
  CharacterData, Dictionary, DictionaryData, DictionaryEntry, HanziData, Tag, WordCharacter, WordDetails,
} from './types';
export { splitPinyin, toneless } from './pinyin.js';

// Object.prototype.hasOwnProperty rather than Object.hasOwn, for older
// runtimes; guards against keys like "constructor".
const { hasOwnProperty } = Object.prototype;

// Builds a lookup over one or more word datasets, plus optional per-character
// data for describe() and character(). Data is passed in rather than
// imported here so apps choose which datasets to bundle (or fetch) and the
// code stays free of any data license. Earlier sources take priority.
export function createDictionary(
  sources: DictionaryData | DictionaryData[],
  options: { hanzi?: HanziData } = {},
): Dictionary {
  const list = Array.isArray(sources) ? sources : [sources];
  const hanzi = options.hanzi ?? {};

  // Traditional → simplified keys, per source, for entries that carry a
  // differing traditional form.
  const traditional = list.map((data) => {
    const index = new Map<string, string>();
    for (const [word, value] of Object.entries(data)) {
      for (const entry of toArray(value)) {
        if (entry.traditional && !index.has(entry.traditional)) {
          index.set(entry.traditional, word);
        }
      }
    }
    return index;
  });

  // The simplified key and matching entries for `word` in source i.
  function find(i: number, word: string): [string, DictionaryEntry[]] | null {
    const data = list[i];
    if (hasOwnProperty.call(data, word)) return [word, toArray(data[word])];
    const simplified = traditional[i].get(word);
    if (simplified === undefined) return null;
    return [simplified, toArray(data[simplified]).filter((e) => e.traditional === word)];
  }

  function lookupAll(word: string): DictionaryEntry[] {
    return list.flatMap((_, i) => find(i, word)?.[1] ?? []);
  }

  function character(char: string): CharacterData | null {
    return hasOwnProperty.call(hanzi, char) ? hanzi[char] : null;
  }

  // The character's own dictionary entry in this reading, else its general
  // definition.
  function meaningOf(char: string, reading: string | undefined): string | undefined {
    const entries = lookupAll(char);
    if (reading) {
      const exact = reading.normalize('NFC').toLowerCase();
      const match = entries.find((e) => e.pinyin.normalize('NFC').toLowerCase() === exact)
        ?? entries.find((e) => toneless(e.pinyin) === toneless(reading));
      if (match) return match.translation;
    }
    return character(char)?.definition ?? entries[0]?.translation;
  }

  function describe(word: string): WordDetails | null {
    for (let i = 0; i < list.length; i++) {
      const found = find(i, word);
      if (!found?.[1].length) continue;
      const [simplified, [entry]] = found;
      const chars = [...simplified];
      const traditionalForm = entry.traditional ?? simplified;
      const traditionalChars = [...traditionalForm].length === chars.length ? [...traditionalForm] : chars;
      const readings = splitPinyin(entry.pinyin, chars, (c) => [
        ...(character(c)?.pinyin ?? []),
        ...lookupAll(c).map((e) => e.pinyin),
      ]);

      const characters = chars.map((char, k): WordCharacter => {
        const data = character(char);
        const meaning = meaningOf(char, readings?.[k]);
        return {
          char,
          traditional: traditionalChars[k],
          ...(readings && { pinyin: readings[k] }),
          ...(meaning && { meaning }),
          ...(data?.radical && { radical: data.radical }),
          ...(data?.strokes && { strokes: data.strokes }),
          ...(data?.decomposition && { decomposition: data.decomposition }),
          components: data?.components ?? [],
        };
      });

      return {
        word: simplified,
        traditional: traditionalForm,
        pinyin: entry.pinyin,
        translation: entry.translation,
        ...(entry.part_of_speech && { part_of_speech: entry.part_of_speech }),
        ...(entry.tags && { tags: entry.tags }),
        characters,
      };
    }
    return null;
  }

  return {
    lookup: (word) => lookupAll(word)[0] ?? null,
    lookupAll,
    has: (word) => lookupAll(word).length > 0,
    describe,
    character,
  };
}

function toArray(value: DictionaryEntry | DictionaryEntry[]): DictionaryEntry[] {
  return Array.isArray(value) ? value : [value];
}
