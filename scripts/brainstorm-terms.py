#!/usr/bin/env python3
"""
Builds candidate lists of slang, internet slang, youth jargon and vulgar
words for generate-dictionary.py, using DeepSeek in two separate passes:

1. brainstorm: per category, several prompts on sub-themes each propose
   terms; the official yearly buzzword lists below are added as seeds.
2. verify: a separate, deterministic pass keeps only terms that are real
   and commonly used in that category.

All output is DeepSeek's (no third-party lists are copied), so the result
can go into data/zh under CC0.

Usage:
  DEEPSEEK_API_KEY=<key> python3 scripts/brainstorm-terms.py --out scripts/candidates/terms.json

Output: {"term": ["slang", "internet"], ...}: each verified term with the
tags of every category it was verified for.
"""
import os
import sys
import json
import time
import random
import argparse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

API_KEY = os.environ.get('DEEPSEEK_API_KEY')
MODEL = os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat')
BASE_URL = os.environ.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
WORKERS = int(os.environ.get('WORKERS', '6'))

# category → (tag, description used in prompts, sub-themes to brainstorm)
CATEGORIES = {
    'vulgar': ('vulgar', 'swear word, curse, insult or vulgar expression', [
        'swear words and curses',
        'insults for people',
        'vulgar exclamations of anger or surprise',
        'vulgar words about sex and the body',
        'disguised spellings of swear words used online (homophones, pinyin initials, letters)',
        'swear words from Taiwan, Hong Kong or dialects that are widely understood in Mandarin',
    ]),
    'slang': ('slang', 'colloquial slang word or expression', [
        'everyday spoken slang',
        'slang about money, jobs and business',
        'slang for types of people and personalities',
        'slang for feelings, moods and states of mind',
        'slang verbs and actions',
        'northern Chinese and Beijing slang that is widely understood',
        'slang about food, drinking and going out',
    ]),
    'internet': ('internet', 'internet slang, meme or online buzzword', [
        'internet memes and catchphrases from 2010 to 2025',
        'abbreviations made of pinyin initials or Latin letters',
        'number slang',
        'gaming and livestreaming slang',
        'social media slang from Weibo, Bilibili, Douyin and Xiaohongshu',
        'online shopping and e-commerce slang',
        'homophone puns used online',
        'buzzwords from the yearly lists of popular words',
    ]),
    'youth': ('slang', 'youth jargon used by Chinese teenagers and young adults', [
        'Gen Z slang',
        'campus and student slang about school and exams',
        'slang about dating and relationships',
        'slang about work culture among young people',
        'fan culture (饭圈) slang',
    ]),
}

# Seeds: 《咬文嚼字》 十大流行语 and 国家语言资源监测与研究中心 十大网络用语,
# 2023–2025, without template entries ("预制××") and titles.
SEEDS = [
    '韧性', '苏超', '赛博对账', '具身智能', '谷子', '活人感', '数字游民',
    '数智化', '智能向善', '未来产业', 'city不city', '硬控', '水灵灵地', '班味', '班味儿',
    '松弛感', '银发力量', '小孩哥', '小孩姐',
    '新质生产力', '双向奔赴', '村超', '特种兵式旅游', '显眼包', '搭子', '情绪价值',
    '敬自己一杯', '助我破鼎', '如何呢又能怎', '村咖', '来财', '浪浪山小妖怪',
    '含金量还在上升', '偏偏你最争气', '浓人', '淡人', '主理人',
]

SYSTEM_PROMPT = 'You are an expert on contemporary Mandarin Chinese usage who outputs strictly valid JSON.'


def call(prompt, temperature, retries=5):
    payload = json.dumps({
        'model': MODEL,
        'messages': [{'role': 'system', 'content': SYSTEM_PROMPT}, {'role': 'user', 'content': prompt}],
        'response_format': {'type': 'json_object'},
        'temperature': temperature,
    }).encode('utf-8')
    headers = {'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'}
    for attempt in range(retries):
        try:
            req = urllib.request.Request(f'{BASE_URL}/chat/completions', data=payload, headers=headers, method='POST')
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(json.loads(resp.read())['choices'][0]['message']['content'])
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError) as e:
            if attempt == retries - 1:
                raise RuntimeError(str(e))
            time.sleep(3 * (attempt + 1) + random.random())


def brainstorm(description, theme, n=60):
    prompt = f"""List {n} different Mandarin Chinese terms of this kind: {description}.
Focus: {theme}.
Only include terms that native speakers in mainland China commonly use or recognize today.
Write each term exactly as it is usually written (simplified characters; keep Latin letters
or digits if the term is written with them). One term per item, no explanations.
Return JSON: {{"terms": ["...", "..."]}}"""
    terms = call(prompt, temperature=0.8).get('terms', [])
    return [t.strip() for t in terms if isinstance(t, str) and t.strip()]


def verify(description, terms):
    listing = '\n'.join(f'{i + 1}. {t}' for i, t in enumerate(terms))
    prompt = f"""For each term below, decide whether it is a real {description} in Mandarin Chinese
that is commonly used or widely recognized by native speakers today. Answer false for made-up
terms, very obscure ones, ordinary standard words without that sense, and proper names.
{listing}
Return JSON with one result per term, in the same order:
{{"results": [{{"term": "...", "keep": true}}, ...]}}"""
    results = call(prompt, temperature=0).get('results', [])
    if len(results) != len(terms):
        raise RuntimeError(f'expected {len(terms)} results, got {len(results)}')
    return [t for t, r in zip(terms, results) if r.get('keep') is True]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    if not API_KEY:
        sys.exit('Error: DEEPSEEK_API_KEY must be set.')

    tags = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for name, (tag, description, themes) in CATEGORIES.items():
            proposed = set(SEEDS) if name == 'internet' else set()
            for terms in pool.map(lambda theme: brainstorm(description, theme), themes):
                proposed.update(terms)
            proposed = sorted(proposed)
            batches = [proposed[i:i + 40] for i in range(0, len(proposed), 40)]
            kept = [t for batch in pool.map(lambda b: verify(description, b), batches) for t in batch]
            for term in kept:
                tags.setdefault(term, set()).add(tag)
            print(f'{name}: {len(proposed)} proposed, {len(kept)} verified', file=sys.stderr)

    out = {term: sorted(t) for term, t in sorted(tags.items())}
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(out)} terms written to {args.out}', file=sys.stderr)


if __name__ == '__main__':
    main()
