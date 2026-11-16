#!/usr/bin/env python3
"""Markdown 可读性检查：段落、句子、标题、列表与长句。"""
import argparse
import json
import os
import re


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--max-paragraph', type=int, default=180)
    parser.add_argument('--max-sentence', type=int, default=60)
    return parser.parse_args()


def main():
    args = parse_args()
    if not args.input:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    with open(args.input, 'r', encoding='utf-8-sig') as handle:
        text = handle.read()

    lines = text.splitlines()
    paragraphs = []
    current = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current:
                paragraphs.append(' '.join(current))
                current = []
        elif stripped.startswith('#') or stripped.startswith('- ') or stripped.startswith('* ') or re.match(r'^\d+\.', stripped):
            if current:
                paragraphs.append(' '.join(current))
                current = []
            if stripped.startswith('#') or stripped.startswith('- ') or stripped.startswith('* ') or re.match(r'^\d+\.', stripped):
                paragraphs.append(stripped)
        else:
            current.append(stripped)
    if current:
        paragraphs.append(' '.join(current))

    body = [p for p in paragraphs if not p.startswith('#') and not p.startswith('- ') and not p.startswith('* ') and not re.match(r'^\d+\.', p)]
    sentences = [s for s in re.split(r'[。！？!?；;]', ' '.join(body)) if s.strip()]
    long_paragraphs = [p for p in body if len(p) > args.max_paragraph]
    long_sentences = [s for s in sentences if len(s) > args.max_sentence]
    headings = [line for line in lines if line.strip().startswith('#')]
    bullets = [line for line in lines if line.strip().startswith(('- ', '* '))]

    issues = []
    if long_paragraphs:
        issues.append('有 ' + str(len(long_paragraphs)) + ' 个段落超过 ' + str(args.max_paragraph) + ' 字')
    if long_sentences:
        issues.append('有 ' + str(len(long_sentences)) + ' 个句子超过 ' + str(args.max_sentence) + ' 字')
    if len(headings) < 3 and len(text) > 1200:
        issues.append('长文档标题层级偏少')
    if not bullets and len(text) > 800:
        issues.append('没有列表，信息密度可能过高')

    result = {
        'characters': len(text),
        'paragraphs': len(body),
        'headings': len(headings),
        'bullets': len(bullets),
        'avgParagraphChars': round(sum(len(p) for p in body) / len(body), 1) if body else 0,
        'avgSentenceChars': round(sum(len(s) for s in sentences) / len(sentences), 1) if sentences else 0,
        'longParagraphs': len(long_paragraphs),
        'longSentences': len(long_sentences),
        'issues': issues,
        'verdict': 'pass' if not issues else 'revise',
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
