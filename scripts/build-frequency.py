#!/usr/bin/env python3
"""
Builds data/frequency/frequency.json from wordfreq's Chinese word list
(https://github.com/rspeer/wordfreq, data CC BY-SA 4.0): how often each
dictionary word (data/zh and data/cedict) occurs per million words, and each
character per million characters, most frequent first.

wordfreq combines Wikipedia, subtitles (OpenSubtitles 2018 and SUBTLEX-CH),
news, books (Google Books Ngrams), web text, Twitter and Jieba's word list,
split into words with Jieba. It writes every character in one simplified
form (干 for 乾, 幹 and 干), so a word that differs from another dictionary
word only in such a character (於 → 于) gets no frequency of its own.
Characters are counted in wordfreq's words, weighted by their frequency.

Usage:
  pip install wordfreq==3.1.1
  python3 scripts/build-frequency.py

Run before scripts/build-sentences.mjs, which ranks example sentences by it.
"""
import gzip
import json
import re
from importlib.metadata import version
from pathlib import Path

import msgpack
import wordfreq
from wordfreq.util import data_path

WORDFREQ_VERSION = '3.1.1'
# Per million words. Rarer words are left out, which keeps the file small
# enough for web apps (wordfreq's list goes down to 0.01).
MIN_WORD = 0.1
MIN_CHARACTER = 0.01

DATA_DIR = Path(__file__).parent / '../data'
HAN = re.compile(r'^[㐀-鿿\U00020000-\U0003ffff]+$')

if version('wordfreq') != WORDFREQ_VERSION:
    raise SystemExit(f'needs wordfreq {WORDFREQ_VERSION}, found {version("wordfreq")}')

# wordfreq's own traditional/variant → simplified character map (what its
# lookups apply), read directly so Jieba is not needed.
SIMPLIFIED = msgpack.load(gzip.open(data_path('_chinese_mapping.msgpack.gz')), raw=False, strict_map_key=False)
counts = wordfreq.get_frequency_dict('zh', wordlist='large')

zh = json.loads((DATA_DIR / 'zh/dictionary.json').read_text(encoding='utf-8'))
cedict = json.loads((DATA_DIR / 'cedict/cedict.json').read_text(encoding='utf-8'))
lexicon = {w for w in [*zh, *cedict] if HAN.match(w)}

words = {}
for word in lexicon:
    key = word.translate(SIMPLIFIED)
    if key != word and key in lexicon:
        continue
    rate = counts.get(key, 0) * 1e6
    if rate >= MIN_WORD:
        words[word] = round(rate, 2)

characters = {}
total = 0
for word, share in counts.items():
    if not HAN.match(word):
        continue
    for c in word:
        characters[c] = characters.get(c, 0) + share
    total += share * len(word)
characters = {c: round(n / total * 1e6, 2) for c, n in characters.items() if n / total * 1e6 >= MIN_CHARACTER}


def ranked(rates):
    return dict(sorted(rates.items(), key=lambda kv: (-kv[1], kv[0])))


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


out = DATA_DIR / 'frequency'
(out / 'frequency.json').write_text(
    f'{{"characters":{compact(ranked(characters))},\n"words":{compact(ranked(words))}}}\n', encoding='utf-8')
(out / 'meta.json').write_text(json.dumps({
    'name': 'frequency',
    'source': {
        'name': 'wordfreq',
        'version': WORDFREQ_VERSION,
        'wordlist': 'large_zh',
        'url': 'https://github.com/rspeer/wordfreq',
        'license': 'CC-BY-SA-4.0',
    },
    'unit': {'words': 'occurrences per million words', 'characters': 'occurrences per million characters'},
    'words': len(words),
    'characters': len(characters),
    'license': 'CC-BY-SA-4.0',
    'attribution': 'Word frequencies from wordfreq by Robyn Speer (https://github.com/rspeer/wordfreq, '
                   'doi:10.5281/zenodo.7199437), CC BY-SA 4.0. Its Chinese data draws on Wikipedia, '
                   'OpenSubtitles 2018 (https://www.opensubtitles.org/), SUBTLEX-CH by Qing Cai and '
                   'Marc Brysbaert (SUBTLEX is freely available data), Google Books Ngrams '
                   '(http://books.google.com/ngrams), news, web text, Twitter and the Jieba word list.',
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'wordfreq {WORDFREQ_VERSION}: {len(words)} of {len(lexicon)} dictionary words, {len(characters)} characters')
