// The server's limit per batch request.
const MAX_BATCH = 1000;
export function createClient({ baseUrl, mode }) {
    const base = `${baseUrl.replace(/\/+$/, '')}/v1/${mode}`;
    async function request(url, init) {
        const res = await fetch(url, init);
        if (!res.ok)
            throw new Error(`zh-dictionary: ${url}: HTTP ${res.status}`);
        return res.json();
    }
    function get(fn, q) {
        return request(q === undefined ? `${base}/${fn}` : `${base}/${fn}?q=${encodeURIComponent(q)}`);
    }
    async function batch(fn, items) {
        const chunks = [];
        for (let i = 0; i < items.length; i += MAX_BATCH)
            chunks.push(items.slice(i, i + MAX_BATCH));
        const results = await Promise.all(chunks.map((q) => request(`${base}/${fn}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q }),
        })));
        return results.flat();
    }
    return {
        lookup: (word) => get('lookup', word),
        lookupAll: (word) => get('lookupAll', word),
        has: (word) => get('has', word),
        describe: (word) => get('describe', word),
        character: (char) => get('character', char),
        attribution: async () => (await get('attribution')).attribution,
        batch,
    };
}
