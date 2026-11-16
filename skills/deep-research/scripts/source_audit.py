#!/usr/bin/env python3
"""来源清单审计：数量、一手比例、时效、域名集中度与缺口。"""
import argparse
import json
import os
from datetime import datetime, timedelta
from urllib.parse import urlparse


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--max-age-days', type=int, default=365)
    return parser.parse_args()


def main():
    args = parse_args()
    if not args.input:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    with open(args.input, 'r', encoding='utf-8-sig') as handle:
        data = json.load(handle)
    sources = data.get('sources', data if isinstance(data, list) else [])
    if not sources:
        raise SystemExit('来源列表为空')

    now = datetime.now()
    warnings = []
    domains = {}
    primary = 0
    fresh = 0
    for source in sources:
        if source.get('primary') or source.get('type') in ('official', 'filing', 'interview', 'primary'):
            primary += 1
        published = source.get('publishedAt') or source.get('date')
        if published:
            try:
                date = datetime.fromisoformat(str(published)[:10])
                if now - date <= timedelta(days=args.max_age_days):
                    fresh += 1
                else:
                    warnings.append('来源过旧：' + str(source.get('title', '')) + ' / ' + str(published))
            except ValueError:
                warnings.append('日期格式无法解析：' + str(source.get('title', '')))
        else:
            warnings.append('缺少日期：' + str(source.get('title', '')))
        url = source.get('url') or ''
        if url:
            domain = urlparse(url).netloc
            domains[domain] = domains.get(domain, 0) + 1

    total = len(sources)
    primary_ratio = primary / total
    freshness_ratio = fresh / total
    max_domain = max(domains.values()) if domains else 0
    if total < 5:
        warnings.append('来源数量偏少（<5）')
    if primary_ratio < 0.4:
        warnings.append('一手来源比例低于 40%')
    if freshness_ratio < 0.6:
        warnings.append('有效期内来源低于 60%')
    if max_domain and max_domain / total > 0.6:
        warnings.append('单一域名占比过高，注意来源多样性')

    result = {
        'totalSources': total,
        'primaryRatio': round(primary_ratio, 2),
        'freshnessRatio': round(freshness_ratio, 2),
        'domains': domains,
        'warnings': warnings,
        'verdict': 'pass' if not warnings else 'review',
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
