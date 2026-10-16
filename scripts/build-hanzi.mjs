#!/usr/bin/env node
// Builds data/hanzi/hanzi.json: per-character readings, definition, radical,
// stroke count, traditional/simplified variants and decomposition, for every
// character used in data/zh and data/cedict plus their components, with the
// radical number, level in the Table of General Standard Chinese Characters,
// reading frequencies, semantic variants and phonetic groups.
// Also builds data/hanzi/unihan.json, the rest of what a full character entry
// shows (as in Pleco's Unihan tab), kept separate so apps that bundle
// hanzi.json stay small: Cantonese, Japanese, Korean, Vietnamese and Middle
// Chinese readings, Cangjie and Four-Corner codes.
//
// Usage:
//   node scripts/build-hanzi.mjs                    # download sources
//   node scripts/build-hanzi.mjs --input-dir <dir>  # use local Unihan.zip, CJKRadicals.txt, IDS.TXT
//
// Sources:
// - Unicode Unihan database + CJKRadicals.txt: Unicode License v3
// - BabelStone IDS (Andrew West): no rights claimed, free for any use
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SOURCES = {
  'Unihan.zip': 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip',
  'CJKRadicals.txt': 'https://www.unicode.org/Public/UCD/latest/ucd/CJKRadicals.txt',
  'IDS.TXT': 'https://babelstone.co.uk/CJK/IDS.TXT',
};
const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
// Ideographic description characters (⿰⿱…) and BabelStone's markers for
// components with no encoded character ({1}…{99}, ？).
const NOT_A_COMPONENT = /[⿰-⿿㇯{}0-9？]/u;
const HAN = /\p{Script=Han}/u;

const inputIndex = process.argv.indexOf('--input-dir');
const files = Object.fromEntries(await Promise.all(Object.entries(SOURCES).map(async ([name, url]) => [
  name,
  inputIndex === -1
    ? Buffer.from(await (await fetchOk(url)).arrayBuffer())
    : readFileSync(`${process.argv[inputIndex + 1]}/${name}`),
])));

