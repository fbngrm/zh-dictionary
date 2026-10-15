# Frequency data

`frequency.json` gives how often each character, and each dictionary word,
occurs per million characters, most frequent first:

```json
{"characters":{"的":32738.52,"我":19178.87,…},"words":{"的":25667.61,…}}
```

Counted in about 3 million characters of text: Tatoeba's Mandarin sentences
(everyday language) and the AISHELL-1 and AISHELL-3 transcripts (news and
other text read aloud). Each corpus has equal weight, so AISHELL-1, which
is two thirds of the text, does not dominate. Words are found by splitting
sentences at the longest dictionary match (data/zh and data/cedict),
checked against the Stanford segmenter: a word only counts where the
segmenter does not cut through it or join it with its neighbours, so 让我们
does not count as 让我, nor 二零零九年 as 二 and 零. Words seen fewer than
twice are left out. Expect some bias: character counts include the numbers
AISHELL spells out (二, 零), and Tatoeba's example sentences use 汤姆 (Tom) a
lot.

`createCharacterIndex()` turns this into ranks (`characterRank`,
`wordRank`) and text coverage (`coverage`).

**License:** CC BY 4.0. Credit: computed from Tatoeba (https://tatoeba.org/,
CC BY 2.0 FR) and the AISHELL-1/AISHELL-3 corpora (Apache License 2.0).
Rebuild with `scripts/build-sentences.mjs` (needs local corpora, see the
script).
