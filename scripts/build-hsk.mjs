#!/usr/bin/env node
// Builds data/hsk/hsk.json: the HSK 2.0 (levels 1–6) and HSK 3.0 (levels 1–6,
// and 7 for the 7–9 band) levels present in the source mapping, from
// complete-hsk-vocabulary by Yanis Zafirópulos (MIT).
//
// Usage:
//   node scripts/build-hsk.mjs                    # download the pinned commit
//   node scripts/build-hsk.mjs --input-dir <dir>  # use a local complete.min.json
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const COMMIT = '7ac65bf1a6387d35f1ade478906172a19311c7f9';
const URL_ = `https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/${COMMIT}/complete.min.json`;
const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

const inputIndex = process.argv.indexOf('--input-dir');
const words = inputIndex !== -1
  ? JSON.parse(readFileSync(`${process.argv[inputIndex + 1]}/complete.min.json`, 'utf8'))
  : await (await fetch(URL_)).json();

// Prefixes: o = HSK 2.0, n = 2021 standard, t = 2025 syllabus (incomplete).
const hsk = {};
for (const { s: word, l: levels } of words) {
  const level = (prefix) => Math.min(...levels.filter((l) => l[0] === prefix).map((l) => Number(l.slice(1))));
  const entry = {
    ...(Number.isFinite(level('o')) && { hsk2: level('o') }),
    ...(Number.isFinite(level('n')) && { hsk3: level('n') }),

  };
  if (Object.keys(entry).length) hsk[word] = entry;
}

// The complete November 2025 syllabus supersedes the partial t-prefix mapping.
const SYLLABUS_COMMIT = '6859875bf3ba3b7209dee3b23171f893f7493776';
const SYLLABUS_SOURCE = 'https://github.com/uranbekanarbaev/hsk-3.0-vocabulary-dataset';
const syllabusInput = process.argv.indexOf('--syllabus');
const syllabusText = syllabusInput !== -1
  ? readFileSync(process.argv[syllabusInput + 1], 'utf8')
  : await (await fetch(`https://raw.githubusercontent.com/uranbekanarbaev/hsk-3.0-vocabulary-dataset/${SYLLABUS_COMMIT}/data/hsk-3.0-all.json`)).text();
const syllabus = JSON.parse(syllabusText);
const counts = {};
if (syllabus.length !== 11000 || new Set(syllabus.map((r) => r.id)).size !== 11000) throw new Error('Unexpected syllabus entry count');
for (const row of syllabus) {
  if (!row.hanzi || !['1', '2', '3', '4', '5', '6', '7-9'].includes(row.level)) throw new Error('Invalid syllabus row');
  const level = Number(row.level.split('-')[0]);
  counts[row.level] = (counts[row.level] ?? 0) + 1;
  const entry = hsk[row.hanzi] ??= {};
  // Different readings/senses share a spelling: retain the lowest introduction level.
  entry.hsk3_2025 = Math.min(entry.hsk3_2025 ?? 7, level);
}
if (JSON.stringify(Object.values(counts)) !== JSON.stringify([300, 200, 500, 1000, 1600, 1800, 5600])) throw new Error('Unexpected per-level totals');
writeFileSync(`${DATA_DIR}hsk/2025.json`, JSON.stringify(syllabus) + '\n');
const body = Object.entries(hsk).map(([w, e]) => `${JSON.stringify(w)}:${JSON.stringify(e)}`).join(',\n');
writeFileSync(`${DATA_DIR}hsk/hsk.json`, `{\n${body}\n}\n`);
writeFileSync(`${DATA_DIR}hsk/meta.json`, JSON.stringify({
  name: 'hsk',
  source: { url: 'https://github.com/drkameleon/complete-hsk-vocabulary', commit: COMMIT },
  syllabus2025: { url: SYLLABUS_SOURCE, commit: SYLLABUS_COMMIT,
    sha256: createHash('sha256').update(syllabusText).digest('hex'),
    officialPdf: 'https://hsk.cn-bj.ufileos.com/3.0/%E6%96%B0%E7%89%88HSK%E8%80%83%E8%AF%95%E5%A4%A7%E7%BA%B21219.pdf',
    entries: syllabus.length, spellings: new Set(syllabus.map((r) => r.hanzi)).size, entriesByLevel: counts },
  words: Object.keys(hsk).length,
  license: 'MIT for HSK 2.0 and 2021 mappings; original syllabus rights retained for 2025, see SOURCE-RIGHTS-2025.md',
  versions: { hsk2: 'HSK 2.0', hsk3: 'HSK 3.0 (2021)', hsk3_2025: 'HSK 3.0 (November 2025 syllabus)' },
  coverageNote: 'All 11,000 syllabus entries / 10,896 spellings represented. Word lookup uses the lowest level across readings and senses; no word-sense disambiguation.',
  attribution: 'HSK 2.0 and 2021 mappings: complete-hsk-vocabulary by Yanis Zafiropulos (https://github.com/drkameleon/complete-hsk-vocabulary), MIT. HSK 2025 syllabus: Center for Language Education and Cooperation / Chinese Testing International; transcription by hsk-tutor.com (https://github.com/uranbekanarbaev/hsk-3.0-vocabulary-dataset). Original syllabus rights retained.',
}, null, 2) + '\n');
console.log(`Built ${Object.keys(hsk).length} word mappings; complete 2025 syllabus: ${syllabus.length} entries.`);
