# HSK levels

`hsk.json` maps each of the 11,470 words on the HSK 2.0 and HSK 3.0 lists to
its level, from
[complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary)
by Yanis Zafirópulos:

```json
"爱好": {"hsk2":3,"hsk3":1}
```

`hsk2` is the HSK 2.0 level (1–6), `hsk3` the HSK 3.0 level (1–6, or 7 for
the 7–9 band). `createCharacterIndex().characterHsk()` derives a
character's level from the words that contain it.

**License:** [MIT](LICENSE). Rebuild with `npm run build:hsk`.
