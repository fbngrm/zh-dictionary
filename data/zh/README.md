# zh data

`dictionary.json` is a learner-oriented word list
(`word → {pinyin, translation, part_of_speech, traditional}`) generated with
DeepSeek by `scripts/generate-dictionary.py` for words that
Mandarin-learning apps needed covered.

`traditional` (only present when it differs from the simplified word) is
added by `scripts/build-traditional.mjs` using the simplified → traditional
(Taiwan standard) tables of [OpenCC](https://github.com/BYVoid/OpenCC)
(Apache-2.0). Only the conversion results are stored here.

**License:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
(full text in [LICENSE](LICENSE)). Use it for anything; no attribution
needed for those generated fields. The added `hsk` field comes from
complete-hsk-vocabulary (MIT); retain [its copyright and license](../hsk/LICENSE).

Entries are machine-generated and only spot-checked. Corrections are
welcome.
