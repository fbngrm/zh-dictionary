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

  --candidates <path>  JSON array of words/phrases that should be covered.
  --known <path>       Optional JSON array of words to exclude from the gap
                        (e.g. an app's own vocabulary list that already has
                        definitions elsewhere).
  --max-len <n>        Max token length in hanzi to generate (default 4) —
                        longer tokens are usually word-segmentation
                        artifacts, not real dictionary words. Written to
                        dictionary.skipped.json instead, for manual review.

Output: data/zh/dictionary.json — { "word": {"pinyin", "translation",
"part_of_speech"}, ... }. Resumable: skips words already present unless
--force.
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

if not API_KEY:
    print('Error: DEEPSEEK_API_KEY must be set.', file=sys.stderr)
    sys.exit(1)

CHAT_URL = f'{BASE_URL}/chat/completions'

parser = argparse.ArgumentParser()
parser.add_argument('--candidates', required=True, help='JSON array of candidate words')
parser.add_argument('--known', help='JSON array of words to exclude from the gap')
parser.add_argument('--max-len', type=int, default=4, help='Max hanzi length to generate (default 4)')
parser.add_argument('--limit', type=int, default=None)
parser.add_argument('--force', action='store_true')
args = parser.parse_args()

MAX_TOKEN_LEN = args.max_len

SYSTEM_PROMPT = "You are a Mandarin Chinese dictionary assistant that outputs strictly valid JSON."


def build_prompt(words):
    word_list = '\n'.join(f'{i+1}. {w}' for i, w in enumerate(words))
    return f"""Provide dictionary entries for these {len(words)} Mandarin Chinese words/phrases:
{word_list}

Produce exactly this JSON structure, one entry per word, IN THE SAME ORDER:
{{
  "entries": [
    {{"word": "...", "pinyin": "...", "translation": "...", "part_of_speech": "..."}},
    ...
  ]
}}

Rules:
- "word": echo the input word exactly as given.
- "pinyin": pinyin romanization with tone marks (not tone numbers), no spaces within the word (e.g. "kǒuzhào" not "kǒu zhào"), first letter lowercase.
- "translation": a short, natural English translation/definition (a few words, not a full sentence).
- "part_of_speech": one of "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "particle", "number", "measure word", "interjection", "proper noun" — pick the single best fit for how the word is most commonly used.
Return ONLY the JSON object, no markdown fences, no commentary."""


def call_deepseek(words, retries=5):
    payload = {
        'model': MODEL,
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': build_prompt(words)},
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
            content = body['choices'][0]['message']['content']
            parsed = json.loads(content)
            entries = parsed.get('entries')
            if not isinstance(entries, list) or len(entries) != len(words):
                raise ValueError(f'expected {len(words)} entries, got {len(entries) if isinstance(entries, list) else type(entries)}')
            result = {}
            for w, e in zip(words, entries):
                for field in ('pinyin', 'translation', 'part_of_speech'):
                    if not isinstance(e.get(field), str) or not e[field].strip():
                        raise ValueError(f'entry for "{w}" missing field "{field}"')
                result[w] = {
                    'pinyin': e['pinyin'].strip(),
                    'translation': e['translation'].strip(),
                    'part_of_speech': e['part_of_speech'].strip(),
                }
            return result
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


def chunk(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def main():
    print(f'DeepSeek URL : {CHAT_URL}')
    print(f'Model        : {MODEL}')
    print(f'Workers      : {WORKERS}  Batch size: {BATCH_SIZE}')

    candidates = set(json.loads(Path(args.candidates).read_text(encoding='utf-8')))
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

    print(f'Candidate gap: {len(gap)} words not in --known')
    print(f'  in scope (<= {MAX_TOKEN_LEN} chars): {len(in_scope)}, {len(pending)} pending')
    print(f'  out of scope (likely segmentation artifacts, written to {SKIPPED_PATH.name}): {len(out_of_scope)}')

    if out_of_scope:
        existing_skipped = set(json.loads(SKIPPED_PATH.read_text(encoding='utf-8'))) if SKIPPED_PATH.exists() else set()
        SKIPPED_PATH.write_text(json.dumps(sorted(existing_skipped | set(out_of_scope)), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    if not pending:
        print('Nothing to generate.')
        return

    batches = list(chunk(pending, BATCH_SIZE))
    save_lock = Lock()
    done, failed = 0, 0
    failures = []

    def worker(batch):
        return call_deepseek(batch)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(worker, b): b for b in batches}
        for future in as_completed(futures):
            batch = futures[future]
            try:
                result = future.result()
                with save_lock:
                    existing.update(result)
                    OUT_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
                done += len(result)
            except Exception as e:
                failed += len(batch)
                failures.append((batch, str(e)))
                print(f'\n  FAILED batch {batch[:3]}...: {e}', flush=True)
            print(f'\r  {done + failed}/{len(pending)}  done={done}  failed={failed}', end='', flush=True)

    print()
    for batch, err in failures:
        print(f'  FAILED {batch}: {err}')

    print(f'\nAll done. Generated: {done}  Failed: {failed}')
    print(f'Dictionary now has {len(existing)} entries -> {OUT_PATH}')
    if out_of_scope:
        print(f'\nREMINDER: {len(out_of_scope)} candidate tokens were skipped (>{MAX_TOKEN_LEN} chars, likely segmentation artifacts) -> {SKIPPED_PATH}')
        print('Review these — they may need re-segmentation at the source rather than dictionary entries.')
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
