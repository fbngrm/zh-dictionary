#!/usr/bin/env node
// Builds, from Tatoeba and the AISHELL-1/AISHELL-3 transcripts:
//
// - data/frequency/frequency.json: how often each character and each
//   dictionary word occurs per million characters, averaged over the three
//   corpora with equal weight (AISHELL-1 alone is two thirds of the text, and
//   it is news read aloud, with numbers spelled out).
// - data/sentences/<n>.json: example sentences per word and character, up
//   to 3 from Tatoeba (with an English translation) and 2 from AISHELL.
//   Words are spread over 256 files by the code point of their first
//   character (n = code point % 256, see sentenceFile()), so web apps fetch
//   one small file per lookup.
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
// and is not itself a simplified headword.
const traditionalOnly = (c) => hanzi[c]?.simplified && !Object.hasOwn(cedict, c) && !Object.hasOwn(zh, c);
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

// Counts per corpus, and per word the sentences it occurs in as a word.
const CORPORA = ['tatoeba', 'aishell1', 'aishell3'];
const charCounts = Object.fromEntries(CORPORA.map((c) => [c, new Map()]));
const wordCounts = Object.fromEntries(CORPORA.map((c) => [c, new Map()]));
const totals = Object.fromEntries(CORPORA.map((c) => [c, 0]));
const inc = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const byWord = new Map();
const byChar = new Map();
const push = (map, key, i) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(i);
};
sentences.forEach((s, i) => {
  for (const c of s.text) {
    if (!HAN.test(c)) continue;
    inc(charCounts[s.source], c);
    totals[s.source]++;
  }
  const seenHere = new Set();
  for (const w of split(s.text)) {
    if (!lexicon.has(w)) continue;
    inc(wordCounts[s.source], w);
    if (!seenHere.has(w)) push(byWord, w, i);
    seenHere.add(w);
  }
  for (const c of new Set(s.text)) if (HAN.test(c)) push(byChar, c, i);
});

// Short, complete-looking sentences first: around 8–16 characters, then by
// distance from that range.
const score = (s) => {
  const n = [...s.text].length;
  return n < 8 ? 8 - n : n > 16 ? n - 16 : 0;
};
// A word's examples. A single character also gets sentences that contain it
// inside other words, ranked a little below those where it stands alone.
function examples(word) {
  const own = new Set(byWord.get(word) ?? []);
  const pool = [...own, ...([...word].length === 1 ? (byChar.get(word) ?? []).filter((i) => !own.has(i)) : [])];
  const rank = (i) => score(sentences[i]) + (own.has(i) ? 0 : 2);
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

// Per million characters in each corpus, averaged; words seen fewer than
// twice in all are left out.
function perMillion(counts, keep) {
  const keys = new Set(CORPORA.flatMap((c) => [...counts[c].keys()]));
  const rate = (k) => CORPORA.reduce((sum, c) => sum + (counts[c].get(k) ?? 0) / totals[c] * 1e6, 0) / CORPORA.length;
  return Object.fromEntries([...keys].filter(keep)
    .map((k) => [k, Math.round(rate(k) * 100) / 100])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
}
const seenTimes = (counts, k) => CORPORA.reduce((n, c) => n + (counts[c].get(k) ?? 0), 0);
const total = CORPORA.reduce((n, c) => n + totals[c], 0);
const frequency = {
  characters: perMillion(charCounts, () => true),
  words: perMillion(wordCounts, (w) => seenTimes(wordCounts, w) >= 2),
};
writeFileSync(`${DATA_DIR}frequency/frequency.json`, `{"characters":${JSON.stringify(frequency.characters)},\n"words":${JSON.stringify(frequency.words)}}\n`);

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
writeFileSync(`${DATA_DIR}frequency/meta.json`, JSON.stringify({
  name: 'frequency',
  unit: 'occurrences per million characters, averaged over the corpora',
  characters: totals,
  sentences: counts,
  license: 'CC-BY-4.0',
  attribution: 'Character and word frequencies computed from Tatoeba (https://tatoeba.org/, CC BY 2.0 FR) '
    + 'and the AISHELL-1 and AISHELL-3 transcripts (Apache License 2.0).',
}, null, 2) + '\n');

console.log(`${sentences.length} sentences (${JSON.stringify(counts)}), ${total} characters; `
  + `${Object.keys(frequency.characters).length} characters and ${Object.keys(frequency.words).length} words; examples for ${words.size} words`);
