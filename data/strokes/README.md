# Stroke data

One file per character in `chars/`, named by its code point in hex
(`chars/597d.json` for 好, see `strokeFile()`), for ~9,500 characters, from
[Make Me a Hanzi](https://github.com/skishore/makemeahanzi) (`graphics.txt`):

```json
{"strokes":["M 330 202 Q 361 175 …", …],"medians":[[[x,y],…],…]}
```

- `strokes`: the outline of each stroke as SVG path data, in stroke order.
- `medians`: each stroke's centre line, for animating or for drawing
  practice.

Coordinates are on a 1024×1024 grid with y pointing up. Draw the paths
inside `<g transform="scale(1, -1) translate(0, -900)">` in a
`viewBox="0 0 1024 1024"`. `matches` in `data/etymology` gives each stroke's
component.

**License:** [Arphic Public License](LICENSE) (1999). The outlines are
derived from the fonts AR PL KaitiM GB and AR PL UKai by Arphic Technology.
Commercial use is allowed; include the license, and changes to the stroke
data stay under it. Credit line: `attribution` in [meta.json](meta.json).

Rebuild with `npm run build:makemeahanzi` (pinned commit in the script).
