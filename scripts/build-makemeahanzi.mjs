#!/usr/bin/env node
// Builds two datasets from Make Me a Hanzi (https://github.com/skishore/makemeahanzi),
// kept apart because their sources have different licenses:
//
// - data/etymology/etymology.json (LGPL-3.0, from dictionary.txt): how each
//   character was formed (pictographic, ideographic, or a semantic part plus
//   a phonetic part) and which strokes belong to which component.
// - data/strokes/<code point>.json (Arphic Public License, from graphics.txt):
//   SVG outlines of each stroke in stroke order, plus stroke medians, on a
//   1024×1024 grid. One file per character so web apps fetch only what they
//   show, e.g. data/strokes/597d.json for 好.
//
// Usage:
//   node scripts/build-makemeahanzi.mjs                    # download the pinned commit
//   node scripts/build-makemeahanzi.mjs --input-dir <dir>  # use local dictionary.txt, graphics.txt
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const COMMIT = 'bddc96d41bef78427ed0e034e9f7e31d71fd1b92';
const BASE = `https://raw.githubusercontent.com/skishore/makemeahanzi/${COMMIT}/`;
const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

const inputIndex = process.argv.indexOf('--input-dir');
async function source(name) {
  if (inputIndex !== -1) return readFileSync(`${process.argv[inputIndex + 1]}/${name}`, 'utf8');
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${BASE + name}: HTTP ${res.status}`);
  return res.text();
}
const records = (text) => text.split('\n').filter(Boolean).map((line) => JSON.parse(line));

// dictionary.txt: {"character":"好","decomposition":"⿰女子","etymology":{"type":"ideographic",
// "hint":"A woman 女 with a son 子"},"radical":"女","matches":[[0],[0],[0],[1],[1],[1]]}.
// `matches` gives, per stroke, the path to its component in `decomposition`
// ([1] = second part, [1,0] = first part of the second part), or null.
const etymology = {};
for (const r of records(await source('dictionary.txt'))) {
  const e = r.etymology ?? {};
  const entry = {
    ...(e.type && { type: e.type }),
    ...(e.hint && { hint: e.hint }),
    ...(e.semantic && { semantic: e.semantic }),
    ...(e.phonetic && { phonetic: e.phonetic }),
    ...(r.decomposition && r.decomposition !== '？' && { decomposition: r.decomposition }),
    ...(r.matches?.some(Boolean) && { matches: r.matches }),
  };
  if (Object.keys(entry).length) etymology[r.character] = entry;
}
const body = Object.entries(etymology).map(([c, e]) => `${JSON.stringify(c)}:${JSON.stringify(e)}`).join(',\n');
writeFileSync(`${DATA_DIR}etymology/etymology.json`, `{\n${body}\n}\n`);

// graphics.txt: {"character":"好","strokes":["M 330 202 Q …"],"medians":[[[x,y],…],…]}.
rmSync(`${DATA_DIR}strokes/chars`, { recursive: true, force: true });
mkdirSync(`${DATA_DIR}strokes/chars`, { recursive: true });
let strokes = 0;
for (const r of records(await source('graphics.txt'))) {
  const name = r.character.codePointAt(0).toString(16);
  writeFileSync(`${DATA_DIR}strokes/chars/${name}.json`, JSON.stringify({ strokes: r.strokes, medians: r.medians }) + '\n');
  strokes++;
}

const meta = (name, count, license, licenseUrl, attribution) => JSON.stringify({
  name,
  source: { url: 'https://github.com/skishore/makemeahanzi', commit: COMMIT },
  characters: count,
  license,
  licenseUrl,
  attribution,
}, null, 2) + '\n';
writeFileSync(`${DATA_DIR}etymology/meta.json`, meta('etymology', Object.keys(etymology).length, 'LGPL-3.0-or-later',
  'https://www.gnu.org/licenses/lgpl-3.0.html',
  'Etymologies and stroke-to-component data from Make Me a Hanzi by Shaunak Kishore '
  + '(https://github.com/skishore/makemeahanzi), LGPL 3.0 or later.'));
writeFileSync(`${DATA_DIR}strokes/meta.json`, meta('strokes', strokes, 'Arphic-1999',
  'https://ftp.gnu.org/non-gnu/chinese-fonts-truetype/LICENSE',
  'Stroke order data from Make Me a Hanzi by Shaunak Kishore (https://github.com/skishore/makemeahanzi), '
  + 'derived from the fonts AR PL KaitiM GB and AR PL UKai, © 1999 Arphic Technology Co., Ltd., '
  + 'Arphic Public License.'));

console.log(`Make Me a Hanzi ${COMMIT.slice(0, 7)}: ${Object.keys(etymology).length} etymologies, ${strokes} stroke files`);
