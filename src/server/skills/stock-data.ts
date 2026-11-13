/**
 * 股票技能的行情数据与量价分析实现。
 *
 * 数据源：
 * - 腾讯行情公开接口（A 股 / 港股 / 美股），无需 API Key；
 * - 东方财富公开 K 线接口作为 A 股回退；
 * - 所有接口都可能变更或限流，脚本必须明确报错，禁止模型编造当日行情。
 */

export const FETCH_MARKET_SCRIPT = String.raw`#!/usr/bin/env python3
"""拉取 A 股 / 港股 / 美股日线行情与实时快照，输出统一 JSON/CSV。

示例：
  python3 fetch_market_data.py --symbol 600941 --days 250
  python3 fetch_market_data.py --symbol 00700.HK --days 120 --format csv
  python3 fetch_market_data.py --symbol AAPL --days 120 --format json

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
    parser.add_argument('--symbol', required=True, help='如 600941 / 600941.SH / 00700.HK / AAPL')
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


def normalize_symbol(raw):
    s = str(raw or '').strip().upper().replace(' ', '')
    if not s:
        raise ValueError('股票代码不能为空')

    # A 股：600941.SH / SH600941 / 600941
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

    # 港股：00700.HK / HK00700 / 0700
    if s.endswith('.HK') or s.startswith('HK'):
        raw_code = s.replace('.HK', '').replace('HK', '')
        if not re.fullmatch(r'\d{4,5}', raw_code):
            raise ValueError('港股代码格式应为 00700.HK')
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

    # 美股：AAPL / AAPL.US / US.AAPL
    ticker = s.replace('.US', '').replace('US.', '')
    if not re.fullmatch(r'[A-Z][A-Z0-9.\-]{0,11}', ticker):
        raise ValueError('无法识别的股票代码：' + raw)
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
`;

