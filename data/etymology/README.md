# Etymology data

`etymology.json` says how each of ~9,500 common characters was formed, from
[Make Me a Hanzi](https://github.com/skishore/makemeahanzi) by Shaunak
Kishore (`dictionary.txt`, which it derives from Unihan and CJKlib):

```json
"妈": {"type":"pictophonetic","hint":"woman","semantic":"女","phonetic":"马","decomposition":"⿰女马","matches":[[0],[0],[0],[1],[1],[1]]}
```

- `type`: `pictographic` (a drawing), `ideographic` (parts combined for
  their meaning, with a `hint`), or `pictophonetic` (`semantic` gives the
  meaning, `hint` explains it, `phonetic` gives the sound).
- `decomposition`: Make Me a Hanzi's own, which can differ from
  `data/hanzi`'s; `matches` refers to it.
- `matches`: per stroke (in stroke order, as in `data/strokes`), the path to
  the component it belongs to: `[0]` = first part, `[1, 0]` = first part of
  the second part, `null` = none.

**License:** [LGPL 3.0 or later](LICENSE), like `dictionary.txt`. Using the
file in an app is fine; if you change this file and distribute it, the
changed file stays under the LGPL. Credit Make Me a Hanzi (`attribution` in
[meta.json](meta.json)).

Rebuild with `npm run build:makemeahanzi` (pinned commit in the script).
