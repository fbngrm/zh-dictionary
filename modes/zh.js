// zh mode: our own word data (data/zh, CC0) plus character data
// (data/hanzi, Unicode License v3). Importing this module never pulls in the
// CC-CEDICT data. Apps must show `attribution` (the Unicode notice).
import { createDictionary } from '../dist/index.js';
import data from '../data/zh/dictionary.json' with { type: 'json' };
import hanzi from '../data/hanzi/hanzi.json' with { type: 'json' };
import hanziMeta from '../data/hanzi/meta.json' with { type: 'json' };

export const { lookup, lookupAll, has, describe, character } = createDictionary(data, { hanzi });
export const attribution = hanziMeta.attribution;
