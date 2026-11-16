#!/usr/bin/env python3
"""从会议文本中启发式抽取行动项，输出 JSON 或 Markdown。"""
import argparse
import json
import os
import re
from datetime import datetime

ACTION_WORDS = ['负责', '跟进', '完成', '提交', '确认', '安排', '推进', '修复', '发布', '提供', '对齐', '整理', '输出', '验证', '联系', '准备', '更新', '评审', '发送']
DATE_PATTERN = re.compile(r'(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日|本周[一二三四五六日]|本周|下周[一二三四五六日]?|下月|周[一二三四五六日])')
OWNER_PATTERN = re.compile(r'([\u4e00-\u9fa5]{2,3})(?=负责|跟进|来|会)')
SPEAKER_PATTERN = re.compile(r'^\s*([\u4e00-\u9fa5]{2,4})[：:]\s*(.*)$')
MENTION_PATTERN = re.compile(r'@([\w\u4e00-\u9fa5]{2,12})')


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--format', choices=['json', 'markdown'], default='json')
    return parser.parse_args()


def split_sentences(text):
    text = text.replace('\r\n', '\n')
    chunks = re.split(r'[。！？!?\n]+', text)
    return [chunk.strip(' ，,;；') for chunk in chunks if chunk.strip()]


def main():
    args = parse_args()
    if not args.input:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    with open(args.input, 'r', encoding='utf-8-sig') as handle:
        content = handle.read()

    items = []
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        owner = ''
        speaker = SPEAKER_PATTERN.match(line)
        if speaker:
            owner = speaker.group(1)
            line = speaker.group(2).strip()
        mention = MENTION_PATTERN.search(line)
        if mention:
            owner = mention.group(1)
        elif not owner:
            owner_match = OWNER_PATTERN.search(line)
            if owner_match:
                owner = owner_match.group(1)
        for sentence in split_sentences(line):
            if not any(word in sentence for word in ACTION_WORDS):
                continue
            date_matches = DATE_PATTERN.findall(sentence)
            due = date_matches[-1] if date_matches else ''
            items.append({
                'action': sentence[:300],
                'owner': owner or '待确认',
                'due': due or '待确认',
                'status': '待开始',
                'acceptance': '待补充',
                'source': '会议转写',
            })

    if not items:
        items.append({
            'action': '未识别到明确行动项，请人工复核会议记录',
            'owner': '待确认', 'due': '待确认', 'status': '待确认',
            'acceptance': '待补充', 'source': '启发式抽取',
        })

    if args.format == 'markdown':
        lines = ['| 动作 | 负责人 | 截止 | 验收标准 |', '| --- | --- | --- | --- |']
        for item in items:
            lines.append('| ' + item['action'] + ' | ' + item['owner'] + ' | ' + item['due'] + ' | ' + item['acceptance'] + ' |')
        print('\n'.join(lines))
    else:
        print(json.dumps({'generatedAt': datetime.now().isoformat(), 'items': items}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
