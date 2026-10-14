#!/usr/bin/env node
// Converts CC-CEDICT into data/cedict/cedict.json (same shape as every
// other file under data/) plus data/cedict/meta.json (source, date,
// attribution text for apps to display).
//
// Usage:
//   node scripts/build-cedict.mjs                      # download latest from MDBG
//   node scripts/build-cedict.mjs --input cedict.txt.gz  # use a local copy
//
// CC-CEDICT is CC BY-SA 4.0: the output is an adaptation and stays under
// that license, in its own directory, separate from the code and from
// data/zh. Don't merge it into data/zh.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
const OUT_DIR = fileURLToPath(new URL('../data/cedict/', import.meta.url));
const MARKS = {
  a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ',
};

const inputIndex = process.argv.indexOf('--input');
const gz = inputIndex === -1
  ? Buffer.from(await (await fetchOk(SOURCE_URL)).arrayBuffer())
  : readFileSync(process.argv[inputIndex + 1]);
const text = gunzipSync(gz).toString('utf8');

const header = {};
const words = new Map();
let lines = 0;
for (const line of text.split(/\r?\n/)) {
  const meta = line.match(/^#! (\w+)=(.*)$/);
  if (meta) header[meta[1]] = meta[2].trim();
  if (line.startsWith('#') || !line.trim()) continue;

  const m = line.match(/^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/);
  if (!m) throw new Error(`Unparseable line: ${line}`);
  const [, traditional, simplified, pinyin, senses] = m;
  const entry = {
    pinyin: pinyin.split(' ').map(toToneMarks).join(' '),
    translation: senses.split('/').join('; '),
    ...(traditional !== simplified && { traditional }),
  };
  if (!words.has(simplified)) words.set(simplified, []);
  words.get(simplified).push(entry);
  lines++;
}

if (header.entries && Number(header.entries) !== lines) {
  throw new Error(`Header says ${header.entries} entries, parsed ${lines}`);
}

// CEDICT lists proper-noun readings (capitalised pinyin, e.g. 安 "surname
// An") first; put common-word readings first so lookup() returns those.
// Stable sort, so upstream order is otherwise kept.
const isProperNoun = (e) => e.pinyin[0] !== e.pinyin[0].toLowerCase();
for (const entries of words.values()) {
  entries.sort((a, b) => isProperNoun(a) - isProperNoun(b));
}

// One word per line keeps diffs between CEDICT releases readable.
const body = [...words]
  .map(([word, entries]) => `${JSON.stringify(word)}:${JSON.stringify(entries.length === 1 ? entries[0] : entries)}`)
  .join(',\n');
writeFileSync(`${OUT_DIR}cedict.json`, `{\n${body}\n}\n`);

writeFileSync(`${OUT_DIR}meta.json`, JSON.stringify({
  name: 'CC-CEDICT',
  source: 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict',
  publisher: header.publisher,
  date: header.date,
  entries: lines,
  words: words.size,
  license: 'CC-BY-SA-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  attribution: 'Contains data from CC-CEDICT (https://cc-cedict.org/wiki/), published by MDBG, '
    + 'licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). '
    + 'Modified: converted to JSON, grouped by simplified form, pinyin converted to tone marks, '
    + 'proper-noun readings ordered last.',
}, null, 2) + '\n');

console.log(`CC-CEDICT ${header.date}: ${lines} entries → ${words.size} words`);

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

// "lu:4" → "lǜ", "Bei3" → "Běi", "zi5" → "zi", "shi2ke4" → "shíkè".
// Anything that isn't a numbered syllable ("·", ",", "A", "m2") is kept
// as-is apart from u: → ü.
function toToneMarks(token) {
  return token
    .replace(/u:/g, 'ü').replace(/U:/g, 'Ü')
    .replace(/([a-zA-ZüÜ]+)([1-5])/g, (syllable, letters, tone) => {
      if (tone === '5') return letters;

      const lower = letters.toLowerCase();
      let at = lower.indexOf('a');
      if (at === -1) at = lower.indexOf('e');
      if (at === -1) at = lower.indexOf('ou');
      if (at === -1) at = Math.max(...[...'iouü'].map((v) => lower.lastIndexOf(v)));
      if (at === -1) return syllable;

      const mark = MARKS[lower[at]][Number(tone) - 1];
      const marked = letters[at] === lower[at] ? mark : mark.toUpperCase();
      return letters.slice(0, at) + marked + letters.slice(at + 1);
    });
}