export const LIVE_MARKET_SCAN_SCRIPT = String.raw`#!/usr/bin/env python3
"""实时行情 + 量价诊断：拉取日线，计算放量/缩量、量价背离、OBV、MFI、VWAP 与技术指标。

示例：
  python3 live_market_scan.py --symbol 600941 --days 250 --format markdown
  python3 live_market_scan.py --symbol AAPL --days 120 --format json
"""
import argparse
import json
import math
import statistics
import sys

from fetch_market_data import fetch_market


def sma(values, window):
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def rsi(values, window=14):
    if len(values) <= window:
        return None
    gains = []
    losses = []
    for index in range(1, len(values)):
        change = values[index] - values[index - 1]
        gains.append(max(change, 0))
        losses.append(max(-change, 0))
    avg_gain = sum(gains[:window]) / window
    avg_loss = sum(losses[:window]) / window
    for index in range(window, len(gains)):
        avg_gain = (avg_gain * (window - 1) + gains[index]) / window
        avg_loss = (avg_loss * (window - 1) + losses[index]) / window
    if avg_loss == 0:
        return 100.0
    return 100 - 100 / (1 + avg_gain / avg_loss)


def atr(highs, lows, closes, window=14):
    if len(closes) <= window:
        return None
    ranges = []
    for index in range(1, len(closes)):
        ranges.append(max(highs[index] - lows[index], abs(highs[index] - closes[index - 1]), abs(lows[index] - closes[index - 1])))
    value = sum(ranges[:window]) / window
    for index in range(window, len(ranges)):
        value = (value * (window - 1) + ranges[index]) / window
    return value


def max_drawdown(values):
    peak = values[0]
    worst = 0.0
    for value in values:
        peak = max(peak, value)
        worst = min(worst, value / peak - 1)
    return worst


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbol', required=True)
    parser.add_argument('--days', type=int, default=250)
    parser.add_argument('--format', choices=['markdown', 'json'], default='markdown')
    return parser.parse_args()


def pct(current, previous):
    if previous in (None, 0) or current is None:
        return None
    return (current / previous - 1) * 100


def mean(values):
    return sum(values) / len(values) if values else None


def mfi(highs, lows, closes, volumes, window=14):
    if len(closes) <= window:
        return None
    typical = [(highs[i] + lows[i] + closes[i]) / 3 for i in range(len(closes))]
    positive = 0.0
    negative = 0.0
    start = max(1, len(typical) - window)
    for i in range(start, len(typical)):
        flow = typical[i] * volumes[i]
        if typical[i] > typical[i - 1]:
            positive += flow
        elif typical[i] < typical[i - 1]:
            negative += flow
    if negative == 0:
        return 100.0
    ratio = positive / negative
    return 100 - 100 / (1 + ratio)


def obv(closes, volumes):
    total = 0.0
    series = []
    for index, close in enumerate(closes):
        if index and close > closes[index - 1]:
            total += volumes[index]
        elif index and close < closes[index - 1]:
            total -= volumes[index]
        series.append(total)
    return series


def volume_price_metrics(bars, quote):
    closes = [bar['close'] for bar in bars]
    highs = [bar['high'] for bar in bars]
    lows = [bar['low'] for bar in bars]
    volumes = [bar['volume'] for bar in bars]
    if len(closes) < 20:
        raise ValueError('至少需要 20 根日线')
    last = bars[-1]
    previous = bars[-2]
    change_pct = quote.get('changePct') if quote and quote.get('changePct') is not None else pct(last['close'], previous['close'])
    previous5 = volumes[-6:-1] or volumes[-5:]
    previous20 = volumes[-21:-1] or volumes[:-1]
    avg5 = mean(previous5)
    avg20 = mean(previous20)
    vol_ratio5 = volumes[-1] / avg5 if avg5 else None
    vol_ratio20 = volumes[-1] / avg20 if avg20 else None
    if vol_ratio20 is not None and vol_ratio20 >= 2.5:
        regime = '爆量'
    elif vol_ratio20 is not None and vol_ratio20 >= 1.5:
        regime = '明显放量'
    elif vol_ratio20 is not None and vol_ratio20 >= 1.2:
        regime = '温和放量'
    elif vol_ratio20 is not None and vol_ratio20 <= 0.5:
        regime = '地量'
    elif vol_ratio20 is not None and vol_ratio20 <= 0.8:
        regime = '缩量'
    else:
        regime = '平量'

    expanding = regime in ('温和放量', '明显放量', '爆量')
    shrinking = regime in ('缩量', '地量')
    if change_pct is None:
        signal = '数据不足'
    elif change_pct > 0 and expanding:
        signal = '放量上涨'
    elif change_pct < 0 and expanding:
        signal = '放量下跌'
    elif change_pct > 0 and shrinking:
        signal = '缩量上涨'
    elif change_pct < 0 and shrinking:
        signal = '缩量下跌'
    elif change_pct > 0:
        signal = '平量上涨'
    elif change_pct < 0:
        signal = '平量下跌'
    else:
        signal = '平量震荡'

    price5 = pct(closes[-1], closes[-6]) if len(closes) > 5 else None
    vol5 = pct(mean(volumes[-5:]), mean(volumes[-10:-5])) if len(volumes) > 9 else None
    if price5 is not None and vol5 is not None:
        if price5 > 0 and vol5 > 0:
            divergence = '量价齐升'
        elif price5 < 0 and vol5 < 0:
            divergence = '量价齐跌'
        elif price5 > 0 and vol5 < 0:
            divergence = '价涨量缩'
        elif price5 < 0 and vol5 > 0:
            divergence = '价跌量放'
        else:
            divergence = '量价平稳'
    else:
        divergence = '数据不足'

    volume_mean = mean(volumes[-20:])
    volume_std = statistics.pstdev(volumes[-20:]) if len(volumes) >= 20 else 0
    volume_z = (volumes[-1] - volume_mean) / volume_std if volume_std else None
    obv_series = obv(closes, volumes)
    obv_trend = obv_series[-1] - obv_series[-6] if len(obv_series) > 5 else None
    mfi14 = mfi(highs, lows, closes, volumes)
    typical = [(highs[i] + lows[i] + closes[i]) / 3 for i in range(len(closes))]
    vwap20 = (
        sum(typical[i] * volumes[i] for i in range(len(closes) - 20, len(closes)))
        / sum(volumes[-20:])
        if sum(volumes[-20:])
        else None
    )
    gap_pct = pct(last['open'], previous['close'])
    amplitude_pct = pct(last['high'], last['low'])
    avg_amplitude = mean([pct(bar['high'], bar['low']) for bar in bars[-20:]])

    return {
        'changePct': round(change_pct, 2) if change_pct is not None else None,
        'volume': volumes[-1],
        'volumeUnit': (quote or {}).get('volumeUnit', ''),
        'volumeAvg5': round(avg5, 2) if avg5 else None,
        'volumeAvg20': round(avg20, 2) if avg20 else None,
        'volumeRatio5': round(vol_ratio5, 2) if vol_ratio5 is not None else None,
        'volumeRatio20': round(vol_ratio20, 2) if vol_ratio20 is not None else None,
        'volumeBasis': '当日成交量 / 前 N 个交易日均量',
        'volumeRegime': regime,
        'volumeRegime20': regime,
        'volumePriceSignal': signal,
        'volumePriceDivergence5d': divergence,
        'price5dPct': round(price5, 2) if price5 is not None else None,
        'volume5dChangePct': round(vol5, 2) if vol5 is not None else None,
        'volumeZScore20': round(volume_z, 2) if volume_z is not None else None,
        'obv5dChange': round(obv_trend, 2) if obv_trend is not None else None,
        'mfi14': round(mfi14, 2) if mfi14 is not None else None,
        'vwap20': round(vwap20, 3) if vwap20 else None,
        'priceVsVwap20Pct': round(pct(last['close'], vwap20), 2) if vwap20 else None,
        'gapPct': round(gap_pct, 2) if gap_pct is not None else None,
        'amplitudePct': round(amplitude_pct, 2) if amplitude_pct is not None else None,
        'avgAmplitude20Pct': round(avg_amplitude, 2) if avg_amplitude is not None else None,
    }


def main():
    args = parse_args()
    market = fetch_market(args.symbol, args.days)
    bars = market['bars']
    quote = market.get('quote') or {}
    closes = [bar['close'] for bar in bars]
    highs = [bar['high'] for bar in bars]
    lows = [bar['low'] for bar in bars]
    last = bars[-1]
    volume_metrics = volume_price_metrics(bars, quote)
    returns = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes)) if closes[i - 1] > 0]
    volatility = statistics.pstdev(returns) * math.sqrt(252) if len(returns) > 1 else None
    sma20 = sma(closes, 20)
    sma60 = sma(closes, 60)
    sma200 = sma(closes, 200)
    rsi_value = rsi(closes)
    atr_value = atr(highs, lows, closes)
    recent = closes[-20:]
    mid = mean(recent)
    std = statistics.pstdev(recent) if len(recent) > 1 else 0
    trend = 'mixed'
    if sma20 and sma60 and closes[-1] > sma20 > sma60:
        trend = 'bullish'
    if sma20 and sma60 and closes[-1] < sma20 < sma60:
        trend = 'bearish'
    if sma200 and closes[-1] > sma200:
        trend += '_long'
    if sma200 and closes[-1] < sma200:
        trend += '_below_200'
    result = {
        'symbol': market['symbol'],
        'name': quote.get('name') or market['symbol'],
        'market': market['market'],
        'source': market['source'],
        'fetchedAt': market['fetchedAt'],
        'lastDate': last['date'],
        'lastClose': last['close'],
        'currency': market['currency'],
        'quote': quote,
        'volumePrice': volume_metrics,
        'technical': {
            'sma20': round(sma20, 3) if sma20 else None,
            'sma60': round(sma60, 3) if sma60 else None,
            'sma200': round(sma200, 3) if sma200 else None,
            'trend': trend,
            'rsi14': round(rsi_value, 2) if rsi_value is not None else None,
            'atr14': round(atr_value, 3) if atr_value else None,
            'annualizedVolPct': round(volatility * 100, 2) if volatility else None,
            'maxDrawdownPct': round(max_drawdown(closes) * 100, 2),
            'bollinger': {
                'middle': round(mid, 3) if mid else None,
                'upper': round(mid + 2 * std, 3) if mid else None,
                'lower': round(mid - 2 * std, 3) if mid else None,
            },
            'high52w': round(max(closes[-252:]), 3),
            'low52w': round(min(closes[-252:]), 3),
            'support20': round(min(lows[-20:]), 3),
            'resistance20': round(max(highs[-20:]), 3),
            'position52wPct': round((closes[-1] - min(closes[-252:])) / (max(closes[-252:]) - min(closes[-252:])) * 100, 2) if max(closes[-252:]) > min(closes[-252:]) else None,
            'distanceSupportPct': round((closes[-1] / min(lows[-20:]) - 1) * 100, 2) if min(lows[-20:]) else None,
            'distanceResistancePct': round((max(highs[-20:]) / closes[-1] - 1) * 100, 2) if closes[-1] else None,
        },
        'bars': len(bars),
        'warnings': market.get('warnings', []),
    }
    if args.format == 'json':
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    vp = result['volumePrice']
    tech = result['technical']
    quote_name = result['name']
    lines = []
    lines.append('# ' + quote_name + '（' + result['symbol'] + '）行情与量价诊断')
    lines.append('')
    lines.append('- 数据截止：' + result['lastDate'] + '；收盘 ' + str(result['lastClose']) + ' ' + result['currency'] + '；来源：' + result['source'])
    if quote.get('price') is not None:
        lines.append('- 实时快照：' + str(quote.get('price')) + '，涨跌幅 ' + str(quote.get('changePct')) + '%，成交额 ' + str(quote.get('amount')) + ' ' + result['currency'])
    lines.append('- **量价信号：' + str(vp['volumePriceSignal']) + '**；量能：' + str(vp['volumeRegime']) + '；20 日量比（当日/前20日均量）' + str(vp['volumeRatio20']) + '；5 日量比（当日/前5日均量）' + str(vp['volumeRatio5']))
    lines.append('- 5 日量价：' + str(vp['volumePriceDivergence5d']) + '（价格 ' + str(vp['price5dPct']) + '%，量能 ' + str(vp['volume5dChangePct']) + '%）')
    lines.append('- OBV 5 日变化：' + str(vp['obv5dChange']) + '；MFI14：' + str(vp['mfi14']) + '；价格相对 VWAP20：' + str(vp['priceVsVwap20Pct']) + '%')
    if quote.get('turnoverPct') is not None:
        lines.append('- 换手率：' + str(quote.get('turnoverPct')) + '%；行情量比字段：' + str(quote.get('volumeRatio')))
    valuation = []
    if quote.get('pe') is not None:
        valuation.append('PE ' + str(quote.get('pe')))
    if quote.get('pb') is not None:
        valuation.append('PB ' + str(quote.get('pb')))
    if quote.get('marketCap') is not None:
        valuation.append('总市值 ' + str(round(quote.get('marketCap') / 100000000, 2)) + ' 亿')
    if valuation:
        lines.append('- 估值快照（公开接口，口径仅供参照）：' + '；'.join(valuation))
    lines.append('')
    lines.append('## 趋势与技术面')
    lines.append('')
    lines.append('- 趋势：' + str(tech['trend']) + '；SMA20/60/200：' + str(tech['sma20']) + ' / ' + str(tech['sma60']) + ' / ' + str(tech['sma200']))
    lines.append('- RSI14：' + str(tech['rsi14']) + '；ATR14：' + str(tech['atr14']) + '；年化波动：' + str(tech['annualizedVolPct']) + '%')
    lines.append('- 布林带：' + str(tech['bollinger']['lower']) + ' / ' + str(tech['bollinger']['middle']) + ' / ' + str(tech['bollinger']['upper']))
    lines.append('- 20 日支撑/阻力：' + str(tech['support20']) + ' / ' + str(tech['resistance20']) + '；距支撑 ' + str(tech['distanceSupportPct']) + '%，距阻力 ' + str(tech['distanceResistancePct']) + '%')
    lines.append('- 52 周区间：' + str(tech['low52w']) + ' - ' + str(tech['high52w']) + '；当前分位 ' + str(tech['position52wPct']) + '%')
    lines.append('- 最大回撤：' + str(tech['maxDrawdownPct']) + '%')
    if result['warnings']:
        lines.append('')
        lines.append('**数据提示**：' + '；'.join(result['warnings']))
    lines.append('')
    lines.append('> 量价信号必须结合位置、趋势、基本面和消息面解读；单日放量/缩量不是买卖指令。数据来自公开行情接口，可能存在延迟或口径差异。')
    print('\n'.join(lines))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('实时扫描失败：' + str(error), file=sys.stderr)
        sys.exit(2)
`;

