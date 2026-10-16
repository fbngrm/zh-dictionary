# Character data

`hanzi.json` has one record per character for every character used in
`data/zh` and `data/cedict` (simplified and traditional), plus their
components:

```json
"好": {"pinyin":["hǎo","hào"],"definition":"good, excellent, fine; well","radical":"女","strokes":6,"decomposition":"⿰女子","components":["女","子"]}
```

- `pinyin`, `definition`, `strokes`, `traditional` / `simplified`: from the
  [Unicode Unihan database](https://www.unicode.org/charts/unihan.html)
  (`kMandarin`, the reading fields of `kTGHZ2013` / `kXHC1983` /
  `kHanyuPinyin`, `kDefinition`, `kTotalStrokes`, `kTraditionalVariant` /
  `kSimplifiedVariant`)
- `radical`: from Unihan `kRSUnicode`, mapped to a character with Unicode's
  `CJKRadicals.txt`
- `decomposition`: an
  [ideographic description sequence](https://en.wikipedia.org/wiki/Ideographic_Description_Characters)
  from the [BabelStone IDS database](https://babelstone.co.uk/CJK/IDS.TXT)
  by Andrew West, preferring the mainland (G) glyph form. `{1}`… and `？`
  mark components with no encoded character. `components` lists the
  characters in it; look those up to decompose further.

Also from Unihan:

- `radicalNumber`, `extraStrokes`: the Kangxi radical number and the strokes
  beyond the radical (`kRSUnicode`)
- `level`: level in the 2013 Table of General Standard Chinese Characters,
  1 = the 3500 common characters, 2 = the next 3000, 3 = the rest (`kTGH`)
- `readingFrequency`: occurrences per reading in the Xiandai Hanyu Pinlu
  Cidian (`kHanyuPinlu`)
- `semanticVariants` (`kSemanticVariant`), `phoneticGroups`: Casey's
  phonetic groups, where characters sharing a number share a phonetic
  element (`kPhonetic`)

`unihan.json` has the rest of what a full character entry shows, kept apart
so `hanzi.json` stays small: `cantonese` (Jyutping), `japanese` (kana),
`korean` (Hangul), `vietnamese`, `middleChinese` (Tang reconstructions),
`cangjie` and `fourCorner` codes.

Source versions are in [meta.json](meta.json).

**License:** [Unicode License v3](LICENSE). Unihan data is
Copyright © Unicode, Inc. The license is permissive: commercial use and
modification are fine, as long as the copyright and permission notice are
included with copies of the data or in their documentation. Apps can show
`attribution` from `meta.json`, for example on a licenses screen.
BabelStone IDS data carries no rights ("anyone is free to make use of the
IDS data … without asking permission or providing attribution"); we credit
it anyway.

## Updating

```bash
npm run build:hanzi   # downloads the latest Unihan, CJKRadicals and BabelStone IDS
npm test
```

Run it after adding words to `data/zh` or updating `data/cedict`, so new
characters are covered.
