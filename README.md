# zh-dictionary

Chinese–English dictionary for JavaScript apps. Look up a word and get its
pinyin, traditional form and translation, plus a breakdown of each
character: its reading in that word, meaning, radical, stroke count and
decomposition into components.

- Zero dependencies, plain ES module, TypeScript types included
- Works in browsers, Node, React Native / Expo, Deno, Bun and any bundler
- Code and data are separate: the code is MIT, and each dataset is a plain
  JSON file under [`data/`](data) with its own license
- Bundle the data into your app, or run the [API server](#api-server-docker)
  in a container and use the [API client](#api-client), so the data comes
  over the network instead

## Modes

| Mode | Import | Words | License |
| --- | --- | --- | --- |
| `zh` | `@fbngrm/zh-dictionary/zh` | [our own data](data/zh): ~19k learner words with part of speech | CC0 1.0 |
| `cedict` | `@fbngrm/zh-dictionary/cedict` | [CC-CEDICT](data/cedict): ~121k words | CC BY-SA 4.0 |

Both modes share the [character data](data/hanzi) (~15k characters, from
Unicode Unihan and BabelStone IDS, Unicode License v3).

Each mode is its own entry point, so a bundle only contains the data of the
modes it imports. Importing `zh` never pulls in the 14 MB CC-CEDICT file.

## Install

The package installs straight from GitHub (it is not on the npm registry):

```bash
npm install --allow-git=root github:fbngrm/zh-dictionary#v0.5.0
# or
yarn add github:fbngrm/zh-dictionary#v0.5.0
pnpm add github:fbngrm/zh-dictionary#v0.5.0
```

which adds:

```json
"dependencies": {
  "@fbngrm/zh-dictionary": "github:fbngrm/zh-dictionary#v0.5.0"
}
```

npm 12 and later refuse git dependencies unless you opt in. Pass
`--allow-git=root` as above, or add `allow-git=root` to your project's
`.npmrc` so later `npm install` runs work too. The built code is committed,
so no install script needs to run. You can ignore npm's `install-scripts`
warning.

## Usage

### Look up a word

```ts
import { lookup, lookupAll, has } from '@fbngrm/zh-dictionary/zh';

lookup('头发');
// { pinyin: 'tóufa', translation: 'hair', part_of_speech: 'noun', traditional: '頭髮' }

lookup('頭髮');   // traditional input works too
lookupAll('行');  // all entries for the word (several readings in cedict mode)
has('不存在');     // false
```

### Word details with a character breakdown

```ts
import { describe } from '@fbngrm/zh-dictionary/zh';

describe('头发');
// {
//   word: '头发',
//   traditional: '頭髮',
//   pinyin: 'tóufa',
//   translation: 'hair',
//   part_of_speech: 'noun',
//   characters: [
//     { char: '头', traditional: '頭', pinyin: 'tóu', meaning: 'head; …',
//       radical: '大', strokes: 5, decomposition: '⿻⺀大', components: ['⺀', '大'] },
//     { char: '发', traditional: '髮', pinyin: 'fa', meaning: 'to send; to issue; to grow (hair)',
//       radical: '又', strokes: 5, decomposition: '⿺⿸⿻𠃋丿又丶', components: ['𠃋', '丿', '又', '丶'] },
//   ],
// }
```

Each character's `pinyin` is its reading **in that word** (行 is `háng` in
银行, `xíng` in 行人), and `meaning` is the dictionary entry for that
reading where there is one.

### Characters and decomposition

```ts
import { character } from '@fbngrm/zh-dictionary/zh';

character('好');
// { pinyin: ['hǎo', 'hào'], definition: 'good, excellent, fine; well', radical: '女',
//   strokes: 6, decomposition: '⿰女子', components: ['女', '子'] }

character('說');
// { …, decomposition: '⿰訁兌', components: ['訁', '兌'], simplified: ['说'] }
```

`decomposition` is an
[ideographic description sequence](https://en.wikipedia.org/wiki/Ideographic_Description_Characters)
(`⿰` = left/right, `⿱` = top/bottom, …). Call `character()` on a
component to decompose it further.

### CC-CEDICT mode

Same functions, larger vocabulary, no part of speech:

```ts
import { lookup, describe, attribution } from '@fbngrm/zh-dictionary/cedict';

lookup('口罩');   // { pinyin: 'kǒu zhào', translation: 'mask (surgical etc)' }
describe('银行'); // same shape as in zh mode
```

### Switching modes at runtime

Both modes export the same functions, so import them as namespaces:

```ts
import * as zh from '@fbngrm/zh-dictionary/zh';
import * as cedict from '@fbngrm/zh-dictionary/cedict';

const dict = settings.mode === 'zh' ? zh : cedict;
dict.describe('银行');
```

### React example

```tsx
import { describe } from '@fbngrm/zh-dictionary/zh';

function Word({ text }: { text: string }) {
  const word = describe(text);
  if (!word) return <span>{text}</span>;
  return (
    <div>
      <h2>{word.word} ({word.traditional})</h2>
      <p>{word.pinyin}: {word.translation}</p>
      <ul>
        {word.characters.map((c, i) => (
          <li key={i}>
            {c.char} {c.pinyin}: {c.meaning} [{c.decomposition}]
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Loading data at runtime (web)

To keep CC-CEDICT out of a web bundle, fetch the JSON and build the
dictionary with `createDictionary`. For production, host the files yourself
and serve them gzipped (cedict.json is 14 MB, about 4 MB gzipped). For a
quick start, GitHub serves them directly:

```ts
import { createDictionary } from '@fbngrm/zh-dictionary';

const base = 'https://raw.githubusercontent.com/fbngrm/zh-dictionary/v0.5.0/data';
const [words, hanzi] = await Promise.all([
  fetch(`${base}/cedict/cedict.json`).then((r) => r.json()),
  fetch(`${base}/hanzi/hanzi.json`).then((r) => r.json()),
]);
const dict = createDictionary(words, { hanzi });
```

`createDictionary(sources, { hanzi })` accepts one dataset or an array,
where earlier sources win. That way you can also layer your own words on
top of either dataset.

### Node

Node ≥ 22 runs it as is. CommonJS `require('@fbngrm/zh-dictionary/zh')`
works on Node ≥ 22.12. To import the raw JSON files yourself, use an import
attribute:

```js
import hanzi from '@fbngrm/zh-dictionary/data/hanzi.json' with { type: 'json' };
```

## API server (Docker)

[`server/`](server) is a small Go server (standard library only) that
answers the same functions over HTTP, using the data in the container. Build
and run it from the repo root:

```bash
docker build -t zh-dictionary .
docker run -p 8080:8080 zh-dictionary
```

Without Docker (Go ≥ 1.24):

```bash
cd server && DATA_DIR=../data go run .
```

Endpoints (all `GET`, JSON responses identical to the library's return
values, CORS enabled for any origin):

| Endpoint | Returns |
| --- | --- |
| `/v1/{mode}/lookup?q=头发` | entry or `null` |
| `/v1/{mode}/lookupAll?q=行` | array of entries |
| `/v1/{mode}/has?q=好` | `true` / `false` |
| `/v1/{mode}/describe?q=银行` | word details with character breakdown, or `null` |
| `/v1/{mode}/character?q=好` | character data or `null` |
| `/v1/{mode}/attribution` | `{ "attribution": "…" }` |
| `/healthz` | `{ "status": "ok" }` |

`{mode}` is `zh` or `cedict`. Settings: `ADDR` (default `:8080`) and
`DATA_DIR` (default `/data` in the image). The image is about 42 MB and the
server uses about 90 MB of memory with both modes loaded.

```bash
curl 'http://localhost:8080/v1/zh/describe?q=银行'
```

If you run a public server with the `cedict` mode, you are sharing CC-CEDICT
data, so show its attribution (`/v1/cedict/attribution`) in the apps that
use it.

## API client

`@fbngrm/zh-dictionary/client` has the same functions as the modes, but it
calls the API server, so your app bundles no dictionary data. Every
function returns a Promise:

```ts
import { createClient } from '@fbngrm/zh-dictionary/client';

const dict = createClient({ baseUrl: 'https://dict.example.com', mode: 'zh' });

await dict.lookup('头发');     // { pinyin: 'tóufa', translation: 'hair', … }
await dict.describe('银行');   // same WordDetails as describe() in the modes
await dict.character('好');    // { pinyin: ['hǎo', 'hào'], decomposition: '⿰女子', … }
await dict.has('不存在');       // false
await dict.attribution();      // credit line to show
```

Switching modes means creating a second client with `mode: 'cedict'`.
Failed requests (network errors, non-2xx responses) reject with an `Error`.
The client uses the global `fetch`, which browsers, React Native, Node ≥ 18,
Deno and Bun all provide.

## API

| Function | Returns |
| --- | --- |
| `lookup(word)` | `DictionaryEntry \| null`: the first entry |
| `lookupAll(word)` | `DictionaryEntry[]`: every reading |
| `has(word)` | `boolean` |
| `describe(word)` | `WordDetails \| null`: entry plus `characters` breakdown |
| `character(char)` | `CharacterData \| null` |
| `attribution` | `string`: credit line your app must show (see Licensing) |
| `createDictionary(sources, { hanzi })` | the functions above, for your own data |

Through the [API client](#api-client), the same functions return Promises
and `attribution` is the function `attribution()`.

Words can be given in simplified or traditional characters. All types
(`DictionaryEntry`, `WordDetails`, `WordCharacter`, `CharacterData`, …) are
exported from `@fbngrm/zh-dictionary`. The raw files are exported as
`/data/zh.json`, `/data/cedict.json`, `/data/hanzi.json` and their
`*.meta.json` files.

## Licensing

| Part | License | What you must do |
| --- | --- | --- |
| Code (`src/`, `dist/`, `modes/`, `server/`, `scripts/`, `test/`) | [MIT](LICENSE) | keep the license notice |
| [`data/zh`](data/zh) | [CC0 1.0](data/zh/LICENSE) | nothing |
| [`data/hanzi`](data/hanzi) | [Unicode License v3](data/hanzi/LICENSE) | include the Unicode notice |
| [`data/cedict`](data/cedict) | [CC BY-SA 4.0](data/cedict/LICENSE) | credit CC-CEDICT; modified or merged CEDICT data stays CC BY-SA |

Each mode exports `attribution`, the credit line for the data it ships.
Show it where users can see it, for example on an About or licenses screen.
Commercial use is allowed for all of it. CC BY-SA applies to the CEDICT data
only, not to your app's code. See [data/cedict/README.md](data/cedict/README.md).

Keep the datasets in separate files. Don't merge CC-CEDICT into `data/zh`,
or our data would have to become CC BY-SA too.

## Updating the data

```bash
npm run build:cedict        # latest CC-CEDICT from MDBG
npm run build:traditional   # traditional forms for data/zh (OpenCC)
npm run build:hanzi         # character data for every character in use
npm test                    # includes the server tests when Go is installed
```

`npm test` builds the Go server, runs it, and checks that the API client
returns exactly what the bundled library returns, for every 20th word.
`CONTRACT_STEP=1 npm test` checks every word, and `cd server && go test ./...`
runs the server's own tests.

## Migrating from 0.3

```diff
- import { lookupWord } from '@fbngrm/zh-dictionary/lookup';
- lookupWord('口罩');
+ import { lookup } from '@fbngrm/zh-dictionary/zh';
+ lookup('口罩');
```

`@fbngrm/zh-dictionary/dictionary.json` is now `@fbngrm/zh-dictionary/data/zh.json`.
`part_of_speech` is optional in the types, because CC-CEDICT has none.

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
npm run build:traditional && npm run build:hanzi
```

This updates `data/zh/dictionary.json` in place (resumable — already-covered
words are skipped unless `--force`). Commit, tag a new version, push tags,
then bump the `#vX.Y.Z` ref in each consuming app's `package.json`:

```bash
git add data/
git commit -m "Add words from <app> gap"
git tag vX.Y.Z
git push && git push --tags
```

Tokens longer than `--max-len` (default 4 hanzi) are treated as likely
word-segmentation artifacts and written to `data/zh/dictionary.skipped.json`
for manual review instead of being sent to DeepSeek.
