export function createClient({ baseUrl, mode }) {
    const base = `${baseUrl.replace(/\/+$/, '')}/v1/${mode}`;
    async function get(fn, q) {
        const url = q === undefined ? `${base}/${fn}` : `${base}/${fn}?q=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`zh-dictionary: ${url}: HTTP ${res.status}`);
        return res.json();
    }
    return {
        lookup: (word) => get('lookup', word),
        lookupAll: (word) => get('lookupAll', word),
        has: (word) => get('has', word),
        describe: (word) => get('describe', word),
        character: (char) => get('character', char),
        attribution: async () => (await get('attribution')).attribution,
    };
}
