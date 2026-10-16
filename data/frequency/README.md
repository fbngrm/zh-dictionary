# Frequency data

`frequency.json` gives how often each dictionary word (data/zh and
data/cedict) occurs per million words, and each character per million
characters, most frequent first:

```json
{"characters":{"的":40517.08,"是":11952.86,…},"words":{"的":61659.5,…}}
```

Taken from [wordfreq](https://github.com/rspeer/wordfreq) 3.1.1 (its
`large_zh` list), the standard multi-source word frequency list. It
combines Wikipedia, subtitles (OpenSubtitles 2018 and SUBTLEX-CH), news,
books (Google Books Ngrams), web text, Twitter and the Jieba word list, split
into words with Jieba; the data is a snapshot of language up to about 2021.
Characters are counted in wordfreq's words, weighted by their frequency.

- Words rarer than 0.1 per million are left out (63,000 of 125,000
  dictionary words are kept, including 84% of data/zh).
- wordfreq writes every character in one simplified form (干 for 乾, 幹 and
  干), so a word that differs from another dictionary word only in such a
  character (於 for 于) has no frequency of its own.
- Phrases wordfreq splits into several words (一个小时) and 儿 forms
  (聊天儿) have no frequency.

`createCharacterIndex()` turns this into ranks (`characterRank`,
`wordRank`) and text coverage (`coverage`).

**License:** [CC BY-SA 4.0](LICENSE), like wordfreq's data. Credit
wordfreq and the sources it asks to credit, including the SUBTLEX-CH
authors (SUBTLEX is freely available data); the credit line is
`attribution` in [meta.json](meta.json). Rebuild with
`pip install wordfreq==3.1.1 && python3 scripts/build-frequency.py`.
