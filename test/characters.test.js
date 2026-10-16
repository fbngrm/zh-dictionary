import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createCharacterIndex, sentenceFile, strokeFile } from '@fbngrm/zh-dictionary';
import zhData from '@fbngrm/zh-dictionary/data/zh.json' with { type: 'json' };
import hanzi from '@fbngrm/zh-dictionary/data/hanzi.json' with { type: 'json' };
import unihan from '@fbngrm/zh-dictionary/data/hanzi-unihan.json' with { type: 'json' };
import etymology from '@fbngrm/zh-dictionary/data/etymology.json' with { type: 'json' };
import hsk from '@fbngrm/zh-dictionary/data/hsk.json' with { type: 'json' };
import frequency from '@fbngrm/zh-dictionary/data/frequency.json' with { type: 'json' };

const index = createCharacterIndex({ hanzi, words: zhData, etymology, frequency, hsk });
// The per-file datasets, resolved through the exports map like an app would.
const resolve = createRequire(import.meta.url).resolve;
const dataFile = (path) => JSON.parse(readFileSync(resolve(`@fbngrm/zh-dictionary/data/${path}`), 'utf8'));

test('character data carries the extra Unihan fields', () => {
  const hao = hanzi['好'];
  assert.equal(hao.radicalNumber, 38);
  assert.equal(hao.extraStrokes, 3);
  assert.equal(hao.level, 1);
  assert.equal(hao.readingFrequency['hǎo'], 6060);
  assert.deepEqual(unihan['好'].cantonese, ['hou2']);
  assert.equal(unihan['好'].cangjie, 'VND');
});

test('words containing a character, most frequent first', () => {
  const words = index.wordsWith('好', { limit: 30 });
  assert.ok(words.includes('好像') && words.includes('爱好'));
  assert.ok(words.every((w) => w.includes('好') && w.length > 1));
  assert.ok(index.wordsWith('好', { position: 'start' }).every((w) => w.startsWith('好')));
  assert.ok(index.wordsWith('好', { position: 'end' }).every((w) => w.endsWith('好')));
  const ranked = words.filter((w) => index.wordRank(w) !== null);
  assert.deepEqual(ranked, [...ranked].sort((a, b) => index.wordRank(a) - index.wordRank(b)));
});

test('words containing a traditional character', () => {
  const words = index.wordsWith('媽');
  assert.ok(words.includes('妈妈'));
  const traditional = (w) => [zhData[w]].flat().map((e) => e.traditional ?? w);
  assert.ok(words.every((w) => traditional(w).some((t) => t.includes('媽'))));
  // 干 is 乾 in 干净 but 幹 in 干部.
  assert.ok(index.wordsWith('乾').includes('干净') && !index.wordsWith('乾').includes('干部'));
  assert.ok(index.wordsWith('幹').includes('干部'));
  assert.ok(index.wordsWith('媽', { position: 'start' }).every((w) => traditional(w).some((t) => t.startsWith('媽'))));
});

test('characters built from a component', () => {
  const chars = index.usedIn('女');
  assert.ok(chars.includes('好') && chars.includes('妈'));
  assert.ok(chars.every((c) => hanzi[c].components.includes('女')));
});

test('phonetic series from the etymologies', () => {
  assert.equal(etymology['妈'].phonetic, '马');
  const series = index.phoneticSeries('妈');
  assert.ok(series.includes('马') && series.includes('吗') && series.includes('码'));
  assert.ok(!series.includes('媽'), 'no traditional forms for a simplified character');
  assert.ok(index.phoneticSeries('马').includes('妈'));
});

test('decomposition tree', () => {
  const tree = index.decompose('好');
  assert.deepEqual(tree.components.map((c) => c.char), ['女', '子']);
  assert.deepEqual(index.decompose('好', 0).components, []);
  // Every node terminates (no cycles).
  const depth = (n) => 1 + Math.max(0, ...n.components.map(depth));
  assert.ok(depth(index.decompose('驚')) < 10);
});

test('frequency, coverage and HSK levels', () => {
  assert.equal(index.characterRank('的'), 1);
  assert.ok(index.characterRank('好') < index.characterRank('酱'));
  assert.ok(index.coverage('的') > 0 && index.coverage('的') < index.coverage('好'));
  assert.deepEqual(index.hsk('爱好'), { hsk2: 3, hsk3: 1, hsk3_2025: 2 });
  assert.equal(index.characterHsk('好').hsk3, 1);
  assert.equal(index.characterRank('不存在'), null);
  // From wordfreq, not the example sentences' corpora, which overuse 汤姆
  // (Tom) and spell out numbers.
  assert.ok(index.wordRank('汤姆') > 1000 && index.characterRank('零') > 1000);
});

test('stroke and sentence files', () => {
  const hao = dataFile(`strokes/${strokeFile('好')}`);
  assert.equal(hao.strokes.length, 6);
  assert.equal(hao.medians.length, 6);
  assert.equal(etymology['好'].matches.length, 6);
  const sentences = dataFile(`sentences/${sentenceFile('银行')}`)['银行'];
  assert.ok(sentences.length > 0 && sentences.every((s) => s.text.includes('银行')));
  const tatoeba = sentences.find((s) => s.source === 'tatoeba');
  assert.ok(tatoeba.en && tatoeba.by && Number.isInteger(tatoeba.id));
});

test('works without the optional datasets', () => {
  const bare = createCharacterIndex({ hanzi });
  assert.deepEqual(bare.wordsWith('好'), []);
  assert.equal(bare.characterRank('好'), null);
  assert.equal(bare.etymology('好'), null);
  assert.ok(bare.usedIn('女').includes('好'));
});
