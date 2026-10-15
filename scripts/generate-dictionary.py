#!/usr/bin/env python3
"""
Fills gaps in data/zh/dictionary.json using DeepSeek — the canonical tap-to-
translate word dictionary shared across apps (originally split between
tingting's data/storyDictionary.json and zh-patterns' story_dictionary.json,
merged here as the single source of truth).

This script is app-agnostic: it doesn't know about HSK lists, story fields,
or sentence tiles. Each consuming app decides what "candidate" words it
needs covered and what "known" words to exclude (e.g. words it already has
its own definitions for), and hands those over as plain JSON arrays.

Usage:
  DEEPSEEK_API_KEY=<key> python3 scripts/generate-dictionary.py --candidates words.json
  DEEPSEEK_API_KEY=<key> python3 scripts/generate-dictionary.py --candidates words.json --known known.json
  DEEPSEEK_API_KEY=<key> python3 scripts/generate-dictionary.py --candidates words.json --limit 50
  DEEPSEEK_API_KEY=<key> python3 scripts/generate-dictionary.py --candidates words.json --force
  DEEPSEEK_API_KEY=<key> python3 scripts/generate-dictionary.py --candidates places.json \\
    --tag place --context "place names" --max-len 13 --add-senses

  --candidates <path>  JSON array of words/phrases that should be covered, or
                        an object mapping each word to possible tags
                        ({"躺平": ["slang", "internet"]}).
  --known <path>       Optional JSON array of words to exclude from the gap
                        (e.g. an app's own vocabulary list that already has
                        definitions elsewhere).
  --max-len <n>        Max token length in hanzi to generate (default 4) —
                        longer tokens are usually word-segmentation
                        artifacts, not real dictionary words. Written to
                        dictionary.skipped.json instead, for manual review.
  --tag <tag>          Possible tag for every candidate (repeatable): one of
                        vulgar, slang, internet, place. DeepSeek keeps a
                        possible tag only where it applies; it is stored in
                        the entry's "tags".
  --context <text>     What the candidates are (e.g. "internet slang"), so
                        they are defined in that sense.
  --add-senses         For candidates already in the dictionary that have
                        possible tags: tag the existing entries with that
                        meaning, and add a new tagged entry when the meaning
                        is missing (e.g. 汉堡 has "hamburger" but not the
                        city Hamburg).

Output: data/zh/dictionary.json — { "word": {"pinyin", "translation",
"part_of_speech"[, "tags"]}, ... }. Resumable: skips words already present
unless --force.
"""
import os
import sys
import json
import time
import random
import argparse
import urllib.request
import urllib.error
from pathlib import Path
from threading import Lock
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / '../data/zh'
OUT_PATH = DATA_DIR / 'dictionary.json'
SKIPPED_PATH = DATA_DIR / 'dictionary.skipped.json'

API_KEY = os.environ.get('DEEPSEEK_API_KEY')
MODEL = os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat')
BASE_URL = os.environ.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
WORKERS = int(os.environ.get('WORKERS', '6'))
BATCH_SIZE = int(os.environ.get('BATCH_SIZE', '20'))
TAGS = ('vulgar', 'slang', 'internet', 'place')

if not API_KEY:
    print('Error: DEEPSEEK_API_KEY must be set.', file=sys.stderr)
    sys.exit(1)

CHAT_URL = f'{BASE_URL}/chat/completions'

parser = argparse.ArgumentParser()
parser.add_argument('--candidates', required=True, help='JSON array of candidate words, or object word → possible tags')
parser.add_argument('--known', help='JSON array of words to exclude from the gap')
parser.add_argument('--max-len', type=int, default=4, help='Max hanzi length to generate (default 4)')
parser.add_argument('--limit', type=int, default=None)
parser.add_argument('--force', action='store_true')
parser.add_argument('--tag', action='append', default=[], choices=TAGS, help='Possible tag for every candidate')
parser.add_argument('--context', help='What the candidates are, added to the prompt')
parser.add_argument('--add-senses', action='store_true', help='Tag or add the tagged meaning of existing words')
args = parser.parse_args()

MAX_TOKEN_LEN = args.max_len

# word → possible tags, filled in main().
HINTS = {}

SYSTEM_PROMPT = "You are a Mandarin Chinese dictionary assistant that outputs strictly valid JSON."

ENTRY_RULES_TEMPLATE = """- "pinyin": pinyin romanization with tone marks (not tone numbers), no spaces within the word (e.g. "kǒuzhào" not "kǒu zhào"), first letter lowercase.
- "translation": a short, natural English translation/definition (a few words, not a full sentence).
- "part_of_speech": one of "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "particle", "number", "measure word", "interjection", "proper noun" — pick the single best fit for how the word is most commonly used.
- "tags": the possible tags listed with the word that really apply to this meaning, else []. {TAG_DEFINITIONS}"""

