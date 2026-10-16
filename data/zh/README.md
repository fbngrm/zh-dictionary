# zh data

`dictionary.json` is a learner-oriented word list
(`word → {pinyin, translation, part_of_speech, traditional, tags}`) generated
with DeepSeek by `scripts/generate-dictionary.py` for words that
Mandarin-learning apps needed covered.

It also covers place names, with candidates from
[Wikidata](https://www.wikidata.org) (CC0), plus slang, internet slang, youth
jargon and swear words, with candidates proposed and verified by DeepSeek.
Those entries carry `tags` (`place`, `slang`, `internet`, `vulgar`). See
"Slang, swear words and place names" in the main README.

`traditional` (only present when it differs from the simplified word) is
added by `scripts/build-traditional.mjs` using the simplified → traditional
(Taiwan standard) tables of [OpenCC](https://github.com/BYVoid/OpenCC)
(Apache-2.0). Only the conversion results are stored here.

**License:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
(full text in [LICENSE](LICENSE)). Use it for anything; no attribution
needed for those generated fields. The added `hsk` fields and the two syllabus-only entries
retain the separate source notices in [data/hsk](../hsk/README.md). Those fields
are not relicensed by the CC0 notice for generated definitions.

Entries are machine-generated and only spot-checked. Corrections are
welcome.
