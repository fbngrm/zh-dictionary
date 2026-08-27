# @fbngrm/zh-dictionary

A shared tap-to-translate word dictionary for Mandarin-learning apps
(`word → {pinyin, translation, part_of_speech}`), used as the fallback
lookup for words that aren't already covered by an app's own vocabulary
list (e.g. HSK word lists). Originally split between tingting's
`data/storyDictionary.json` and zh-patterns' `story_dictionary.json`;
merged here as the single source of truth so both apps (and future ones)
read and grow the same data instead of maintaining separate copies.

## Install

Add as a git-ref dependency, same pattern as `@fbngrm/app-sdk`:

```json
"dependencies": {
  "@fbngrm/zh-dictionary": "github:fbngrm/zh-dictionary#v0.1.0"
}
```

## Use

```ts
import { lookupWord } from '@fbngrm/zh-dictionary/lookup';

const entry = lookupWord('口罩');
// { pinyin: 'kǒuzhào', translation: 'mask', part_of_speech: 'noun' }
```

Or import the raw dictionary JSON directly:

```ts
import dictionary from '@fbngrm/zh-dictionary/dictionary.json';
```

## Filling gaps with DeepSeek

`scripts/generate-dictionary.py` is app-agnostic — it doesn't know about any
app's data format. Each consuming app is responsible for computing two
plain JSON arrays and handing them to the script:

- **candidates**: every word the app wants tap-to-translate coverage for
  (e.g. tokens from example-sentence tiles, story text, etc.)
- **known** *(optional)*: words the app already has definitions for
  elsewhere (e.g. its own HSK vocabulary list) — excluded from the gap.

```bash
# from the app repo, produce the two files however makes sense there, e.g.:
python3 scripts/export-dictionary-candidates.py \
  --candidates /tmp/candidates.json --known /tmp/known.json

# then, from this repo:
DEEPSEEK_API_KEY=<key> python3 scripts/generate-dictionary.py \
  --candidates /tmp/candidates.json --known /tmp/known.json
```

This updates `src/data/dictionary.json` in place (resumable — already-covered
words are skipped unless `--force`). Commit, tag a new version, push tags,
then bump the `#vX.Y.Z` ref in each consuming app's `package.json`:

```bash
git add src/data/dictionary.json
git commit -m "Add words from <app> gap"
git tag vX.Y.Z
git push && git push --tags
```

Tokens longer than `--max-len` (default 4 hanzi) are treated as likely
word-segmentation artifacts and written to `src/data/dictionary.skipped.json`
for manual review instead of being sent to DeepSeek.
