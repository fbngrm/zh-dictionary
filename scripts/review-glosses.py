#!/usr/bin/env python3
"""
Second opinion on the English glosses of the HSK 3.0 (2025) words in
data/zh/dictionary.json. Report only, the dictionary isn't changed.

1. CEDICT check: an entry is flagged when its translation shares no content
   word with any CEDICT translation of the same word (a "variant of X" CEDICT
   entry also counts with X's translations).
2. DeepSeek check: each flagged entry is judged against its pinyin and the
   CEDICT glosses; a wrong one gets a corrected gloss.

Usage:
  DEEPSEEK_API_KEY=<key> python3 scripts/review-glosses.py review-glosses.json
"""
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from importlib.util import module_from_spec, spec_from_file_location

DATA = Path(__file__).parent / '../data'
_spec = spec_from_file_location('review_tags', Path(__file__).with_name('review-tags.py'))
review_tags = module_from_spec(_spec)
_spec.loader.exec_module(review_tags)

# CEDICT markup and articles; meaning words like "it" or "or" stay.
STOP = {'the', 'a', 'an', 'of', 'to', 'sth', 'sb', 'etc', 'used', 'also', 'form', 'variant', 'erhua',
        'bound', 'coll', 'lit', 'fig', 'cl'}
VARIANT_OF = re.compile(r'(?:variant|form) of (?:[^|\[\s]+\|)?([^\[\s]+)\[')


def stem(w):
    if len(w) > 3 and w.endswith('s') and not w.endswith('ss'):
        w = w[:-1]
    for suffix in ('ing', 'ed', 'ly'):
        if len(w) > len(suffix) + 2 and w.endswith(suffix):
            return w[:-len(suffix)]
    return w


def overlaps(gloss, others):
    mine, theirs = content_words(gloss), content_words(others)
    # "coat" counts for "overcoat"
    return bool(mine & theirs) or any(len(m) > 3 and m in t for m in mine for t in theirs)


def content_words(text):
    return {stem(w) for w in re.findall(r'[a-z]+', text.lower())} - STOP


def entries(table, word):
    v = table.get(word)
    return v if isinstance(v, list) else ([v] if v else [])


def cedict_glosses(cedict, word):
    glosses = []
    for e in entries(cedict, word):
        glosses.append(e['translation'])
        for base in VARIANT_OF.findall(e['translation']):
            glosses += [b['translation'] for b in entries(cedict, base)]
    return glosses


def judge(items):
    """items: [(word, entry, cedict glosses)] → [{"ok": bool, "gloss": str}]"""
    listing = '\n'.join(
        f'{i + 1}. {w} ({e["pinyin"]}) — dictionary: "{e["translation"]}" — CEDICT: "{" / ".join(c)[:300]}"'
        for i, (w, e, c) in enumerate(items))
    prompt = f"""Check the English glosses of these Mandarin Chinese dictionary entries.
{listing}

For each entry decide whether the dictionary gloss is a correct English meaning of the word as read with that
pinyin, in standard modern usage. It does not have to list every sense, and different wording from CEDICT is
fine. If it is wrong (a different word, a wrong sense, a proper noun instead of the common word), give a correct
short gloss in the dictionary's style; otherwise repeat the dictionary gloss.
Return JSON with one result per entry, in the same order:
{{"results": [{{"word": "...", "ok": true, "gloss": "..."}}, ...]}}"""
    return review_tags.ask(prompt, len(items))


def main():
    if not review_tags.API_KEY:
        sys.exit('Error: DEEPSEEK_API_KEY must be set.')
    out = Path(sys.argv[1])
    dictionary = json.loads((DATA / 'zh/dictionary.json').read_text(encoding='utf-8'))
    cedict = json.loads((DATA / 'cedict/cedict.json').read_text(encoding='utf-8'))
    hsk = dict.fromkeys(r['hanzi'] for r in json.loads((DATA / 'hsk/2025.json').read_text(encoding='utf-8')))

    checked, flagged = 0, []
    for word in hsk:
        for e in entries(dictionary, word):
            glosses = cedict_glosses(cedict, word)
            if not e.get('translation') or not glosses:
                continue
            checked += 1
            if not overlaps(e['translation'], ' '.join(glosses)):
                flagged.append((word, e, glosses))

    batches = [flagged[i:i + 25] for i in range(0, len(flagged), 25)]
    with ThreadPoolExecutor(max_workers=review_tags.WORKERS) as pool:
        verdicts = [v for batch in pool.map(judge, batches) for v in batch]

    report = [{'word': w, 'pinyin': e['pinyin'], 'dictionary': e['translation'], 'cedict': c,
               'ok': bool(v.get('ok')), 'suggested': v.get('gloss', '')}
              for (w, e, c), v in zip(flagged, verdicts)]
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    wrong = [r for r in report if not r['ok']]
    print(f'{checked} HSK glosses checked; {len(flagged)} disagree with CEDICT; DeepSeek: {len(wrong)} wrong')
    for r in wrong:
        print(f"  {r['word']} ({r['pinyin']}): \"{r['dictionary']}\" → \"{r['suggested']}\"")


if __name__ == '__main__':
    main()