TAG_DEFINITIONS = """Tag definitions (strict):
  "vulgar": profanity, obscenity, or a strongly offensive insult or slur. Mild words like 笨蛋 (fool) and neutral words about the body or illness are not vulgar.
  "slang": informal, colloquial usage that is not standard vocabulary. Ordinary everyday words (聊聊, 熬夜, 大姐) are not slang.
  "internet": a meme, abbreviation or buzzword that comes from or mainly lives online. Standard words about technology, the economy or society (流量 as traffic, 共享经济) are not internet.
  "place": a place name.
  Tag the meaning in this entry's translation, not other meanings of the word."""

ENTRY_RULES = ENTRY_RULES_TEMPLATE.replace('{TAG_DEFINITIONS}', TAG_DEFINITIONS)


def context_line():
    return f'\nContext: these words are {args.context}. Define each in that sense.\n' if args.context else ''


def listed(i, w):
    hints = HINTS.get(w)
    return f'{i+1}. {w}' + (f' (possible tags: {", ".join(hints)})' if hints else '')


def build_prompt(words):
    word_list = '\n'.join(listed(i, w) for i, w in enumerate(words))
    return f"""Provide dictionary entries for these {len(words)} Mandarin Chinese words/phrases:
{word_list}
{context_line()}
Produce exactly this JSON structure, one entry per word, IN THE SAME ORDER:
{{
  "entries": [
    {{"word": "...", "pinyin": "...", "translation": "...", "part_of_speech": "...", "tags": []}},
    ...
  ]
}}

Rules:
- "word": echo the input word exactly as given.
{ENTRY_RULES}
Return ONLY the JSON object, no markdown fences, no commentary."""


def build_senses_prompt(words, existing):
    lines = []
    for i, w in enumerate(words):
        entries = '; '.join(f'[{k}] {e["translation"]} ({e.get("part_of_speech", "")})'
                            for k, e in enumerate(as_list(existing[w])))
        lines.append(f'{listed(i, w)} — existing entries: {entries}')
    word_list = '\n'.join(lines)
    return f"""These {len(words)} Mandarin Chinese words are already in the dictionary. Each comes with possible tags and its existing entries:
{word_list}
{context_line()}
For each word:
- "tagged": numbers of the existing entries whose translation itself is a meaning that matches one of the possible tags (the entry that is the place name, or that gives the slang/vulgar/internet meaning). An entry with the ordinary standard meaning is not tagged. [] if none.
- "tags": which of the possible tags apply to the tagged entries.
- "new_entry": if the word is commonly used with a meaning that matches a possible tag (by the definitions below) and no existing entry gives that meaning, that meaning as {{"pinyin": "...", "translation": "...", "part_of_speech": "...", "tags": []}}; otherwise null.

Rules for new entries:
{ENTRY_RULES}

Produce exactly this JSON structure, IN THE SAME ORDER:
{{"words": [{{"word": "...", "tagged": [], "tags": [], "new_entry": null}}, ...]}}
Return ONLY the JSON object, no markdown fences, no commentary."""


def as_list(value):
    return value if isinstance(value, list) else [value]


def allowed_tags(word, tags):
    return sorted(set(t for t in tags if t in HINTS.get(word, ()))) if isinstance(tags, list) else []


def parse_entry(word, e):
    for field in ('pinyin', 'translation', 'part_of_speech'):
        if not isinstance(e, dict) or not isinstance(e.get(field), str) or not e[field].strip():
            raise ValueError(f'entry for "{word}" missing field "{field}"')
    entry = {
        'pinyin': e['pinyin'].strip(),
        'translation': e['translation'].strip(),
        'part_of_speech': e['part_of_speech'].strip(),
    }
    tags = allowed_tags(word, e.get('tags'))
    if tags:
        entry['tags'] = tags
    return entry


def ask(prompt, parse, retries=5):
    """Sends prompt to DeepSeek and returns parse(reply JSON). Retries on HTTP
    errors and on replies that parse rejects with ValueError."""
    payload = {
        'model': MODEL,
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': prompt},
        ],
        'response_format': {'type': 'json_object'},
        'temperature': 0.3,
    }
    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json',
    }
    for attempt in range(retries):
        try:
            req = urllib.request.Request(CHAT_URL, data=data, headers=headers, method='POST')
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = json.loads(resp.read())
            return parse(json.loads(body['choices'][0]['message']['content']))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='replace')
            if attempt < retries - 1:
                wait = 15 if e.code == 429 else 3 * (attempt + 1)
                time.sleep(wait)
            else:
                raise RuntimeError(f'HTTP {e.code}: {err_body}')
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError) as e:
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1) + random.random())
            else:
                raise RuntimeError(str(e))


def call_deepseek(words):
    def parse(reply):
        entries = reply.get('entries')
        if not isinstance(entries, list) or len(entries) != len(words):
            raise ValueError(f'expected {len(words)} entries, got {len(entries) if isinstance(entries, list) else type(entries)}')
        return {w: parse_entry(w, e) for w, e in zip(words, entries)}
    return ask(build_prompt(words), parse)


