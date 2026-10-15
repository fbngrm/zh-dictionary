#!/usr/bin/env node
// Builds data/hsk/hsk.json: the HSK 2.0 (levels 1–6) and HSK 3.0 (levels 1–6,
// and 7 for the 7–9 band) level of every word on the official lists, from
// complete-hsk-vocabulary by Yanis Zafirópulos (MIT).
//
// Usage:
//   node scripts/build-hsk.mjs                    # download the pinned commit
//   node scripts/build-hsk.mjs --input-dir <dir>  # use a local complete.min.json
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const COMMIT = '7ac65bf1a6387d35f1ade478906172a19311c7f9';
const URL_ = `https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/${COMMIT}/complete.min.json`;
const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

const inputIndex = process.argv.indexOf('--input-dir');
const words = inputIndex !== -1
  ? JSON.parse(readFileSync(`${process.argv[inputIndex + 1]}/complete.min.json`, 'utf8'))
  : await (await fetch(URL_)).json();

// {"s":"好","l":["t1","n1","o1"],…}: "o" levels are HSK 2.0, "n" levels HSK 3.0.
const hsk = {};
for (const { s: word, l: levels } of words) {
  const level = (prefix) => Math.min(...levels.filter((l) => l[0] === prefix).map((l) => Number(l.slice(1))));
  const entry = {
    ...(Number.isFinite(level('o')) && { hsk2: level('o') }),
    ...(Number.isFinite(level('n')) && { hsk3: level('n') }),
    ...(Number.isFinite(level('t')) && { hsk3_2025: level('t') }),
  };
  if (Object.keys(entry).length) hsk[word] = entry;
}

const body = Object.entries(hsk).map(([w, e]) => `${JSON.stringify(w)}:${JSON.stringify(e)}`).join(',\n');
writeFileSync(`${DATA_DIR}hsk/hsk.json`, `{\n${body}\n}\n`);
writeFileSync(`${DATA_DIR}hsk/meta.json`, JSON.stringify({
  name: 'hsk',
  source: { url: 'https://github.com/drkameleon/complete-hsk-vocabulary', commit: COMMIT },
  words: Object.keys(hsk).length,
  license: 'MIT',
  versions: { hsk2: 'HSK 2.0', hsk3: 'HSK 3.0 (2021)', hsk3_2025: 'HSK 3.0 (2025 syllabus, effective 2026)' },
  coverageNote: 'The t-level source annotates existing entries; it is not a complete transcription of the 2025 syllabus. Missing entries are unlisted, not necessarily beyond HSK.',
  attribution: 'HSK levels from complete-hsk-vocabulary by Yanis Zafirópulos '
    + '(https://github.com/drkameleon/complete-hsk-vocabulary), MIT License.',
}, null, 2) + '\n');
console.log(`complete-hsk-vocabulary ${COMMIT.slice(0, 7)}: ${Object.keys(hsk).length} words`);
