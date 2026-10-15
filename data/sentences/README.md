# Example sentences

Up to 5 example sentences per word and character: up to 3 from
[Tatoeba](https://tatoeba.org/) with an English translation, and up to 2
transcripts from the [AISHELL-1](https://www.openslr.org/33/) and
[AISHELL-3](https://www.openslr.org/93/) speech corpora (no translation).
Sentences are split into words by the longest dictionary match (data/zh
and data/cedict), checked against the Stanford segmenter: a sentence is an
example for a word only where the segmenter does not cut through the word or
join it with its neighbours, so 让我们 is no example for 让我, nor
二零零九年 for 二. Easy, complete-looking sentences come first: around 8–16
characters with few rare words (by [frequency](../frequency/README.md)), and
no AISHELL transcripts cut off mid-phrase (…负责人对) unless there is
nothing else.
Characters that rarely stand alone also get sentences where they are part of
a word.

The ~48,000 words are spread over 256 files in `shards/` by the code point of
their first character (`shards/<code point % 256>.json`, see
`sentenceFile()`):

```json
"银行": [
  {"text":"我不喜欢在银行工作.","en":"I don't like working at the bank.","source":"tatoeba","id":…,"enId":…,"by":"…"},
  {"text":"某银行北京分行相关负责人对","source":"aishell1","id":"BAC009S0167W0285"}
]
```

Only sentences in simplified characters are used. Tatoeba sentences carry
the sentence numbers (`https://tatoeba.org/sentences/show/<id>`) and the
contributor's username for attribution.

**Licenses:** Tatoeba sentences are CC BY 2.0 FR: credit Tatoeba and its
contributors, for example with a link per sentence. AISHELL transcripts are
under the Apache License 2.0 (Beijing Shell Shell Technology Co., Ltd.).
Credit line: `attribution` in [meta.json](meta.json).

Rebuild with `scripts/build-sentences.mjs` (needs local copies of the
corpora, see the script).

## Grades and native audio

Examples include `grades.hsk3_2025` and `grades.hsk2`, with `level`,
`highestKnownLevel`, `coverage` (0–1), and `unlisted`. These estimate vocabulary
using simplified-text Intl.Segmenter tokens. Any unlisted Chinese token leaves
`level` null. The 2025 mapping is incomplete; this is not an official assessment.

AISHELL-3 examples also contain the original numeric-tone `pinyin` and a relative
`audio` path. Use `sentenceAudioUrl(id)` and `sentenceMetadataUrl(source, id)`
from the library for the pinned public corpus:
https://github.com/fbngrm/mandarin-sentence-audio/tree/v1.0.0

The corpus contains every AISHELL-3 recording with transcripts and grades, plus
all Mandarin Tatoeba sentences from its source snapshot. Only AISHELL-3 audio
is hosted; Tatoeba text licenses do not cover its recordings.