def call_senses(words, existing):
    """→ {word: (indices of existing entries to tag, tags, new entry or None)}"""
    def parse(reply):
        results = reply.get('words')
        if not isinstance(results, list) or len(results) != len(words):
            raise ValueError(f'expected {len(words)} words, got {len(results) if isinstance(results, list) else type(results)}')
        out = {}
        for w, r in zip(words, results):
            count = len(as_list(existing[w]))
            tagged = r.get('tagged') or []
            if not isinstance(tagged, list) or any(not isinstance(k, int) or not 0 <= k < count for k in tagged):
                raise ValueError(f'bad "tagged" for "{w}": {tagged}')
            new = r.get('new_entry')
            out[w] = (tagged, allowed_tags(w, r.get('tags')), parse_entry(w, new) if new else None)
        return out
    return ask(build_senses_prompt(words, existing), parse)


def chunk(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def main():
    print(f'DeepSeek URL : {CHAT_URL}')
    print(f'Model        : {MODEL}')
    print(f'Workers      : {WORKERS}  Batch size: {BATCH_SIZE}')

    raw = json.loads(Path(args.candidates).read_text(encoding='utf-8'))
    candidates = set(raw)
    for w in candidates:
        hints = set(raw[w] if isinstance(raw, dict) else ()) | set(args.tag)
        if hints - set(TAGS):
            sys.exit(f'Error: unknown tags for "{w}": {sorted(hints - set(TAGS))}')
        if hints:
            HINTS[w] = sorted(hints)
    known = set(json.loads(Path(args.known).read_text(encoding='utf-8'))) if args.known else set()

    existing = {}
    if OUT_PATH.exists() and not args.force:
        existing = json.loads(OUT_PATH.read_text(encoding='utf-8'))

    gap = sorted(candidates - known)
    in_scope = [w for w in gap if len(w) <= MAX_TOKEN_LEN]
    out_of_scope = [w for w in gap if len(w) > MAX_TOKEN_LEN]

    pending = [w for w in in_scope if args.force or w not in existing]
    if args.limit is not None:
        pending = pending[:args.limit]
    # Existing words with possible tags, unless already tagged with one
    # (keeps re-runs from adding the same meaning twice).
    senses = [w for w in in_scope if args.add_senses and w in existing and w in HINTS
              and not any(set(e.get('tags', ())) & set(HINTS[w]) for e in as_list(existing[w]))]

    print(f'Candidate gap: {len(gap)} words not in --known')
    print(f'  in scope (<= {MAX_TOKEN_LEN} chars): {len(in_scope)}, {len(pending)} pending')
    print(f'  out of scope (likely segmentation artifacts, written to {SKIPPED_PATH.name}): {len(out_of_scope)}')
    if args.add_senses:
        print(f'  existing words to check for tagged meanings: {len(senses)}')

    if out_of_scope:
        existing_skipped = set(json.loads(SKIPPED_PATH.read_text(encoding='utf-8'))) if SKIPPED_PATH.exists() else set()
        SKIPPED_PATH.write_text(json.dumps(sorted(existing_skipped | set(out_of_scope)), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    if not pending and not senses:
        print('Nothing to generate.')
        return

    jobs = [('new', b) for b in chunk(pending, BATCH_SIZE)] + [('senses', b) for b in chunk(senses, BATCH_SIZE // 2 or 1)]
    total = len(pending) + len(senses)
    save_lock = Lock()
    done, failed = 0, 0
    failures = []
    tagged_count, added_count = 0, 0

    def worker(kind, batch):
        return call_deepseek(batch) if kind == 'new' else call_senses(batch, existing)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(worker, kind, b): b for kind, b in jobs}
        for future in as_completed(futures):
            batch = futures[future]
            try:
                result = future.result()
                with save_lock:
                    for w, value in result.items():
                        if isinstance(value, dict):
                            existing[w] = value
                            continue
                        indices, tags, new = value
                        entries = as_list(existing[w])
                        for k in indices:
                            if tags:
                                entries[k]['tags'] = sorted(set(entries[k].get('tags', [])) | set(tags))
                                tagged_count += 1
                        if new:
                            entries.append(new)
                            added_count += 1
                        existing[w] = entries if len(entries) > 1 else entries[0]
                    OUT_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
                done += len(result)
            except Exception as e:
                failed += len(batch)
                failures.append((batch, str(e)))
                print(f'\n  FAILED batch {batch[:3]}...: {e}', flush=True)
            print(f'\r  {done + failed}/{total}  done={done}  failed={failed}', end='', flush=True)

    print()
    for batch, err in failures:
        print(f'  FAILED {batch}: {err}')

    print(f'\nAll done. Generated: {done}  Failed: {failed}')
    if args.add_senses:
        print(f'Existing entries tagged: {tagged_count}  New meanings added: {added_count}')
    print(f'Dictionary now has {len(existing)} entries -> {OUT_PATH}')
    if out_of_scope:
        print(f'\nREMINDER: {len(out_of_scope)} candidate tokens were skipped (>{MAX_TOKEN_LEN} chars, likely segmentation artifacts) -> {SKIPPED_PATH}')
        print('Review these — they may need re-segmentation at the source rather than dictionary entries.')
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
