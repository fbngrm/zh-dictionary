#!/usr/bin/env node
// Collects simplified Chinese place names from Wikidata (CC0) as candidates
// for generate-dictionary.py: every country and territory with an ISO 3166
// code, their capitals, cities with 1M+ people, Chinese province- and
// prefecture-level divisions, Taiwan's divisions, Hong Kong and Macau.
//
// Usage: node scripts/fetch-places.mjs > scripts/candidates/places.json
const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'zh-dictionary-build (https://github.com/fbngrm/zh-dictionary)';

// zh-cn label, else zh-hans.
const LABEL = `
  OPTIONAL { ?item rdfs:label ?cn FILTER(LANG(?cn) = "zh-cn") }
  OPTIONAL { ?item rdfs:label ?hans FILTER(LANG(?hans) = "zh-hans") }
  BIND(COALESCE(?cn, ?hans) AS ?label)
  FILTER(BOUND(?label))
  FILTER NOT EXISTS { ?item wdt:P576 [] }`;

const QUERIES = {
  countries: `SELECT DISTINCT ?label WHERE { ?item wdt:P297 [] . ${LABEL} }`,
  capitals: `SELECT DISTINCT ?label WHERE { ?country wdt:P297 [] ; wdt:P36 ?item . ${LABEL} }`,
  cities: `SELECT DISTINCT ?label WHERE {
    VALUES ?cls { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 wd:Q174844 }
    ?item wdt:P31 ?cls ; wdt:P1082 ?population .
    FILTER(?population >= 1000000)
    ${LABEL} }`,
  // Province level (province, autonomous region, municipality, SAR),
  // prefecture level (prefecture-level city, prefecture, autonomous
  // prefecture, league), Taiwan (special municipality, provincial city, county).
  divisions: `SELECT DISTINCT ?label WHERE {
    VALUES ?cls { wd:Q1615742 wd:Q57362 wd:Q1208802 wd:Q779415
                  wd:Q748149 wd:Q1045608 wd:Q788104 wd:Q288653
                  wd:Q2225003 wd:Q83020 wd:Q706447 }
    ?item wdt:P31 ?cls .
    ${LABEL} }`,
};

const names = new Set();
for (const [name, query] of Object.entries(QUERIES)) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const labels = (await res.json()).results.bindings.map((b) => b.label.value);
  let added = 0;
  for (const label of labels) {
    // Han characters only (drops Latin, digits and bracketed qualifiers).
    if (!/^[\p{Script=Han}·]+$/u.test(label)) continue;
    for (const form of name === 'divisions' ? shortForms(label) : [label]) {
      if (!names.has(form)) added++;
      names.add(form);
    }
  }
  console.error(`${name}: ${labels.length} labels, ${added} new names`);
}

console.log(JSON.stringify([...names].sort(), null, 2));

// Divisions are mostly called without their suffix: 广东省 → 广东,
// 苏州市 → 苏州, 广西壮族自治区 → 广西. Autonomous prefectures and leagues
// keep their full name. The full form is kept too.
function shortForms(label) {
  const short = label
    .replace(/(壮族|回族|维吾尔)?自治区$/, '')
    .replace(/特别行政区$/, '')
    .replace(/(省|市|县|地区)$/, '');
  return short.length >= 2 && short !== label ? [short, label] : [label];
}