export const MARKET_DATA_REFERENCE = `# 行情数据源与口径

## 首选来源

- **腾讯行情公开接口**
  - 实时快照：\`https://qt.gtimg.cn/q=sh600941\`
  - 日线：\`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600941,day,,,250,qfq\`
  - 支持 A 股、港股、美股；美股 K 线需要交易所后缀（如 \`usAAPL.OQ\`）。
- **东方财富公开 K 线接口**（A 股回退）
  - \`push2his.eastmoney.com/api/qt/stock/kline/get\`，含成交额与换手率字段。

## 代码格式

| 市场 | 示例 | 脚本内部 |
| --- | --- | --- |
| A 股 | \`600941\` / \`600941.SH\` | \`sh600941\` |
| 深市 | \`000001\` / \`000001.SZ\` | \`sz000001\` |
| 北交所 | \`430047.BJ\` | \`bj430047\` |
| 港股 | \`00700.HK\` | \`hk00700\` |
| 美股 | \`AAPL\` / \`AAPL.US\` | \`usAAPL\`，K 线用 \`usAAPL.OQ\` |

## 口径与限制

- A 股成交量单位通常为“手”，港股/美股为“股”；比较量比时使用同一标的的相对值，不跨市场直接比较绝对量。
- 复权方式：腾讯 K 线使用前复权；除权日附近需注意价格连续性与成交额口径。
- 实时快照可能是盘中/延迟数据；报告必须写“数据截止时间”和“行情来源”。
- 换手率、PE、PB、市值字段在不同市场可能缺失或口径不同；缺失时写“未获取”，不要猜测。
- 接口可能限流、变更或停牌；脚本失败时明确告知用户，并请用户上传 CSV，禁止编造当日行情。
- 美股盘后/节假日数据可能延迟；A 股节假日使用最后交易日。

## 参考实践

- GitHub 上的 daily_stock_analysis 等项目把多源行情、技术指标、资金流、新闻与结构化决策报告组合起来；本技能采用其“多源取证、量价验证、风险先行”的思路，但不依赖其数据服务，也不复制其投资结论。
- 量价解释参考“位置 + 量能 + 价格方向 + 环境”的框架，避免把单日放量/缩量当买卖信号。

## 合规

公开行情仅用于研究参考，不构成投资建议。不得抓取需要登录、付费或明确禁止自动访问的数据；不得使用内幕信息。
`;

