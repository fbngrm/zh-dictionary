#!/usr/bin/env node
// Builds data/sentences/<n>.json from Tatoeba and the AISHELL-1/AISHELL-3
// transcripts: example sentences per word and character, up to 3 from
// Tatoeba (with an English translation) and 2 from AISHELL. Words are spread
// over 256 files by the code point of their first character (n = code point
// % 256, see sentenceFile()), so web apps fetch one small file per lookup.
// Sentences are ranked with data/frequency (scripts/build-frequency.py), so
// build that first.
//
// The corpora are large downloads, so the script reads local copies:
//   node scripts/build-sentences.mjs \
//     --tatoeba <pairs.json> --aishell1 <aishell_transcript_v0.8.txt> --aishell3 <dir with train/ and test/>
//
// - pairs.json: Tatoeba Mandarin–English pairs as
//   {"pairs":[{"cmn_id","cmn_text","cmn_username","eng_id","eng_text","eng_username"}]},
//   joined from the weekly exports at https://downloads.tatoeba.org/exports/
//   (cmn_sentences_detailed, eng_sentences_detailed, links). CC BY 2.0 FR.
// - AISHELL-1 (https://www.openslr.org/33/) and AISHELL-3
//   (https://www.openslr.org/93/) transcripts. Apache-2.0.
//
// Only sentences written in simplified characters are used. Sentences are
// split into words by longest match against data/zh and data/cedict.
//
// Longest match makes mistakes (研究生命 → 研究生 命), so a second
// segmenter's output can be passed in to check it: a word only counts where
// the second segmenter does not cut through it or join it with its
// neighbours (splitting it further, 看书 → 看 书, is fine). With the
// Stanford segmenter:
//   node scripts/build-sentences.mjs <corpora> --texts sentences.txt   (writes the sentences, one per line, and stops)
//   segment.sh ctb sentences.txt UTF-8 0 > segmented.txt
//   node scripts/build-sentences.mjs <corpora> --segmented segmented.txt
// Lines of segmented.txt are matched to sentences by their text, so the
// order does not matter; sentences it does not cover are used unchecked.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
const HAN = /\p{Script=Han}/u;
const SHARDS = 256;
const MAX_TATOEBA = 3;
const MAX_AISHELL = 2;

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) throw new Error(`missing --${name}`);
  return process.argv[i + 1];
};

// Lexicon for splitting sentences: every simplified headword.
const zh = JSON.parse(readFileSync(`${DATA_DIR}zh/dictionary.json`, 'utf8'));
const cedict = JSON.parse(readFileSync(`${DATA_DIR}cedict/cedict.json`, 'utf8'));
const hanzi = JSON.parse(readFileSync(`${DATA_DIR}hanzi/hanzi.json`, 'utf8'));
const lexicon = new Set([...Object.keys(zh), ...Object.keys(cedict)].filter((w) => HAN.test(w)));
const MAX_WORD = 8;

function split(text) {
  const chars = [...text];
  const words = [];
  for (let i = 0; i < chars.length;) {
    let len = Math.min(MAX_WORD, chars.length - i);
    while (len > 1 && !lexicon.has(chars.slice(i, i + len).join(''))) len--;
    words.push(chars.slice(i, i + len).join(''));
    i += len;
  }
  return words;
}

// A character only written in traditional texts: it has a simplified form
// and is not itself a simplified CC-CEDICT headword. (data/zh is no help
// here: some of its words are written in traditional characters.)
const traditionalOnly = (c) => hanzi[c]?.simplified && !Object.hasOwn(cedict, c);
const isSimplified = (text) => ![...text].some(traditionalOnly);

// Every sentence as { text, source, … }.
const sentences = [];
const seen = new Set();
function add(sentence) {
  if (seen.has(sentence.text) || [...sentence.text].filter((c) => HAN.test(c)).length < 4) return;
  if (!isSimplified(sentence.text)) return;
  seen.add(sentence.text);
  sentences.push(sentence);
}

// Tatoeba: one English translation per Mandarin sentence (the first).
for (const p of JSON.parse(readFileSync(arg('tatoeba'), 'utf8')).pairs) {
  add({
    text: p.cmn_text.trim(),
    en: p.eng_text.trim(),
    source: 'tatoeba',
    id: Number(p.cmn_id),
    enId: Number(p.eng_id),
    by: p.cmn_username,
  });
}
// AISHELL-1: "BAC009S0002W0122 而 对 楼市 成交 抑制 作用 最 大 的 限 购".
for (const line of readFileSync(arg('aishell1'), 'utf8').split('\n')) {
  const [ref, ...words] = line.trim().split(/\s+/);
  if (ref && words.length) add({ text: words.join(''), source: 'aishell1', id: ref });
}
// AISHELL-3: "SSB00050001.wav<TAB>广 guang3 州 zhou1 …": characters alternate with pinyin.
for (const part of readdirSync(arg('aishell3'))) {
  let content;
  try {
    content = readFileSync(`${arg('aishell3')}/${part}/content.txt`, 'utf8');
  } catch {
    continue;
  }
  for (const line of content.split('\n')) {
    const [ref, rest = ''] = line.split('\t');
    const text = rest.split(/\s+/).filter((t) => HAN.test(t)).join('');
    if (text) add({ text, source: 'aishell3', id: ref.replace(/\.wav$/, '') });
  }
}

if (process.argv.includes('--texts')) {
  writeFileSync(arg('texts'), sentences.map((s) => s.text.replace(/\s+/g, ' ')).join('\n') + '\n');
  console.log(`${sentences.length} sentences written to ${arg('texts')}`);
  process.exit(0);
}