// Unihan: "U+597D<TAB>kMandarin<TAB>hǎo" lines across several files.
const unihan = new Map();
let unicodeVersion;
for (const [name, content] of unzip(files['Unihan.zip'])) {
  if (!/^Unihan_(Readings|Variants|IRGSources|DictionaryLikeData|OtherMappings)\.txt$/.test(name)) continue;
  for (const line of content.toString('utf8').split('\n')) {
    unicodeVersion ??= line.match(/^# Unicode Version (\S+)/)?.[1];
    const m = line.match(/^U\+([0-9A-F]+)\t(k\w+)\t(.*)$/);
    if (!m) continue;
    const char = String.fromCodePoint(parseInt(m[1], 16));
    if (!unihan.has(char)) unihan.set(char, {});
    unihan.get(char)[m[2]] = m[3];
  }
}

// "38; 2F25; 5973" → radical 38 is 女; "149'; 2EC8; 8BA0" → simplified 讠.
const radicals = new Map();
for (const line of files['CJKRadicals.txt'].toString('utf8').split('\n')) {
  const m = line.match(/^(\d+'*); ([0-9A-F]+); ([0-9A-F]*)/);
  if (m) radicals.set(m[1], String.fromCodePoint(parseInt(m[3] || m[2], 16)));
}

// "U+7684<TAB>的<TAB>^⿰白勺$(GHTJPV)<TAB>^⿰白⿹勹丶$(K)": prefer the
// mainland (G) form, then Taiwan (T), then whatever comes first.
const ids = new Map();
const idsText = files['IDS.TXT'].toString('utf8');
const idsDate = idsText.match(/^# File Date: (\S+)/m)?.[1];
for (const line of idsText.split(/\r?\n/)) {
  if (!line.startsWith('U+')) continue;
  const [, char, ...rest] = line.split('\t');
  const sequences = rest.filter((s) => s.startsWith('^')).map((s) => {
    // Bracketed tags like "[K]" are secondary sources; ignore them.
    const m = s.match(/^\^(.*)\$(?:\(([^)]*)\))?$/);
    return { ids: m[1], sources: (m[2] ?? '').replace(/\[\w*\]/g, '') };
  });
  const best = sequences.find((s) => s.sources.includes('G'))
    ?? sequences.find((s) => s.sources.includes('T'))
    ?? sequences[0];
  if (best && best.ids !== char) ids.set(char, best.ids);
}

// kMandarin holds only the customary reading(s); the dictionary-index fields
// list every reading ("1279.050:háng 1279.060:xíng", "10.0123:háng,xíng").
// Most common first, duplicates dropped.
function readings(u) {
  const fromIndex = (field) => (u[field] ?? '').split(' ').flatMap((v) => v.split(':')[1]?.split(',') ?? []);
  return [...new Set([
    ...(u.kMandarin?.split(' ') ?? []),
    ...fromIndex('kTGHZ2013'),
    ...fromIndex('kXHC1983'),
    ...fromIndex('kHanyuPinyin'),
  ])];
}

const components = (char) => [...(ids.get(char) ?? '')].filter((c) => !NOT_A_COMPONENT.test(c));

const list = (value) => value?.split(' ').filter(Boolean) ?? [];
const codePoints = (value) => [...new Set(list(value).map((v) => String.fromCodePoint(parseInt(v.slice(2), 16))))];

// The learner-facing extra Unihan fields, only where present.
function unihanExtras(char, u) {
  // "38.3": radical 38 plus 3 strokes; "149'.2": the simplified form of 149.
  const [radicalNumber, extraStrokes] = (u.kRSUnicode?.split(' ')[0] ?? '').replace(/'+/, '').split('.');
  // "2013:581": position in the 2013 Table of General Standard Chinese
  // Characters; 1–3500 are level 1 (common), up to 6500 level 2, then level 3.
  const tgh = Number(u.kTGH?.match(/2013:(\d+)/)?.[1]);
  // "hǎo(6060) hāo(142) hào(115)": counts per reading in the Xiandai Hanyu
  // Pinlu Cidian (1986).
  const pinlu = Object.fromEntries(list(u.kHanyuPinlu).map((v) => v.match(/^(.+)\((\d+)\)$/)).filter(Boolean)
    .map(([, reading, count]) => [reading, Number(count)]));
  const semanticVariants = codePoints(u.kSemanticVariant?.replace(/<\S+/g, '')).filter((v) => v !== char);
  return {
    ...(radicalNumber && { radicalNumber: Number(radicalNumber) }),
    ...(extraStrokes && { extraStrokes: Number(extraStrokes) }),
    ...(tgh && { level: tgh <= 3500 ? 1 : tgh <= 6500 ? 2 : 3 }),
    ...(Object.keys(pinlu).length && { readingFrequency: pinlu }),
    ...(semanticVariants.length && { semanticVariants }),
    // Groups in Casey's "Ten Thousand Characters": characters sharing a
    // number share a phonetic element. Starred ("481*") entries are irregular.
    ...(u.kPhonetic && { phoneticGroups: [...new Set(list(u.kPhonetic).map((v) => Number(v.replace(/\D+$/, ''))))] }),
  };
}

// Other languages' readings and input codes, for data/hanzi/unihan.json.
function unihanReadings(u) {
  return {
    ...(u.kCantonese && { cantonese: list(u.kCantonese) }),
    ...(u.kJapanese && { japanese: list(u.kJapanese) }),
    ...(u.kHangul && { korean: list(u.kHangul).map((v) => v.split(':')[0]) }),
    ...(u.kVietnamese && { vietnamese: list(u.kVietnamese) }),
    ...(u.kTang && { middleChinese: list(u.kTang).map((v) => v.replace(/^\*/, '')) }),
    ...(u.kCangjie && { cangjie: u.kCangjie }),
    ...(u.kFourCornerCode && { fourCorner: list(u.kFourCornerCode) }),
  };
}

// Every character in either dataset (both scripts), then their components.
const wanted = new Set();
for (const file of ['zh/dictionary.json', 'cedict/cedict.json']) {
  const data = JSON.parse(readFileSync(DATA_DIR + file, 'utf8'));
  for (const [word, value] of Object.entries(data)) {
    for (const text of [word, ...[value].flat().map((e) => e.traditional ?? '')]) {
      for (const c of text) if (HAN.test(c)) wanted.add(c);
    }
  }
}
for (const c of wanted) for (const part of components(c)) wanted.add(part);

const hanzi = {};
const unihanExtra = {};
for (const char of [...wanted].sort((a, b) => a.codePointAt(0) - b.codePointAt(0))) {
  const u = unihan.get(char) ?? {};
  const radical = radicals.get(u.kRSUnicode?.split(/[ .]/)[0]);
  const variants = (field) => u[field]?.split(' ')
    .map((v) => String.fromCodePoint(parseInt(v.slice(2), 16)))
    .filter((v) => v !== char);
  const entry = {
    ...(readings(u).length && { pinyin: readings(u) }),
    ...(u.kDefinition && { definition: u.kDefinition }),
    ...(radical && { radical }),
    ...(u.kTotalStrokes && { strokes: Number(u.kTotalStrokes.split(' ')[0]) }),
    ...(ids.has(char) && { decomposition: ids.get(char), components: components(char) }),
    ...(variants('kTraditionalVariant')?.length && { traditional: variants('kTraditionalVariant') }),
    ...(variants('kSimplifiedVariant')?.length && { simplified: variants('kSimplifiedVariant') }),
    ...unihanExtras(char, u),
  };
  if (Object.keys(entry).length) hanzi[char] = entry;
  const more = unihanReadings(u);
  if (Object.keys(more).length) unihanExtra[char] = more;
}

// One character per line keeps diffs readable.
const lines = (data) => `{\n${Object.entries(data).map(([c, e]) => `${JSON.stringify(c)}:${JSON.stringify(e)}`).join(',\n')}\n}\n`;
writeFileSync(`${DATA_DIR}hanzi/hanzi.json`, lines(hanzi));
writeFileSync(`${DATA_DIR}hanzi/unihan.json`, lines(unihanExtra));
writeFileSync(`${DATA_DIR}hanzi/meta.json`, JSON.stringify({
  name: 'hanzi',
  sources: {
    unihan: { version: unicodeVersion, url: SOURCES['Unihan.zip'], license: 'Unicode-3.0' },
    cjkRadicals: { version: unicodeVersion, url: SOURCES['CJKRadicals.txt'], license: 'Unicode-3.0' },
    babelstoneIds: { date: idsDate, url: SOURCES['IDS.TXT'], license: 'no rights claimed' },
  },
  characters: Object.keys(hanzi).length,
  license: 'Unicode-3.0',
  licenseUrl: 'https://www.unicode.org/license.txt',
  attribution: 'Character data from the Unicode Character Database (Unihan), '
    + 'Copyright © Unicode, Inc., Unicode License v3 (https://www.unicode.org/license.txt); '
    + 'decompositions from the BabelStone IDS database by Andrew West (https://babelstone.co.uk/CJK/IDS.TXT).',
}, null, 2) + '\n');

console.log(`Unihan ${unicodeVersion}, BabelStone IDS ${idsDate}: ${Object.keys(hanzi).length} characters`);

// Minimal ZIP reader (stored and deflated entries), so the build needs no
// dependencies or unzip binary.
function* unzip(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = zip.readUInt32LE(end + 16);
  for (let i = zip.readUInt16LE(end + 10); i > 0; i--) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLength);
    p += 46 + nameLength + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);
    yield [name, method === 8 ? inflateRawSync(raw) : raw];
  }
}

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}
