import { test } from 'node:test';
import assert from 'node:assert/strict';
// Imported through the package's own exports map, as an app would.
import { createDictionary, splitPinyin } from '@fbngrm/zh-dictionary';
import zhData from '@fbngrm/zh-dictionary/data/zh.json' with { type: 'json' };
import cedict from '@fbngrm/zh-dictionary/data/cedict.json' with { type: 'json' };
import cedictMeta from '@fbngrm/zh-dictionary/data/cedict.meta.json' with { type: 'json' };
import * as zh from '@fbngrm/zh-dictionary/zh';
import * as cedictMode from '@fbngrm/zh-dictionary/cedict';

const data = {
  好: { pinyin: 'hǎo', translation: 'good', part_of_speech: 'adjective' },
  行: [
    { pinyin: 'xíng', translation: 'to walk' },
    { pinyin: 'háng', translation: 'row' },
  ],
  发: [
    { pinyin: 'fā', translation: 'to send out', traditional: '發' },
    { pinyin: 'fà', translation: 'hair', traditional: '髮' },
  ],
};

test('looks up single and multi-reading words', () => {
  const dict = createDictionary(data);
  assert.equal(dict.lookup('好').translation, 'good');
  assert.equal(dict.lookup('行').pinyin, 'xíng');
  assert.equal(dict.lookupAll('行').length, 2);
});

test('missing words and prototype keys are not found', () => {
  const dict = createDictionary(data);
  assert.equal(dict.lookup('不在'), null);
  assert.deepEqual(dict.lookupAll('不在'), []);
  assert.equal(dict.has('constructor'), false);
  assert.equal(dict.lookup('toString'), null);
});

test('traditional forms resolve to the matching reading only', () => {
  const dict = createDictionary(data);
  assert.deepEqual(dict.lookupAll('髮').map((e) => e.translation), ['hair']);
  assert.equal(dict.lookup('發').pinyin, 'fā');
});

test('earlier sources take priority, lookupAll merges in order', () => {
  const dict = createDictionary([{ 好: { pinyin: 'hǎo', translation: 'override' } }, data]);
  assert.equal(dict.lookup('好').translation, 'override');
  assert.deepEqual(dict.lookupAll('好').map((e) => e.translation), ['override', 'good']);
});

test('bundled zh data', () => {
  const dict = createDictionary(zhData);
  assert.equal(dict.lookup('口罩').translation, 'face mask');
});

test('bundled CC-CEDICT data', () => {
  const dict = createDictionary(cedict);
  assert.equal(dict.lookup('口罩').pinyin, 'kǒu zhào');
  assert.equal(dict.lookup('女').pinyin, 'nǚ');
  assert.equal(dict.lookup('绿').pinyin, 'lù');
  assert.ok(dict.lookupAll('绿').some((e) => e.pinyin === 'lǜ'));
  assert.equal(dict.lookup('安').pinyin, 'ān'); // not "surname An"
  assert.equal(dict.lookup('北京').pinyin, 'Běi jīng');
  assert.equal(dict.lookup('女兒').translation, 'daughter');
  assert.equal(Object.keys(cedict).length, cedictMeta.words);
  assert.match(cedictMeta.attribution, /CC-CEDICT.*CC BY-SA 4\.0/);
});

test('zh mode uses our data only', () => {
  assert.equal(zh.lookup('口罩').translation, 'face mask');
  assert.equal(zh.lookup('口罩').part_of_speech, 'noun');
  assert.equal(zh.lookup('說話').translation, zh.lookup('说话').translation); // traditional via OpenCC
  assert.match(zh.attribution, /Unicode/);
  assert.doesNotMatch(zh.attribution, /CEDICT/);
});

test('cedict mode uses CC-CEDICT only, with attribution', () => {
  assert.equal(cedictMode.lookup('口罩').translation, 'mask (surgical etc)');
  assert.equal(cedictMode.lookup('口罩').part_of_speech, undefined);
  assert.equal(cedictMode.lookup('女兒').translation, 'daughter');
  assert.ok(cedictMode.attribution.startsWith(cedictMeta.attribution));
  assert.match(cedictMode.attribution, /Unicode/);
});

test('splitPinyin matches each character against its readings', () => {
  const readings = { 银: ['yín'], 行: ['xíng', 'háng'], 一: ['yī'], 点: ['diǎn'], 儿: ['ér'], 西: ['xī'], 安: ['ān'] };
  const of = (c) => readings[c] ?? [];
  assert.deepEqual(splitPinyin('yínháng', [...'银行'], of), ['yín', 'háng']);
  assert.deepEqual(splitPinyin('yīdiǎnr', [...'一点儿'], of), ['yī', 'diǎn', 'r']);
  assert.deepEqual(splitPinyin("Xī'ān", [...'西安'], of), ['Xī', 'ān']);
  assert.deepEqual(splitPinyin('yí háng', [...'一行'], of), ['yí', 'háng']); // tone sandhi
  assert.equal(splitPinyin('yínhángxíng', [...'银行'], of), null);
});

test('describe breaks a word into characters', () => {
  const dict = createDictionary(data, {
    hanzi: {
      发: { pinyin: ['fā', 'fà'], radical: '又', strokes: 5, decomposition: '⿺⿸⿻𠃋丿又丶', components: ['𠃋', '丿', '又', '丶'] },
      好: { pinyin: ['hǎo'], definition: 'good, excellent', decomposition: '⿰女子', components: ['女', '子'] },
    },
  });
  assert.equal(dict.describe('不在'), null);
  assert.deepEqual(dict.describe('髮'), {
    word: '发', traditional: '髮', pinyin: 'fà', translation: 'hair',
    characters: [{
      char: '发', traditional: '髮', pinyin: 'fà', meaning: 'hair', radical: '又', strokes: 5,
      decomposition: '⿺⿸⿻𠃋丿又丶', components: ['𠃋', '丿', '又', '丶'],
    }],
  });
  assert.equal(dict.describe('好').characters[0].meaning, 'good');
  assert.equal(dict.character('好').decomposition, '⿰女子');
  assert.equal(dict.character('constructor'), null);
  assert.equal(createDictionary(data).character('好'), null);
});

test('describe with bundled data, both modes', () => {
  for (const mode of [zh, cedictMode]) {
    const bank = mode.describe('银行');
    assert.equal(bank.traditional, '銀行');
    assert.deepEqual(bank.characters.map((c) => c.pinyin), ['yín', 'háng']);
    assert.deepEqual(bank.characters[0].components, ['钅', '艮']);
    assert.equal(bank.characters[0].traditional, '銀');
  }
  assert.equal(zh.describe('头发').traditional, '頭髮');
  assert.equal(cedictMode.character('說').simplified[0], '说');
});
