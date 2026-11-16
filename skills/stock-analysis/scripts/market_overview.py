#!/usr/bin/env python3
"""A/H/US 主要指数与跨市场温度计。

示例：
  python3 market_overview.py --market all --format markdown
  python3 market_overview.py --market cn --days 120
  python3 market_overview.py --symbols sh000001,hkHSI,usIXIC
"""
import argparse
import json
import re
import sys
import urllib.request

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36'
INDEXES = [
    ('sh000001', '上证指数', 'A股'),
    ('sz399001', '深证成指', 'A股'),
    ('sz399006', '创业板指', 'A股'),
    ('sh000300', '沪深300', 'A股'),
    ('hkHSI', '恒生指数', '港股'),
    ('hkHSTECH', '恒生科技', '港股'),
    ('us.IXIC', '纳斯达克', '美股'),
    ('us.INX', '标普500', '美股'),
    ('us.DJI', '道琼斯', '美股'),
]


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--market', choices=['all', 'cn', 'hk', 'us'], default='all')
    parser.add_argument('--symbols', default='')
    parser.add_argument('--days', type=int, default=120)
    parser.add_argument('--format', choices=['markdown', 'json'], default='markdown')
    return parser.parse_args()


def http_text(url):
    request = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': 'https://gu.qq.com/'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode('gbk', errors='ignore')


def http_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': 'https://gu.qq.com/'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode('utf-8', errors='ignore'))


def quote(symbol):
    text = http_text('https://qt.gtimg.cn/q=' + symbol)
    body = text.split('="', 1)[1].rsplit('"', 1)[0] if '="' in text else ''
    parts = body.split('~')
    if len(parts) < 35:
        raise ValueError('指数行情字段不足：' + symbol)
    return {
        'name': parts[1],
        'symbol': parts[2],
        'price': float(parts[3]),
        'prevClose': float(parts[4]),
        'open': float(parts[5]),
        'change': float(parts[31]),
        'changePct': float(parts[32]),
        'high': float(parts[33]),
        'low': float(parts[34]),
    }


def bars(symbol, days):
    url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + symbol + ',day,,,' + str(min(max(days, 30), 500)) + ',qfq'
    data = http_json(url)
    node = (data.get('data') or {}).get(symbol) or {}
    rows = node.get('qfqday') or node.get('day') or []
    return [{'date': row[0], 'open': float(row[1]), 'close': float(row[2]), 'high': float(row[3]), 'low': float(row[4]), 'volume': float(row[5])} for row in rows if len(row) >= 6]


def sma(values, window):
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def analyze(symbol, name, market, days):
    q = quote(symbol)
    rows = bars(symbol, days + 1)
    closes = [row['close'] for row in rows] or [q['price']]
    volumes = [row['volume'] for row in rows]
    ma20 = sma(closes, 20)
    ma60 = sma(closes, 60)
    change20 = (closes[-1] / closes[-21] - 1) * 100 if len(closes) > 20 else None
    volumeRatio = volumes[-1] / (sum(volumes[-21:-1]) / 20) if len(volumes) > 21 and sum(volumes[-21:-1]) > 0 else None
    return {
        'symbol': symbol,
        'name': q['name'] or name,
        'market': market,
        'price': round(q['price'], 2),
        'changePct': round(q['changePct'], 2),
        'change': round(q['change'], 2),
        'high': round(q['high'], 2),
        'low': round(q['low'], 2),
        'ma20': round(ma20, 2) if ma20 else None,
        'ma60': round(ma60, 2) if ma60 else None,
        'change20Pct': round(change20, 2) if change20 is not None else None,
        'volumeRatio20': round(volumeRatio, 2) if volumeRatio is not None else None,
        'trend': '多头' if ma20 and ma60 and closes[-1] > ma20 > ma60 else ('空头' if ma20 and ma60 and closes[-1] < ma20 < ma60 else '震荡'),
        'lastDate': rows[-1]['date'] if rows else '',
    }


def main():
    args = parse_args()
    selected = []
    if args.symbols:
        wanted = [item.strip() for item in args.symbols.split(',') if item.strip()]
        selected = [(symbol, symbol, '自定义') for symbol in wanted]
    else:
        selected = [item for item in INDEXES if args.market == 'all' or item[2] == {'cn': 'A股', 'hk': '港股', 'us': '美股'}[args.market]]
    results = []
    errors = []
    for symbol, name, market in selected:
        try:
            results.append(analyze(symbol, name, market, args.days))
        except Exception as error:
            errors.append(symbol + ':' + str(error)[:80])
    if not results:
        raise ValueError('没有成功获取任何指数数据；请检查网络或指数代码')
    result = {
        'source': 'tencent-index-quote',
        'fetchedAt': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
        'note': '指数行情为公开数据，可能延迟；不构成投资建议。',
        'indices': results,
        'errors': errors,
    }
    if args.format == 'json':
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    lines = ['# A/H/US 主要指数温度计', '']
    lines.append('- 数据源：腾讯公开行情；趋势按收盘价与 MA20/MA60 判断。')
    lines.append('- 用途：判断大盘环境与风格，不替代个股基本面研究。')
    lines.append('')
    lines.append('| 市场 | 指数 | 最新 | 当日 | 20日 | MA20/60 | 20日量比 | 趋势 |')
    lines.append('| --- | --- | ---: | ---: | ---: | --- | ---: | --- |')
    for item in results:
        lines.append('| ' + item['market'] + ' | ' + item['name'] + '（' + item['symbol'] + '） | ' + str(item['price']) + ' | ' + str(item['changePct']) + '% | ' + (str(item['change20Pct']) + '%' if item['change20Pct'] is not None else '未获取') + ' | ' + str(item['ma20']) + ' / ' + str(item['ma60']) + ' | ' + (str(item['volumeRatio20']) if item['volumeRatio20'] is not None else '未获取') + ' | ' + item['trend'] + ' |')
    if errors:
        lines.append('')
        lines.append('**部分指数获取失败**：' + '；'.join(errors))
    lines.append('')
    lines.append('> 大盘结论应结合估值、盈利周期、流动性与政策；不要仅凭单日涨跌判断趋势。')
    print('\n'.join(lines))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('大盘数据获取失败：' + str(error), file=sys.stderr)
        sys.exit(2)
