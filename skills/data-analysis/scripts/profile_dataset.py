#!/usr/bin/env python3
"""CSV 数据体检：字段类型、缺失、唯一值、数值分布与 Top 值。"""
import argparse
import csv
import json
import os
import statistics
from collections import Counter


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--top', type=int, default=5)
    parser.add_argument('--max-rows', type=int, default=20000)
    return parser.parse_args()


def is_number(value):
    try:
        float(str(value).replace(',', ''))
        return True
    except (TypeError, ValueError):
        return False


def main():
    args = parse_args()
    if not args.input:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    with open(args.input, 'r', encoding='utf-8-sig', newline='') as handle:
        sample = handle.read(4096)
        handle.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample)
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(handle, dialect=dialect)
        rows = []
        for index, row in enumerate(reader):
            if index >= args.max_rows:
                break
            rows.append(row)
    if not rows:
        raise SystemExit('文件没有数据行')

    columns = list(rows[0].keys())
    result = {
        'input': args.input,
        'rows': len(rows),
        'columns': len(columns),
        'max_rows': args.max_rows,
        'fields': [],
    }
    for column in columns:
        values = [str(row.get(column, '')).strip() for row in rows]
        non_empty = [value for value in values if value != '']
        missing = len(values) - len(non_empty)
        unique = len(set(non_empty))
        field = {
            'name': column,
            'missing': missing,
            'missing_pct': round((missing / len(values)) * 100, 1) if values else 0,
            'unique': unique,
            'numeric': non_empty and all(is_number(value) for value in non_empty[:200]),
        }
        if field['numeric']:
            numbers = [float(value.replace(',', '')) for value in non_empty]
            numbers.sort()
            field.update({
                'min': round(numbers[0], 4),
                'max': round(numbers[-1], 4),
                'mean': round(statistics.fmean(numbers), 4),
                'median': round(statistics.median(numbers), 4),
                'p90': round(numbers[min(len(numbers) - 1, int(len(numbers) * 0.9))], 4),
            })
        else:
            field['top'] = Counter(non_empty).most_common(args.top)
        result['fields'].append(field)

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
