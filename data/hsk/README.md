# HSK vocabulary versions

Each word maps to optional `hsk2` (HSK 2.0), `hsk3` (2021 proficiency standard),
and `hsk3_2025` (November 2025 exam syllabus, printed effective date July 2026).
Level 7 represents the combined 7–9 band. Versions are not interchangeable.

Example: `"爱好": {"hsk2":3,"hsk3":1,"hsk3_2025":2}`.

Source: [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary)
by Yanis Zafirópulos, pinned to the commit in `meta.json`, [MIT](LICENSE).
The `o`, `n`, and `t` prefixes correspond to those three versions.

The 2025 mapping contains 10,057 spellings and is incomplete: upstream added
levels to existing dictionary entries. Missing labels mean **unlisted in this
source**, not necessarily beyond HSK. For example, this snapshot lacks 你好.
Character levels are inferred from constituent words, not an official character syllabus.

Word entries in both dictionary datasets also carry these levels under `hsk`.
Rebuild the lookup with `npm run build:hsk`; enrich words and examples with the
website's `scripts/enrich-dictionary.mjs` against the pinned corpus.