// The second segmenter's word boundaries per sentence text: offsets where a
// word starts or ends.
const boundaries = new Map();
if (process.argv.includes('--segmented')) {
  for (const line of readFileSync(arg('segmented'), 'utf8').split('\n')) {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    let offset = 0;
    const cuts = new Set([0]);
    for (const t of tokens) cuts.add(offset += t.length);
    boundaries.set(tokens.join(''), cuts);
  }
}
// The words of a sentence by longest match, keeping those the second
// segmenter agrees with (or all, without its output for this sentence).
const checks = { sentences: 0, words: 0, rejected: 0 };
function checkedWords(text) {
  const cuts = boundaries.get(text);
  if (cuts) checks.sentences++;
  let offset = 0;
  return split(text).filter((w) => {
    const start = offset;
    offset += w.length;
    if (!cuts || !HAN.test(w)) return true;
    checks.words++;
    if (cuts.has(start) && cuts.has(offset)) return true;
    checks.rejected++;
    return false;
  });
}

// Per word the sentences it occurs in as a word.
const byWord = new Map();
const byChar = new Map();
const push = (map, key, i) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(i);
};
sentences.forEach((s, i) => {
  for (const w of new Set(checkedWords(s.text))) {
    if (lexicon.has(w)) push(byWord, w, i);
  }
  for (const c of new Set(s.text)) if (HAN.test(c)) push(byChar, c, i);
});

// Easy, complete-looking sentences first (in the spirit of GDEX, "good
// dictionary examples"): around 8–16 characters, few rare words, and for
// AISHELL, whose transcripts are often cut mid-phrase ("…负责人对"), not
// starting or ending on a word that cannot start or end a sentence.
// AISHELL-1 (news) comes after AISHELL-3.
const frequency = JSON.parse(readFileSync(`${DATA_DIR}frequency/frequency.json`, 'utf8'));
const wordRanks = new Map(Object.keys(frequency.words).map((w, i) => [w, i + 1]));
const COMMON = 10000;
const NO_END = new Set(['对', '在', '和', '与', '及', '将', '把', '被', '而', '并', '但', '为', '从', '向', '由', '于', '以', '是', '给', '跟', '让', '或', '一']);
const NO_START = new Set(['而', '并', '但', '及', '和', '与', '的', '其', '等', '或']);
const score = (s) => {
  const n = [...s.text].length;
  const words = split(s.text).filter((w) => HAN.test(w));
  const rare = words.filter((w) => (wordRanks.get(w) ?? Infinity) > COMMON).length;
  const fragment = s.source !== 'tatoeba' && (NO_END.has(words.at(-1)) || NO_START.has(words[0]));
  return (n < 8 ? 8 - n : n > 16 ? n - 16 : 0) + 2 * rare + (fragment ? 6 : 0) + (s.source === 'aishell1' ? 1 : 0);
};
const scores = new Map();
const scoreOf = (i) => scores.get(i) ?? scores.set(i, score(sentences[i])).get(i);
// A word's examples. A single character also gets sentences that contain it
// inside other words, ranked a little below those where it stands alone.
function examples(word) {
  const own = new Set(byWord.get(word) ?? []);
  const pool = [...own, ...([...word].length === 1 ? (byChar.get(word) ?? []).filter((i) => !own.has(i)) : [])];
  const rank = (i) => scoreOf(i) + (own.has(i) ? 0 : 2);
  const take = (match, max) => pool.filter((i) => match(sentences[i].source))
    .sort((a, b) => rank(a) - rank(b) || a - b).slice(0, max).map((i) => sentences[i]);
  return [...take((s) => s === 'tatoeba', MAX_TATOEBA), ...take((s) => s.startsWith('aishell'), MAX_AISHELL)];
}

const shards = Array.from({ length: SHARDS }, () => ({}));
const words = new Set([...byWord.keys(), ...byChar.keys()]);
for (const word of [...words].sort()) {
  const list = examples(word);
  if (list.length) shards[word.codePointAt(0) % SHARDS][word] = list;
}
rmSync(`${DATA_DIR}sentences/shards`, { recursive: true, force: true });
mkdirSync(`${DATA_DIR}sentences/shards`, { recursive: true });
shards.forEach((shard, n) => {
  const body = Object.entries(shard).map(([w, list]) => `${JSON.stringify(w)}:${JSON.stringify(list)}`).join(',\n');
  writeFileSync(`${DATA_DIR}sentences/shards/${n}.json`, `{\n${body}\n}\n`);
});

const counts = Object.fromEntries(['tatoeba', 'aishell1', 'aishell3'].map((s) => [s, sentences.filter((x) => x.source === s).length]));
writeFileSync(`${DATA_DIR}sentences/meta.json`, JSON.stringify({
  name: 'sentences',
  sentences: counts,
  words: shards.reduce((n, s) => n + Object.keys(s).length, 0),
  sources: {
    tatoeba: { url: 'https://tatoeba.org/', license: 'CC-BY-2.0-FR' },
    aishell1: { url: 'https://www.openslr.org/33/', license: 'Apache-2.0' },
    aishell3: { url: 'https://www.openslr.org/93/', license: 'Apache-2.0' },
  },
  license: 'CC-BY-2.0-FR AND Apache-2.0',
  attribution: 'Example sentences from Tatoeba (https://tatoeba.org/) and its contributors, CC BY 2.0 FR, '
    + 'and from the AISHELL-1 and AISHELL-3 corpora by Beijing Shell Shell Technology Co., Ltd., Apache License 2.0.',
}, null, 2) + '\n');
if (boundaries.size) {
  console.log(`second segmenter: ${checks.sentences} of ${sentences.length} sentences checked, `
    + `${checks.rejected} of ${checks.words} words rejected`);
}
console.log(`${sentences.length} sentences (${JSON.stringify(counts)}); examples for ${words.size} words`);
