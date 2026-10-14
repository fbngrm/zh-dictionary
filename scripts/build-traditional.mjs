#!/usr/bin/env node
// Adds a `traditional` field to every word in data/zh/dictionary.json whose
// traditional form differs, using OpenCC's simplified → traditional
// (Taiwan standard, "s2tw") tables. Re-run after generate-dictionary.py adds
// words. Idempotent.
//
// Usage:
//   node scripts/build-traditional.mjs                    # download OpenCC tables
//   node scripts/build-traditional.mjs --input-dir <dir>  # use local copies
//
// OpenCC (https://github.com/BYVoid/OpenCC) is Apache-2.0. Only the
// conversion results are stored; data/zh stays CC0.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OPENCC_VERSION = 'ver.1.4.2';
const TABLES = ['STPhrases', 'STCharacters', 'TWVariants'];
const DICT_PATH = fileURLToPath(new URL('../data/zh/dictionary.json', import.meta.url));

const inputIndex = process.argv.indexOf('--input-dir');
const [phrases, characters, twVariants] = await Promise.all(TABLES.map(async (name) => {
  const text = inputIndex === -1
    ? await (await fetchOk(`https://raw.githubusercontent.com/BYVoid/OpenCC/${OPENCC_VERSION}/data/dictionary/${name}.txt`)).text()
    : readFileSync(`${process.argv[inputIndex + 1]}/${name}.txt`, 'utf8');
  return parseTable(text);
}));
// OpenCC's s2t segments with phrases and characters together.
const s2t = new Map([...characters, ...phrases]);
const maxLen = Math.max(...[...s2t.keys()].map((k) => [...k].length));

const original = readFileSync(DICT_PATH, 'utf8');
const dictionary = JSON.parse(original);
if (toPythonJson(dictionary) + '\n' !== original) {
  throw new Error('data/zh/dictionary.json is not in generate-dictionary.py format; refusing to rewrite it');
}

let changed = 0;
for (const [word, value] of Object.entries(dictionary)) {
  const traditional = toTraditional(word);
  for (const entry of Array.isArray(value) ? value : [value]) {
    if (traditional !== word) entry.traditional = traditional;
    else delete entry.traditional;
  }
  if (traditional !== word) changed++;
}
writeFileSync(DICT_PATH, toPythonJson(dictionary) + '\n');
console.log(`OpenCC ${OPENCC_VERSION} s2tw: ${changed} of ${Object.keys(dictionary).length} words have a different traditional form`);

// Maximum forward matching, as OpenCC does, then Taiwan variants.
function toTraditional(text) {
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length;) {
    let n = Math.min(maxLen, chars.length - i);
    while (n > 1 && !s2t.has(chars.slice(i, i + n).join(''))) n--;
    const key = chars.slice(i, i + n).join('');
    out += s2t.get(key) ?? key;
    i += n;
  }
  return [...out].map((c) => twVariants.get(c) ?? c).join('');
}

// "key<TAB>first candidate[ other candidates]" → key → first candidate.
function parseTable(text) {
  const table = new Map();
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.includes('\t')) continue;
    const [key, values] = line.split('\t');
    table.set(key, values.trim().split(' ')[0]);
  }
  return table;
}

// Same output as Python's json.dumps(ensure_ascii=False, indent=2,
// sort_keys=True), which generate-dictionary.py writes, so the two scripts
// don't reorder each other's output.
function toPythonJson(value, indent = '') {
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((v) => inner + toPythonJson(v, inner)).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort(byCodePoint);
    if (!keys.length) return '{}';
    return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${toPythonJson(value[k], inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

function byCodePoint(a, b) {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i].codePointAt(0) - y[i].codePointAt(0);
  }
  return x.length - y.length;
}

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}