export const VOLUME_PRICE_REFERENCE = `# 量价关系实战手册

## 先定位，再看量价

同一组“放量/缩量”在不同位置含义不同。分析顺序：
1. 趋势位置：低位/中位/高位、均线之上/之下、前高/前低附近；
2. 量能基准：当日量 / 过去 5 日、20 日均量；量比、换手率；
3. 价格方向：当日涨跌、5 日/20 日趋势；
4. 环境共振：大盘、行业、消息面是否同步；
5. 验证：次日/数日是否延续，是否跌破关键位。

## 四种基本组合

| 组合 | 常见含义 | 需要警惕 |
| --- | --- | --- |
| 放量上涨 | 买盘积极，趋势获得资金确认 | 高位放量滞涨、天量后无量 |
| 放量下跌 | 抛压集中释放，分歧扩大 | 高位破位、放量跌破支撑 |
| 缩量上涨 | 抛压轻/惜售，或参与度不足 | 高位缩量创新高、量价顶背离 |
| 缩量下跌 | 自然回落/抛压衰竭 | 下跌趋势中缩量反弹可能是诱多 |

## 关键指标

- **量比（5/20 日）**：口径是“当日成交量 / 前 N 个交易日均量”，不是“N 日均量 / 60 日均量”。>1.2 视为放量，<0.8 视为缩量；极端 >2.5 要判断是否对倒、解禁、指数调仓。
- **5 日量能变化**：近 5 日均量 / 前 5 日均量，用于判断量能趋势，不要和量比混用。
- **量价背离**：价格 5 日上涨但均量下降（价涨量缩）；价格下跌但放量（价跌量放）。
- **OBV**：累积量能方向；OBV 与价格背离是辅助警告，不是单独信号。
- **MFI**：带量的 RSI；>80 超买、<20 超卖，强趋势中会钝化。
- **VWAP20**：近 20 日成交量加权均价；价格在其上方/下方代表持仓成本优势。
- **ATR/振幅**：判断放量是否伴随异常波动；高波动需要更宽止损。
- **换手率**：流通盘差异大时比绝对成交量更可比；突然数倍换手要查原因。

## 位置与情景

### 低位放量下跌
可能是恐慌抛售，也可能是最后一跌；必须等缩量企稳/放量收回关键位确认，不能盲目抄底。

### 高位放量下跌
优先按风险处理：跌破 20 日均线/前低、放量长阴、OBV 走弱同时出现时，说明分歧转一致向下。

### 高位缩量上涨
上涨动能不足或筹码锁定；若价格创新高但量能持续下降，警惕顶背离。

### 低位缩量下跌
抛压可能衰竭，但没有放量承接前不宜确认反转。

### 突破
放量突破关键阻力且收盘站稳，可信度高于无量突破；次日回踩缩量不破位是二次确认。

## 输出要求

报告必须给出：
- 当日/5 日/20 日量比与量能状态；
- 量价组合与位置；
- OBV/MFI/VWAP 的辅助判断；
- 关键支撑/阻力与失效条件；
- 数据日期与来源。

## 禁止

- 不把单日放量/缩量直接等同于买卖信号；
- 不把“放量”一律解释为利好，也不把“缩量”一律解释为利空；
- 不用“主力吸筹/出货”无法验证的叙事替代证据；
- 不承诺胜率或收益。
`;

