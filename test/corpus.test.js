import test from 'node:test';
import assert from 'node:assert/strict';
import { createDictionary, sentenceAudioUrl, sentenceMetadataUrl } from '../dist/index.js';
import words from '../data/zh/dictionary.json' with { type: 'json' };

test('word lookup and description preserve distinct syllabus levels', () => {
  const dictionary = createDictionary(words);
  assert.deepEqual(dictionary.lookup('爱好').hsk, { hsk2: 3, hsk3: 1, hsk3_2025: 2 });
  assert.deepEqual(dictionary.describe('爱好').hsk, dictionary.lookup('爱好').hsk);
  assert.deepEqual(dictionary.describe('愛好').hsk, dictionary.lookup('爱好').hsk);
});

test('recording and metadata helpers address the same versioned corpus', () => {
  assert.equal(sentenceAudioUrl('SSB00050001'), 'https://raw.githubusercontent.com/fbngrm/mandarin-sentence-audio/v1.0.0/audio/aishell3/SSB0005/SSB00050001.mp3');
  assert.equal(sentenceMetadataUrl('aishell3', 'SSB00050001'), 'https://raw.githubusercontent.com/fbngrm/mandarin-sentence-audio/v1.0.0/data/aishell3/SSB0005.json');
  assert.ok(sentenceMetadataUrl('tatoeba', 257).endsWith('/data/tatoeba/1.json'));
  assert.throws(() => sentenceAudioUrl('../secret'));
  assert.throws(() => sentenceMetadataUrl('tatoeba', -1));
});
