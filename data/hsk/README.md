# HSK vocabulary versions

`hsk.json` contains `hsk2` (HSK 2.0), `hsk3` (2021 standard), and
`hsk3_2025` (November 2025 examination syllabus). These versions are separate.
7 denotes the combined 7–9 band, not a specific advanced level.

The 2025 mapping now covers **all 11,000 entries and 10,896 spellings**, replacing
the previous partial t-prefix mapping. Different readings/senses of one spelling
use the lowest introduction level. `2025.json` preserves every original entry,
pinyin, level label, and source PDF page, including homographs.

Sources, hashes and pinned revisions are recorded in `meta.json`:
- HSK 2.0 and 2021: complete-hsk-vocabulary by Yanis Zafirópulos, [MIT](LICENSE).
- 2025: official syllabus by the Center for Language Education and Cooperation /
  Chinese Testing International, transcribed by hsk-tutor.com. Original syllabus
  rights are retained; see [the source notice](SOURCE-RIGHTS-2025.md). The MIT
  license for the older mappings does not relicense this syllabus content.

Word datasets carry the same fields under `hsk`. Character levels are inferred
from constituent words, not an official character syllabus. The two words absent
from both original dictionaries have pinyin and level data but no English definition.

Rebuild: `node scripts/build-hsk.mjs --input-dir /path/to/complete-hsk-vocabulary
--syllabus /path/to/hsk-3.0-all.json` (omit arguments to fetch pinned sources).