export const DAILY_SNAPSHOT_TEMPLATE = `# {{名称}}（{{代码}}）行情快照与量价诊断

> 数据截止：{{日期}} ｜ 来源：{{来源}} ｜ 现价：{{价格}} {{币种}} ｜ 涨跌幅：{{涨跌幅}}%

## 一、当日行情

| 项目 | 数值 | 说明 |
| --- | ---: | --- |
| 收盘/现价 | | |
| 涨跌幅 | | |
| 成交量 | | 单位：{{手/股}} |
| 量比（20 日） | | 当日/前20日均量；>1.2 放量，<0.8 缩量 |
| 量比（5 日） | | |
| 换手率 | | 缺失写未获取 |
| 成交额 | | |
| 振幅 | | |
| 日内位置 | | 收盘在当日区间的位置 |

## 二、量价诊断

- **量价组合**：放量上涨 / 放量下跌 / 缩量上涨 / 缩量下跌 / 平量
- **5 日量价**：量价齐升 / 价涨量缩 / 价跌量放 / 量价齐跌
- **位置**：低位 / 中位 / 高位；均线之上/之下；前高/前低附近
- **OBV**：
- **MFI14**：
- **VWAP20**：
- **结论**：一句话说明量价是否确认趋势，以及最大风险。

## 三、技术与关键位

- 趋势/SMA20/60/200：
- RSI14 / MACD / ATR：
- 支撑：
- 阻力：
- 失效条件：

## 四、情景与动作

| 情景 | 触发条件 | 概率 | 应对 |
| --- | --- | ---: | --- |
| 放量突破 | | | |
| 缩量回踩 | | | |
| 放量破位 | | | |

## 五、来源与声明

- 行情来源与抓取时间：
- 财报/公告来源：
- 本报告不构成投资建议。
`;
