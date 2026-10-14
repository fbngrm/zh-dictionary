const { hasOwnProperty } = Object.prototype;
const own = (data, key) => data && hasOwnProperty.call(data, key) ? data[key] : null;
// What a character page shows beyond the entry itself: words that contain the
// character, characters built from it, its phonetic series, its full
// decomposition, frequency and HSK levels. Every dataset but hanzi is
// optional; functions that need a missing one return empty results. Indexes
// are built on first use.
export function createCharacterIndex(options) {
    const { hanzi, etymology, frequency, hsk } = options;
    const words = [...new Set((Array.isArray(options.words) ? options.words : options.words ? [options.words] : [])
            .flatMap((data) => Object.keys(data)))];
    // frequency.json lists characters and words most frequent first.
    const ranks = (counts) => new Map(Object.keys(counts ?? {}).map((k, i) => [k, i + 1]));
    let charRanks;
    let wordRanks;
    let coverageOf;
    const characterRank = (char) => (charRanks ??= ranks(frequency?.characters)).get(char) ?? null;
    const wordRank = (word) => (wordRanks ??= ranks(frequency?.words)).get(word) ?? null;
    const byWordRank = (a, b) => (wordRank(a) ?? Infinity) - (wordRank(b) ?? Infinity) || [...a].length - [...b].length || (a < b ? -1 : a > b ? 1 : 0);
    const byCharRank = (a, b) => (characterRank(a) ?? Infinity) - (characterRank(b) ?? Infinity) || a.codePointAt(0) - b.codePointAt(0);
    let wordsByChar;
    function wordsWith(char, { position = 'any', limit = Infinity } = {}) {
        if (!wordsByChar) {
            wordsByChar = new Map();
            for (const word of words) {
                const chars = [...word];
                if (chars.length < 2)
                    continue;
                for (const c of new Set(chars)) {
                    if (!wordsByChar.has(c))
                        wordsByChar.set(c, []);
                    wordsByChar.get(c).push(word);
                }
            }
            for (const list of wordsByChar.values())
                list.sort(byWordRank);
        }
        const list = wordsByChar.get(char) ?? [];
        const matches = position === 'start' ? list.filter((w) => w.startsWith(char))
            : position === 'end' ? list.filter((w) => w.endsWith(char)) : list;
        return matches.slice(0, limit);
    }
    let charsByComponent;
    function usedIn(component) {
        if (!charsByComponent) {
            charsByComponent = new Map();
            for (const [char, data] of Object.entries(hanzi)) {
                for (const part of new Set(data.components ?? [])) {
                    if (part === char)
                        continue;
                    if (!charsByComponent.has(part))
                        charsByComponent.set(part, []);
                    charsByComponent.get(part).push(char);
                }
            }
            for (const list of charsByComponent.values())
                list.sort(byCharRank);
        }
        return charsByComponent.get(component) ?? [];
    }
    // Characters sharing a phonetic component, from the etymologies (妈 → 马,
    // 吗, 码, 骂…), else from Unihan's phonetic groups.
    let byPhonetic;
    let byGroup;
    function phoneticSeries(char) {
        if (!byPhonetic) {
            byPhonetic = new Map();
            for (const [c, e] of Object.entries(etymology ?? {})) {
                if (!e.phonetic)
                    continue;
                if (!byPhonetic.has(e.phonetic))
                    byPhonetic.set(e.phonetic, []);
                byPhonetic.get(e.phonetic).push(c);
            }
        }
        const phonetic = own(etymology, char)?.phonetic;
        const series = new Set([
            ...(phonetic ? [phonetic, ...(byPhonetic.get(phonetic) ?? [])] : []),
            ...(byPhonetic.get(char) ?? []),
        ]);
        if (!series.size) {
            if (!byGroup) {
                byGroup = new Map();
                for (const [c, data] of Object.entries(hanzi)) {
                    for (const g of data.phoneticGroups ?? []) {
                        if (!byGroup.has(g))
                            byGroup.set(g, []);
                        byGroup.get(g).push(c);
                    }
                }
            }
            for (const g of own(hanzi, char)?.phoneticGroups ?? [])
                for (const c of byGroup.get(g) ?? [])
                    series.add(c);
        }
        series.delete(char);
        // For a simplified character, leave out traditional-only forms (the
        // groups list both scripts).
        const traditional = !!own(hanzi, char)?.simplified;
        return [...series].filter((c) => traditional || !own(hanzi, c)?.simplified).sort(byCharRank);
    }
    function decompose(char, maxDepth = Infinity) {
        const walk = (c, depth, path) => {
            const data = own(hanzi, c);
            const node = { char: c, ...(data?.decomposition && { decomposition: data.decomposition }), components: [] };
            if (depth >= maxDepth || path.has(c))
                return node;
            const next = new Set(path).add(c);
            node.components = (data?.components ?? []).filter((part) => part !== c).map((part) => walk(part, depth + 1, next));
            return node;
        };
        return walk(char, 0, new Set());
    }
    function coverage(char) {
        if (!coverageOf) {
            coverageOf = new Map();
            const counts = Object.entries(frequency?.characters ?? {});
            const total = counts.reduce((sum, [, n]) => sum + n, 0);
            let running = 0;
            for (const [c, n] of counts)
                coverageOf.set(c, (running += n) / total);
        }
        return coverageOf.get(char) ?? null;
    }
    // Lowest level of any HSK word containing the character.
    let charLevels;
    function characterHsk(char) {
        if (!charLevels) {
            charLevels = new Map();
            for (const [word, levels] of Object.entries(hsk ?? {})) {
                for (const c of new Set(word)) {
                    const best = charLevels.get(c) ?? {};
                    for (const key of ['hsk2', 'hsk3']) {
                        const level = levels[key];
                        if (level && (!best[key] || level < best[key]))
                            best[key] = level;
                    }
                    charLevels.set(c, best);
                }
            }
        }
        return charLevels.get(char) ?? null;
    }
    return {
        wordsWith,
        usedIn,
        phoneticSeries,
        decompose,
        characterRank,
        wordRank,
        coverage,
        hsk: (word) => own(hsk, word),
        characterHsk,
        etymology: (char) => own(etymology, char),
    };
}
// Where data/sentences keeps a word's example sentences: its first
// character's code point mod 256.
export function sentenceFile(word) {
    return `shards/${word.codePointAt(0) % 256}.json`;
}
// Where data/strokes keeps a character's stroke data: its code point in hex.
export function strokeFile(char) {
    return `chars/${char.codePointAt(0).toString(16)}.json`;
}
