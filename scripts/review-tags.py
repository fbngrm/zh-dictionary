#!/usr/bin/env python3
"""
Second opinion on the "vulgar", "slang" and "internet" tags in
data/zh/dictionary.json: a separate, deterministic DeepSeek pass re-decides
each tagged entry's tags from its translation, using the same strict
definitions as generate-dictionary.py, and removes tags that don't hold.
"place" tags are left alone. Tags are only ever removed, never added.

Usage:
  DEEPSEEK_API_KEY=<key> python3 scripts/review-tags.py
"""
import os
import sys
import json
import time
import random
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

PATH = Path(__file__).parent / '../data/zh/dictionary.json'
API_KEY = os.environ.get('DEEPSEEK_API_KEY')
MODEL = os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat')
BASE_URL = os.environ.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
WORKERS = int(os.environ.get('WORKERS', '6'))
REVIEWED = ('vulgar', 'slang', 'internet')

DEFINITIONS = """Tag definitions (strict):
  "vulgar": profanity, obscenity, or a strongly offensive insult or slur. Mild words like 笨蛋 (fool) and neutral words about the body or illness are not vulgar.
  "slang": informal, colloquial usage that is not standard vocabulary. Ordinary everyday words (聊聊, 熬夜, 大姐) are not slang.
  "internet": a meme, abbreviation or buzzword that comes from or mainly lives online. Standard words about technology, the economy or society (流量 as traffic, 共享经济) are not internet.
  Judge the meaning in the given translation, not other meanings of the word."""


def ask(prompt, count, retries=5):
    payload = json.dumps({
        'model': MODEL,
        'messages': [
            {'role': 'system', 'content': 'You are a careful Mandarin Chinese lexicographer who outputs strictly valid JSON.'},
            {'role': 'user', 'content': prompt},
        ],
        'response_format': {'type': 'json_object'},
        'temperature': 0,
    }).encode('utf-8')
    headers = {'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'}
    for attempt in range(retries):
        try:
            req = urllib.request.Request(f'{BASE_URL}/chat/completions', data=payload, headers=headers, method='POST')
            with urllib.request.urlopen(req, timeout=180) as resp:
                results = json.loads(json.loads(resp.read())['choices'][0]['message']['content'])['results']
            if len(results) != count:
                raise ValueError(f'expected {count} results, got {len(results)}')
            return results
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError) as e:
            if attempt == retries - 1:
                raise RuntimeError(str(e))
            time.sleep(3 * (attempt + 1) + random.random())


def review(items):
    """items: [(word, entry)] → [reviewed tags] (subset of each entry's current tags)."""
    listing = '\n'.join(
        f'{i + 1}. {w} — "{e["translation"]}" ({e.get("part_of_speech", "")}) — current tags: {", ".join(t for t in e["tags"] if t in REVIEWED)}'
        for i, (w, e) in enumerate(items))
    prompt = f"""Review the tags of these Mandarin Chinese dictionary entries.
{listing}

{DEFINITIONS}

For each entry, return which of its current tags are correct for the meaning in its translation (possibly none).
Return JSON with one result per entry, in the same order:
{{"results": [{{"word": "...", "tags": ["..."]}}, ...]}}"""
    results = ask(prompt, len(items))
    return [[t for t in r.get('tags') or [] if t in e['tags'] and t in REVIEWED] for (_, e), r in zip(items, results)]


def main():
    if not API_KEY:
        sys.exit('Error: DEEPSEEK_API_KEY must be set.')
    data = json.loads(PATH.read_text(encoding='utf-8'))
    items = [(w, e) for w, v in data.items() for e in (v if isinstance(v, list) else [v])
             if any(t in REVIEWED for t in e.get('tags', ()))]
    batches = [items[i:i + 25] for i in range(0, len(items), 25)]
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        reviewed = [tags for batch in pool.map(review, batches) for tags in batch]

    removed = {t: 0 for t in REVIEWED}
    for (w, e), kept in zip(items, reviewed):
        for t in e['tags']:
            if t in REVIEWED and t not in kept:
                removed[t] += 1
        tags = [t for t in e['tags'] if t not in REVIEWED or t in kept]
        if tags:
            e['tags'] = tags
        else:
            del e['tags']

    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(f'Reviewed {len(items)} entries; tags removed: {removed}')


if __name__ == '__main__':
    main()
