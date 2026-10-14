// cedict mode: CC-CEDICT word data only (data/cedict, CC BY-SA 4.0) plus
// character data (data/hanzi, Unicode License v3). Apps using it must show
// `attribution` to their users.
import { createDictionary } from '../dist/index.js';
import data from '../data/cedict/cedict.json' with { type: 'json' };
import meta from '../data/cedict/meta.json' with { type: 'json' };
import hanzi from '../data/hanzi/hanzi.json' with { type: 'json' };
import hanziMeta from '../data/hanzi/meta.json' with { type: 'json' };

export const { lookup, lookupAll, has, describe, character } = createDictionary(data, { hanzi });
export const attribution = `${meta.attribution} ${hanziMeta.attribution}`;
