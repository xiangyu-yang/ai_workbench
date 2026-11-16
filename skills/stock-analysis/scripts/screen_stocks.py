#!/usr/bin/env python3
"""龙头观察池候选筛选（腾讯公开行情 + 内置观察池）。

说明：这是人工维护的龙头观察池，不是全市场量化筛选；适合在用户没有指定
行业/指数时快速给出候选，并明确展示筛选条件。逐只结论仍需
live_market_scan.py 核验。

示例：
  python3 screen_stocks.py --limit 10 --min-market-cap 300 --max-pe 40 --format markdown
  python3 screen_stocks.py --industry 半导体 --sort change --limit 5
"""
import argparse
import csv
import json
import os
import sys
import time

from fetch_market_data import fetch_quote, normalize_symbol

DEFAULT_WATCHLIST = [
    ('600519', '贵州茅台', '白酒'),
    ('000858', '五粮液', '白酒'),
    ('600941', '中国移动', '通信'),
    ('601398', '工商银行', '银行'),
    ('600036', '招商银行', '银行'),
    ('601318', '中国平安', '保险'),
    ('300750', '宁德时代', '新能源'),
    ('002594', '比亚迪', '汽车'),
    ('000333', '美的集团', '家电'),
    ('600276', '恒瑞医药', '医药'),
    ('601012', '隆基绿能', '光伏'),
    ('688981', '中芯国际', '半导体'),
    ('002415', '海康威视', '电子'),
    ('600030', '中信证券', '证券'),
    ('601888', '中国中免', '消费'),
    ('000651', '格力电器', '家电'),
    ('600900', '长江电力', '公用事业'),
    ('601899', '紫金矿业', '有色'),
    ('600028', '中国石化', '能源'),
    ('601088', '中国神华', '能源'),
]


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=10)
    parser.add_argument('--min-market-cap', type=float, default=300, help='最小总市值，单位亿元')
    parser.add_argument('--max-pe', type=float, default=40, help='最大 PE；0 表示不限制')
    parser.add_argument('--industry', default='', help='行业名称包含过滤，如 半导体')
    parser.add_argument('--sort', choices=['market_cap', 'change', 'turnover', 'pe'], default='market_cap')
    parser.add_argument('--format', choices=['markdown', 'json'], default='markdown')
    return parser.parse_args()


def read_watchlist():
    path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'stock-watchlist.csv')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8-sig') as handle:
                rows = list(csv.DictReader(handle))
            parsed = [(row.get('code', '').strip(), row.get('name', '').strip(), row.get('industry', '').strip()) for row in rows]
            parsed = [item for item in parsed if item[0] and item[1]]
            if parsed:
                return parsed
        except Exception:
            pass
    return DEFAULT_WATCHLIST


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fmt_cap(value):
    return '未获取' if value is None else str(round(value / 100000000, 2)) + ' 亿'


def main():
    args = parse_args()
    candidates = []
    errors = []
    for code, fallback_name, industry in read_watchlist():
        if args.industry and args.industry not in industry:
            continue
        try:
            quote = fetch_quote(normalize_symbol(code))
            market_cap = number(quote.get('marketCap'))
            pe = number(quote.get('pe'))
            pb = number(quote.get('pb'))
            if market_cap is None or market_cap < args.min_market_cap * 100000000:
                continue
            if args.max_pe > 0 and (pe is None or pe <= 0 or pe > args.max_pe):
                continue
            candidates.append({
                'code': code,
                'name': quote.get('name') or fallback_name,
                'industry': industry,
                'price': number(quote.get('price')),
                'changePct': number(quote.get('changePct')),
                'turnoverPct': number(quote.get('turnoverPct')),
                'pe': pe,
                'pb': pb,
                'marketCap': market_cap,
            })
        except Exception as error:
            errors.append(code + ':' + str(error)[:80])
        time.sleep(0.05)
    key = {
        'market_cap': lambda item: item['marketCap'] or 0,
        'change': lambda item: item['changePct'] or -999,
        'turnover': lambda item: item['turnoverPct'] or 0,
        'pe': lambda item: item['pe'] if item['pe'] and item['pe'] > 0 else 10**9,
    }[args.sort]
    candidates.sort(key=key, reverse=True)
    candidates = candidates[: max(1, min(args.limit, 20))]
    if not candidates:
        raise ValueError('观察池在当前条件下没有候选；请放宽市值/PE/行业条件')
    result = {
        'universe': '人工维护的龙头观察池（非全市场）',
        'filters': {
            'minMarketCapYi': args.min_market_cap,
            'maxPe': args.max_pe,
            'industry': args.industry or None,
            'sort': args.sort,
        },
        'source': 'tencent-quote + watchlist',
        'note': '候选池不是买入建议；需逐只核验财报、估值和风险。',
        'candidates': candidates,
        'errors': errors,
    }
    if args.format == 'json':
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    lines = []
    lines.append('# A 股龙头候选池（' + ('行业：' + args.industry if args.industry else '观察池全行业') + '）')
    lines.append('')
    lines.append('- 范围：人工维护的龙头观察池，不是全市场筛选；筛选条件：总市值 ≥ ' + str(args.min_market_cap) + ' 亿，PE ≤ ' + (str(args.max_pe) if args.max_pe > 0 else '不限') + '，按 ' + args.sort + ' 排序。')
    lines.append('- 数据源：腾讯公开行情；候选池不构成投资建议，需逐只核验财报与风险。')
    lines.append('')
    lines.append('| 代码 | 名称 | 行业 | 现价 | 涨跌幅 | PE | PB | 总市值 | 换手率 |')
    lines.append('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |')
    for item in candidates:
        lines.append('| ' + item['code'] + ' | ' + item['name'] + ' | ' + item['industry'] + ' | ' + str(item['price']) + ' | ' + str(item['changePct']) + '% | ' + str(item['pe']) + ' | ' + str(item['pb']) + ' | ' + fmt_cap(item['marketCap']) + ' | ' + str(item['turnoverPct']) + '% |')
    lines.append('')
    lines.append('> 下一步：从候选池中选择 1-3 只，调用 live_market_scan.py 做量价与基本面核验；不要对每只股票重复读取同一参考文件。')
    print('\n'.join(lines))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('选股筛选失败：' + str(error), file=sys.stderr)
        sys.exit(2)
