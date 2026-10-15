import test from 'node:test';
import assert from 'node:assert/strict';
import hsk from '../data/hsk/hsk.json' with { type: 'json' };
import syllabus from '../data/hsk/2025.json' with { type: 'json' };
import words from '../data/zh/dictionary.json' with { type: 'json' };
import cedict from '../data/cedict/cedict.json' with { type: 'json' };

test('the complete 2025 syllabus is represented without losing homographs', () => {
  assert.equal(syllabus.length, 11000);
  assert.equal(new Set(syllabus.map((r) => r.id)).size, 11000);
  assert.equal(new Set(syllabus.map((r) => r.hanzi)).size, 10896);
  const minima = {};
  for (const row of syllabus) minima[row.hanzi] = Math.min(minima[row.hanzi] ?? 7, Number(row.level.split('-')[0]));
  for (const [word, level] of Object.entries(minima)) {
    assert.equal(hsk[word].hsk3_2025, level, word);
    const entries = [words[word] ?? cedict[word]].flat();
    assert.ok(entries.length && entries[0], `Missing word ${word}`);
    for (const entry of entries) assert.equal(entry.hsk.hsk3_2025, level, word);
  }
});

test('previously omitted beginner words now have the correct level', () => {
  for (const word of ['没事', '哪个', '那个', '你好', '一下', '这个']) assert.equal(hsk[word].hsk3_2025, 1);
  assert.deepEqual(hsk['爱好'], { hsk2: 3, hsk3: 1, hsk3_2025: 2 });
});
