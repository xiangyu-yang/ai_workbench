#!/usr/bin/env python3
"""拉取 A 股 / 港股 / 美股日线行情与实时快照，输出统一 JSON/CSV。

示例：
  python3 fetch_market_data.py --symbol 标的代码或名称 --days 250
  python3 fetch_market_data.py --symbol 港股代码 --days 120 --format csv
  python3 fetch_market_data.py --symbol 美股代码 --days 120 --format json
  python3 fetch_fundamentals.py --symbol 标的代码或名称 --periods 8 --format markdown

数据源：腾讯行情公开接口；A 股失败时回退东方财富公开 K 线接口。
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36'


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbol', required=True, help='如 标的代码或名称 / 港股代码 / 美股代码')
    parser.add_argument('--days', type=int, default=250)
    parser.add_argument('--format', choices=['json', 'csv'], default='json')
    parser.add_argument('--output', default='')
    return parser.parse_args()


def http_text(url, encoding='utf-8'):
    request = urllib.request.Request(
        url,
        headers={
            'User-Agent': UA,
            'Referer': 'https://gu.qq.com/',
            'Accept': '*/*',
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode(encoding, errors='ignore')


def http_json(url):
    return json.loads(http_text(url))


def resolve_by_name(name):
    query = urllib.parse.quote(str(name).strip())
    data = http_json('https://searchapi.eastmoney.com/api/suggest/get?input=' + query + '&type=14')
    rows = ((data.get('QuotationCodeTable') or {}).get('Data') or [])
    if not rows:
        raise ValueError('未找到该名称对应的证券：' + str(name))
    exact = [row for row in rows if str(row.get('Name') or '') == str(name).strip()]
    row = (exact or rows)[0]
    code = str(row.get('Code') or '').strip()
    if not code:
        raise ValueError('名称解析没有返回代码：' + str(name))
    return normalize_symbol(code)


def normalize_symbol(raw):
    s = str(raw or '').strip().upper().replace(' ', '')
    if not s:
        raise ValueError('股票代码不能为空')

    # A 股：代码或 .SH/.SZ/.BJ 后缀 / 带市场前缀
    if s.endswith(('.SH', '.SZ', '.BJ')):
        code, suffix = s[:-3], s[-2:]
        prefix = {'SH': 'sh', 'SZ': 'sz', 'BJ': 'bj'}[suffix]
        return {
            'input': raw,
            'market': 'cn',
            'tencent': prefix + code,
            'display': code + '.' + suffix,
            'code': code,
            'currency': 'CNY',
        }
    if re.fullmatch(r'(SH|SZ|BJ)\d{6}', s):
        prefix, code = s[:2].lower(), s[2:]
        return {
            'input': raw,
            'market': 'cn',
            'tencent': prefix + code,
            'display': code + '.' + prefix.upper(),
            'code': code,
            'currency': 'CNY',
        }
    if re.fullmatch(r'\d{6}', s):
        if s[0] in '69':
            prefix = 'sh'
        elif s[0] in '03':
            prefix = 'sz'
        elif s[0] in '48':
            prefix = 'bj'
        else:
            prefix = 'sh'
        return {
            'input': raw,
            'market': 'cn',
            'tencent': prefix + s,
            'display': s + '.' + prefix.upper(),
            'code': s,
            'currency': 'CNY',
        }

    # 港股：港股代码 / HK00700 / 0700
    if s.endswith('.HK') or s.startswith('HK'):
        raw_code = s.replace('.HK', '').replace('HK', '')
        if not re.fullmatch(r'\d{4,5}', raw_code):
            raise ValueError('港股代码格式应为 港股代码')
        code = raw_code.zfill(5)
        return {
            'input': raw,
            'market': 'hk',
            'tencent': 'hk' + code,
            'display': code + '.HK',
            'code': code,
            'currency': 'HKD',
        }
    if re.fullmatch(r'\d{4,5}', s):
        code = s.zfill(5)
        return {
            'input': raw,
            'market': 'hk',
            'tencent': 'hk' + code,
            'display': code + '.HK',
            'code': code,
            'currency': 'HKD',
        }

    # 美股：美股代码 / 美股代码.US / US.美股代码
    ticker = s.replace('.US', '').replace('US.', '')
    if not re.fullmatch(r'[A-Z][A-Z0-9.\-]{0,11}', ticker):
        return resolve_by_name(str(raw).strip())
    return {
        'input': raw,
        'market': 'us',
        'tencent': 'us' + ticker,
        'display': ticker + '.US',
        'code': ticker,
        'currency': 'USD',
    }


def to_float(value, default=None):
    try:
        return float(str(value).replace(',', '').strip())
    except (TypeError, ValueError):
        return default


def pick(fields, index):
    return fields[index] if 0 <= index < len(fields) else ''


def fetch_quote(resolved):
    text = http_text('https://qt.gtimg.cn/q=' + resolved['tencent'], 'gbk')
    match = re.search(r'="([^"]*)"', text)
    if not match:
        raise ValueError('行情接口没有返回数据（可能代码错误、停牌或接口限流）')
    fields = match.group(1).split('~')
    if len(fields) < 36:
        raise ValueError('行情字段不完整')

    market = resolved['market']
    price = to_float(pick(fields, 3))
    prev_close = to_float(pick(fields, 4))
    open_price = to_float(pick(fields, 5))
    volume = to_float(pick(fields, 6))
    high = to_float(pick(fields, 33))
    low = to_float(pick(fields, 34))
    change = to_float(pick(fields, 31))
    change_pct = to_float(pick(fields, 32))
    amount_raw = to_float(pick(fields, 37))
    amount = amount_raw * 10000 if (market == 'cn' and amount_raw is not None) else amount_raw
    pe = to_float(pick(fields, 39))
    amplitude_pct = to_float(pick(fields, 43))
    market_cap_raw = to_float(pick(fields, 45))
    market_cap = market_cap_raw * 100000000 if market_cap_raw is not None else None
    turnover_pct = to_float(pick(fields, 38)) if market == 'cn' else None
    volume_ratio = to_float(pick(fields, 49)) if market == 'cn' else None
    pb = to_float(pick(fields, 46)) if market == 'cn' else None

    return {
        'name': pick(fields, 1) or resolved['display'],
        'code': pick(fields, 2) or resolved['display'],
        'price': price,
        'prevClose': prev_close,
        'open': open_price,
        'high': high,
        'low': low,
        'volume': volume,
        'amount': amount,
        'change': change,
        'changePct': change_pct,
        'amplitudePct': amplitude_pct,
        'turnoverPct': turnover_pct,
        'volumeRatio': volume_ratio,
        'pe': pe,
        'pb': pb,
        'marketCap': market_cap,
        'currency': resolved['currency'],
        'quoteTime': pick(fields, 30),
        'volumeUnit': '手' if market == 'cn' else '股',
    }


def fetch_tencent_bars(resolved, days, quote):
    kline_symbol = resolved['tencent']
    if resolved['market'] == 'us':
        code = str((quote or {}).get('code') or '')
        if '.' in code:
            kline_symbol = 'us' + code
        else:
            kline_symbol = 'us' + resolved['code'] + '.OQ'
    url = (
        'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='
        + urllib.parse.quote(kline_symbol)
        + ',day,,,'
        + str(max(days + 20, 30))
        + ',qfq'
    )
    data = http_json(url)
    node = (data.get('data') or {}).get(kline_symbol)
    if not node:
        node = next(iter((data.get('data') or {}).values()), None)
    if not node:
        raise ValueError('K 线接口没有返回数据：' + kline_symbol)
    rows = node.get('qfqday') or node.get('day') or []
    result = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 6:
            continue
        day = str(row[0])
        open_price = to_float(row[1])
        close = to_float(row[2])
        high = to_float(row[3])
        low = to_float(row[4])
        volume = to_float(row[5])
        if not day or None in (open_price, close, high, low, volume):
            continue
        result.append({
            'date': day,
            'open': open_price,
            'high': high,
            'low': low,
            'close': close,
            'volume': volume,
        })
    result.sort(key=lambda item: item['date'])
    return result[-days:], kline_symbol


def fetch_eastmoney_bars(resolved, days):
    if resolved['market'] != 'cn':
        raise ValueError('东方财富回退仅支持 A 股')
    code = resolved['code']
    secid = ('1.' if code[0] in '69' else '0.') + code
    url = (
        'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid='
        + secid
        + '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'
        + '&klt=101&fqt=1&beg=0&end=20500101&lmt=' + str(days)
    )
    data = http_json(url)
    node = data.get('data') or {}
    rows = node.get('klines') or []
    result = []
    for row in rows:
        parts = str(row).split(',')
        if len(parts) < 7:
            continue
        result.append({
            'date': parts[0],
            'open': to_float(parts[1]),
            'close': to_float(parts[2]),
            'high': to_float(parts[3]),
            'low': to_float(parts[4]),
            'volume': to_float(parts[5]),
            'amount': to_float(parts[6]),
            'turnoverPct': to_float(parts[10]) if len(parts) > 10 else None,
        })
    result.sort(key=lambda item: item['date'])
    return result[-days:], 'eastmoney'


def fetch_market(raw_symbol, days=250):
    resolved = normalize_symbol(raw_symbol)
    quote = None
    quote_error = ''
    try:
        quote = fetch_quote(resolved)
    except Exception as exc:
        quote_error = str(exc)

    bars = []
    source = 'tencent'
    data_error = ''
    try:
        bars, source = fetch_tencent_bars(resolved, days, quote)
    except Exception as exc:
        data_error = str(exc)
        if resolved['market'] == 'cn':
            try:
                bars, source = fetch_eastmoney_bars(resolved, days)
            except Exception as fallback_exc:
                data_error = data_error + '；回退失败：' + str(fallback_exc)

    if not bars:
        raise ValueError('无法获取日线数据：' + (data_error or '接口无返回'))
    last_date = bars[-1]['date']
    warnings = []
    try:
        last = dt.date.fromisoformat(last_date[:10])
        if (dt.date.today() - last).days > 7:
            warnings.append('最新交易日为 ' + last_date + '，行情可能延迟或停牌')
    except ValueError:
        warnings.append('无法解析最新交易日：' + last_date)
    if quote_error:
        warnings.append('实时快照获取失败：' + quote_error)
    if data_error and source != 'tencent':
        warnings.append('腾讯 K 线失败，已回退：' + source)

    return {
        'symbol': resolved['display'],
        'market': resolved['market'],
        'currency': resolved['currency'],
        'source': source,
        'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'quote': quote,
        'bars': bars,
        'warnings': warnings,
    }


def main():
    args = parse_args()
    payload = fetch_market(args.symbol, args.days)
    if args.format == 'csv':
        lines = ['date,open,high,low,close,volume']
        for bar in payload['bars']:
            lines.append(','.join(str(bar[key]) for key in ('date', 'open', 'high', 'low', 'close', 'volume')))
        output = '\n'.join(lines)
    else:
        output = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as handle:
            handle.write(output)
        print('已写入 ' + args.output + '，共 ' + str(len(payload['bars'])) + ' 根日线')
    else:
        print(output)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('行情获取失败：' + str(error), file=sys.stderr)
        sys.exit(2)
