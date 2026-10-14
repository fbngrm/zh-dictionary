const TONE_MARKS = /[̀́̄̌]/g;
const SEPARATORS = /[\s'’·-]/;

// "Háng" → "hang", "lǜ" → "lü".
export function toneless(pinyin: string): string {
  return pinyin.normalize('NFD').replace(TONE_MARKS, '').normalize('NFC').toLowerCase();
}

// Splits a word's pinyin into one syllable per character by matching each
// character's known readings: "yínháng" with 银行 → ["yín", "háng"]. Matching
// ignores tones, so tone-sandhi spellings ("yíxià") still split. Returns null
// when the pinyin can't be matched character by character.
export function splitPinyin(
  pinyin: string,
  chars: string[],
  readingsOf: (char: string) => string[],
): string[] | null {
  const original = [...pinyin.normalize('NFC')];
  const plain = original.map((c) => toneless(c));
  const failed = new Set<string>();

  function split(pos: number, k: number): string[] | null {
    while (pos < original.length && SEPARATORS.test(original[pos])) pos++;
    if (k === chars.length) return pos === original.length ? [] : null;
    const key = `${pos},${k}`;
    if (failed.has(key)) return null;

    const candidates = new Set(readingsOf(chars[k]).map(toneless));
    if (chars[k] === '儿') candidates.add('r'); // erhua: 一点儿 yīdiǎnr
    // Longest first, so "xian" isn't read as "xi" + "an" when 先 allows it.
    for (const reading of [...candidates].sort((a, b) => b.length - a.length)) {
      const len = [...reading].length;
      if (plain.slice(pos, pos + len).join('') !== reading) continue;
      const rest = split(pos + len, k + 1);
      if (rest) return [original.slice(pos, pos + len).join(''), ...rest];
    }
    failed.add(key);
    return null;
  }

  return split(0, 0);
}
