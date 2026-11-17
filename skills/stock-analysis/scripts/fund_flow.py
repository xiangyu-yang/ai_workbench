#!/usr/bin/env python3
"""A 股东方财富资金流向：主力/超大单/大单/中单/小单净流入。

口径：
- 主力净流入 = 超大单 + 大单
- 散户净流入 ≈ 中单 + 小单（接口按单笔金额分类，不等同于真实投资者身份）
- 沪深/北交所使用东方财富 fflow 日线接口；港股/美股没有等价的统一口径。

示例：
  python3 fund_flow.py --symbol 600519 --days 10 --format markdown
"""
import argparse
import datetime as dt
import json
import sys
import urllib.request

from fetch_market_data import normalize_symbol

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36'


def http_json(url):
    request = urllib.request.Request(
        url,
        headers={
            'User-Agent': UA,
            'Referer': 'https://quote.eastmoney.com/',
            'Accept': '*/*',
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode('utf-8', errors='ignore'))


def secid_of(resolved):
    if resolved['market'] != 'cn':
        raise ValueError('资金流向仅支持 A 股；港股/美股没有统一的散户/主力口径')
    suffix = resolved['display'].split('.')[-1]
    market_id = '1' if suffix == 'SH' else '0'
    return market_id + '.' + resolved['code']


def to_float(value, default=None):
    try:
        return float(str(value).replace(',', '').strip())
    except (TypeError, ValueError):
        return default


def fetch_fund_flow(resolved, days=10):
    resolved = normalize_symbol(resolved) if isinstance(resolved, str) else resolved
    secid = secid_of(resolved)
    limit = max(5, min(int(days), 30))
    url = (
        'https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get'
        '?lmt=' + str(limit) +
        '&klt=101&fields1=f1,f2,f3,f7'
        '&fields2=f51,f52,f53,f54,f55,f56,f57'
        '&secid=' + secid
    )
    data = http_json(url)
    node = data.get('data') or {}
    rows = node.get('klines') or []
    if not rows:
        raise ValueError('资金流向接口没有返回数据（可能停牌、北交所不支持或接口限流）')
    history = []
    for line in rows:
        parts = str(line).split(',')
        if len(parts) < 7:
            continue
        main = to_float(parts[1])
        small = to_float(parts[2])
        medium = to_float(parts[3])
        large = to_float(parts[4])
        super_large = to_float(parts[5])
        main_ratio = to_float(parts[6])
        retail = (small or 0) + (medium or 0)
        history.append({
            'date': parts[0],
            'mainNet': main,
            'mainRatioPct': main_ratio,
            'superLargeNet': super_large,
            'largeNet': large,
            'mediumNet': medium,
            'smallNet': small,
            'retailNet': retail,
            'totalNet': (main or 0) + retail,
        })
    if not history:
        raise ValueError('资金流向字段不完整')
    latest = history[-1]
    def direction(value):
        if value is None:
            return '未获取'
        return '净流入' if value > 0 else ('净流出' if value < 0 else '持平')
    def sum_of(key, size):
        values = [item[key] for item in history[-size:] if item[key] is not None]
        return round(sum(values), 2) if values else None
    return {
        'source': 'eastmoney-fund-flow',
        'code': node.get('code') or resolved['code'],
        'name': node.get('name') or resolved['display'],
        'date': latest['date'],
        'mainNet': round(latest['mainNet'], 2) if latest['mainNet'] is not None else None,
        'mainRatioPct': round(latest['mainRatioPct'], 2) if latest['mainRatioPct'] is not None else None,
        'superLargeNet': round(latest['superLargeNet'], 2) if latest['superLargeNet'] is not None else None,
        'largeNet': round(latest['largeNet'], 2) if latest['largeNet'] is not None else None,
        'mediumNet': round(latest['mediumNet'], 2) if latest['mediumNet'] is not None else None,
        'smallNet': round(latest['smallNet'], 2) if latest['smallNet'] is not None else None,
        'retailNet': round(latest['retailNet'], 2) if latest['retailNet'] is not None else None,
        'mainDirection': direction(latest['mainNet']),
        'retailDirection': direction(latest['retailNet']),
        'mainNet5': sum_of('mainNet', 5),
        'retailNet5': sum_of('retailNet', 5),
        'mainNet10': sum_of('mainNet', 10),
        'retailNet10': sum_of('retailNet', 10),
        'history': history,
        'warnings': [
            '主力=超大单+大单，散户≈中单+小单；这是按成交金额分类，不等同于真实投资者身份',
            '盘中最新一天的资金流是动态数据，收盘后才完整',
        ],
    }


def fmt_flow(value):
    if value is None:
        return '未获取'
    sign = '+' if value > 0 else ''
    absolute = abs(value)
    if absolute >= 100_000_000:
        return sign + format(value / 100_000_000, '.2f') + ' 亿'
    if absolute >= 10_000:
        return sign + format(value / 10_000, '.2f') + ' 万'
    return sign + format(value, '.0f') + ' 元'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbol', required=True)
    parser.add_argument('--days', type=int, default=10)
    parser.add_argument('--format', choices=['markdown', 'json'], default='markdown')
    args = parser.parse_args()
    flow = fetch_fund_flow(args.symbol, args.days)
    if args.format == 'json':
        print(json.dumps(flow, ensure_ascii=False, indent=2))
        return
    lines = [
        '# ' + str(flow['name']) + '（' + str(flow['code']) + '）资金流向',
        '',
        '- 数据日期：' + str(flow['date']) + '；来源：东方财富公开资金流接口',
        '- 主力' + ('净流入' if flow['mainDirection'] == '净流入' else flow['mainDirection']) + '：' + fmt_flow(flow['mainNet']) + '；主力占比：' + str(flow['mainRatioPct']) + '%',
        '- 散户' + ('净流入' if flow['retailDirection'] == '净流入' else flow['retailDirection']) + '（中小单）：' + fmt_flow(flow['retailNet']),
        '- 超大单/大单/中单/小单：' + fmt_flow(flow['superLargeNet']) + ' / ' + fmt_flow(flow['largeNet']) + ' / ' + fmt_flow(flow['mediumNet']) + ' / ' + fmt_flow(flow['smallNet']),
        '- 5 日主力累计：' + fmt_flow(flow['mainNet5']) + '；10 日主力累计：' + fmt_flow(flow['mainNet10']),
        '- 5 日散户累计：' + fmt_flow(flow['retailNet5']) + '；10 日散户累计：' + fmt_flow(flow['retailNet10']),
        '',
        '| 日期 | 主力净流入 | 主力占比 | 超大单 | 大单 | 中单 | 小单 |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ]
    for item in flow['history'][-10:]:
        lines.append(
            '| ' + str(item['date']) + ' | ' + fmt_flow(item['mainNet']) + ' | '
            + (str(item['mainRatioPct']) + '%' if item['mainRatioPct'] is not None else '未获取') + ' | '
            + fmt_flow(item['superLargeNet']) + ' | ' + fmt_flow(item['largeNet']) + ' | '
            + fmt_flow(item['mediumNet']) + ' | ' + fmt_flow(item['smallNet']) + ' |'
        )
    lines.extend(['', '> ' + '；'.join(flow['warnings'])])
    print('\n'.join(lines))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('资金流向获取失败：' + str(error), file=sys.stderr)
        sys.exit(2)
