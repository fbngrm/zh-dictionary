# CC-CEDICT data

`cedict.json` is generated from [CC-CEDICT](https://cc-cedict.org/wiki/),
a community-maintained Chinese–English dictionary published by
[MDBG](https://www.mdbg.net/chinese/dictionary?page=cc-cedict). It
references CEDICT, Copyright (C) 1997, 1998 Paul Andrew Denisowski.

**License:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
(full text in [LICENSE](LICENSE)). This directory is an adaptation of
CC-CEDICT and is released under the same license. That is separate from
the code in this repo (MIT) and from `data/zh` (CC0).

**Changes from upstream** (made by `scripts/build-cedict.mjs`):

- converted to JSON, keyed by simplified form; the traditional form is kept
  in `traditional` when it differs
- numbered pinyin converted to tone marks (`lu:4` → `lǜ`)
- each entry's senses joined with `; ` into `translation`
- within a word, proper-noun readings (capitalised pinyin) ordered after
  common readings

The upstream release date and entry count are in [meta.json](meta.json).

## Using this data in an app

Apps that ship this data, whether bundled or downloaded at runtime, must:

1. **Credit it** where users can see it, for example on an About or
   licenses screen. `meta.json` has a ready-made `attribution` string.
2. **Keep it CC BY-SA 4.0** if you change it or merge it into your own
   database and distribute the result. Under §4(b) of the license, a
   database that includes a substantial part of this one counts as
   adapted material. Your app's code is not affected.

Commercial use is allowed.

## Updating

```bash
npm run build:cedict   # downloads the latest release from MDBG
npm test
```
