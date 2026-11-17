#!/usr/bin/env python3
"""每日股价趋势扫描：盘前/盘中/收盘后的关键位、量价、趋势与情景输入。

只负责“今天怎么走”的结构化数据，不做长期 DCF，不生成空模板。
示例：
  python3 daily_trend_scan.py --symbol 02513 --days 250 --format markdown
  python3 daily_trend_scan.py --symbol AAPL.US --format json
"""
import argparse
import datetime as dt
import json
import math
import statistics
import sys

from fetch_fundamentals import fetch_f10, item_of
from fetch_market_data import fetch_market, normalize_symbol


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbol', required=True)
    parser.add_argument('--days', type=int, default=250)
    parser.add_argument('--format', choices=['markdown', 'json'], default='markdown')
    return parser.parse_args()


def mean(values):
    return sum(values) / len(values) if values else None


def pct(current, previous):
    if current is None or previous in (None, 0):
        return None
    return (current / previous - 1) * 100


def sma(values, window):
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def ema(values, window):
    if not values:
        return []
    multiplier = 2 / (window + 1)
    out = [values[0]]
    for value in values[1:]:
        out.append((value - out[-1]) * multiplier + out[-1])
    return out


def rsi(values, window=14):
    if len(values) <= window:
        return None
    changes = [values[i] - values[i - 1] for i in range(1, len(values))]
    gains = [max(change, 0) for change in changes]
    losses = [max(-change, 0) for change in changes]
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
        ranges.append(
            max(
                highs[index] - lows[index],
                abs(highs[index] - closes[index - 1]),
                abs(lows[index] - closes[index - 1]),
            )
        )
    value = mean(ranges[:window])
    for index in range(window, len(ranges)):
        value = (value * (window - 1) + ranges[index]) / window
    return value


def macd(closes):
    if len(closes) < 35:
        return None
    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    dif = [a - b for a, b in zip(ema12, ema26)]
    dea = ema(dif, 9)
    return {
        'dif': round(dif[-1], 3),
        'dea': round(dea[-1], 3),
        'hist': round((dif[-1] - dea[-1]) * 2, 3),
        'state': 'bullish' if dif[-1] > dea[-1] else 'bearish',
    }


def phase_of(market, last_date, partial_bar, quote_time):
    today = dt.date.today().isoformat()
    if last_date < today:
        return 'premarket_or_closed', '最新日线早于今天；盘前或尚未开市，行情快照可能是上一交易日数据'
    if partial_bar:
        return 'intraday', '今日 K 线可能未收盘，盘中成交量与量比需收盘后复核'
    if quote_time:
        return 'intraday_or_closed', '今日已有行情，请以 quoteTime 和最新快照判断是否仍在交易'
    return 'unknown', '无法判断盘前/盘中/收盘状态'


def main():
    args = parse_args()
    market_data = fetch_market(args.symbol, args.days)
    bars = market_data['bars']
    quote = market_data.get('quote') or {}
    if len(bars) < 20:
        raise ValueError('至少需要 20 根日线')

    closes = [bar['close'] for bar in bars]
    highs = [bar['high'] for bar in bars]
    lows = [bar['low'] for bar in bars]
    volumes = [bar['volume'] for bar in bars]
    avg20 = mean(volumes[-21:-1])
    partial_bar = (
        str(bars[-1].get('date') or '')[:10] == dt.date.today().isoformat()
        and avg20 is not None
        and volumes[-1] < avg20 * 0.5
    )
    reference_bar = bars[-2] if partial_bar and len(bars) > 1 else bars[-1]
    current_price = quote.get('price') or bars[-1]['close']
    previous_close = quote.get('prevClose') or reference_bar['close']
    # 盘前没有“今日开盘缺口”这个事实：上一交易日收盘价之间的差不是今日缺口。
    # 只有已经进入今天交易时段，才计算相对昨收的缺口。
    premarket = str(bars[-1].get('date') or '')[:10] < dt.date.today().isoformat()
    gap_pct = None if premarket else pct(current_price, previous_close)
    volume_ratio20 = volumes[-1] / avg20 if avg20 else None
    volume_state = (
        '盘中待确认'
        if partial_bar
        else ('放量' if volume_ratio20 and volume_ratio20 >= 1.2 else ('缩量' if volume_ratio20 and volume_ratio20 <= 0.8 else '平量'))
    )

    sma20 = sma(closes, 20)
    sma60 = sma(closes, 60)
    sma200 = sma(closes, 200)
    rsi14 = rsi(closes)
    atr14 = atr(highs, lows, closes)
    macd_value = macd(closes)
    typical = [(highs[i] + lows[i] + closes[i]) / 3 for i in range(len(closes))]
    vwap20 = (
        sum(typical[i] * volumes[i] for i in range(len(closes) - 20, len(closes))) / sum(volumes[-20:])
        if sum(volumes[-20:]) else None
    )

    if sma20 and sma60 and current_price > sma20 > sma60:
        trend = 'bullish'
    elif sma20 and sma60 and current_price < sma20 < sma60:
        trend = 'bearish'
    else:
        trend = 'range'

    pivot = (reference_bar['high'] + reference_bar['low'] + reference_bar['close']) / 3
    pivot_range = reference_bar['high'] - reference_bar['low']
    levels = {
        'referenceDate': reference_bar['date'],
        'referenceClose': round(reference_bar['close'], 3),
        'previousClose': round(previous_close, 3),
        'pivot': round(pivot, 3),
        'r1': round(2 * pivot - reference_bar['low'], 3),
        'r2': round(pivot + pivot_range, 3),
        's1': round(2 * pivot - reference_bar['high'], 3),
        's2': round(pivot - pivot_range, 3),
        'support20': round(min(lows[-21:-1] if partial_bar else lows[-20:]), 3),
        'resistance20': round(max(highs[-21:-1] if partial_bar else highs[-20:]), 3),
        'atr14': round(atr14, 3) if atr14 else None,
        'atrLower': round(current_price - atr14, 3) if atr14 else None,
        'atrUpper': round(current_price + atr14, 3) if atr14 else None,
    }

    reasons = []
    if trend == 'bullish':
        reasons.append('价格位于 SMA20 上方且 SMA20 > SMA60')
    elif trend == 'bearish':
        reasons.append('价格位于 SMA20 下方且 SMA20 < SMA60')
    else:
        reasons.append('均线未形成明确多头/空头排列')
    if rsi14 is not None:
        reasons.append('RSI14=' + str(round(rsi14, 2)))
    if volume_ratio20 is not None:
        reasons.append('20 日量比=' + str(round(volume_ratio20, 2)))
    if vwap20:
        reasons.append('价格相对 VWAP20=' + str(round(pct(current_price, vwap20) or 0, 2)) + '%')

    bearish = trend == 'bearish'
    bullish = trend == 'bullish'
    direction = '偏多' if bullish else ('偏空' if bearish else '震荡')
    confidence = '中' if trend in ('bullish', 'bearish') else '低'

    opening = '待开盘'
    if gap_pct is not None and gap_pct >= 1:
        opening = '高开'
    elif gap_pct is not None and gap_pct <= -1:
        opening = '低开'
    elif gap_pct is not None:
        opening = '平开'

    scenarios = [
        {
            'name': '高开/上攻',
            'trigger': '站上 R1 ' + str(levels['r1']) + ' 且量能不低于 20 日均量',
            'observe': '回踩 R1 不破、VWAP20 ' + (str(round(vwap20, 3)) if vwap20 else '未获取'),
            'invalidation': '跌回枢轴 ' + str(levels['pivot']) + ' 下方',
            'probability': '中' if direction != '偏空' else '低',
        },
        {
            'name': '平开/区间',
            'trigger': '在 ' + str(levels['s1']) + ' - ' + str(levels['r1']) + ' 之间震荡',
            'observe': '量能萎缩、VWAP20 附近反复',
            'invalidation': '放量突破 R1 或跌破 S1',
            'probability': '中',
        },
        {
            'name': '低开/破位',
            'trigger': '跌破 S1 ' + str(levels['s1']) + ' 且量能放大',
            'observe': '反抽 S1 失败、跌破 ' + str(levels['support20']),
            'invalidation': '重新站回枢轴 ' + str(levels['pivot']) + ' 上方',
            'probability': '中' if direction != '偏多' else '低',
        },
    ]

    fundamentals = []
    fundamental_error = ''
    if market_data['market'] == 'cn':
        try:
            rows = fetch_f10(normalize_symbol(args.symbol), 4)
            fundamentals = [item_of(row) for row in rows]
        except Exception as error:
            fundamental_error = str(error)

    warnings = list(market_data.get('warnings', []))
    phase, phase_note = phase_of(
        market_data['market'],
        str(bars[-1].get('date') or '')[:10],
        partial_bar,
        str(quote.get('quoteTime') or ''),
    )
    warnings.append(phase_note)
    if premarket:
        warnings.append('尚未开盘：当前只有上一交易日收盘/盘前参考数据，今日缺口要等开盘后确认')
    if partial_bar:
        warnings.append('盘中未完成 K 线：量比与全天成交额不能作为收盘结论')
    if gap_pct is not None and abs(gap_pct) >= 2:
        warnings.append('跳空幅度较大，注意开盘后回补/延续的分歧')

    result = {
        'symbol': market_data['symbol'],
        'name': quote.get('name') or market_data['symbol'],
        'market': market_data['market'],
        'currency': market_data['currency'],
        'source': market_data['source'],
        'fetchedAt': market_data['fetchedAt'],
        'quoteTime': quote.get('quoteTime') or '',
        'lastDate': bars[-1]['date'],
        'phase': phase,
        'partialBar': partial_bar,
        'currentPrice': round(current_price, 3),
        'previousClose': round(previous_close, 3),
        'changePct': round(quote.get('changePct'), 2) if quote.get('changePct') is not None else round(pct(current_price, previous_close) or 0, 2),
        'gapPct': round(gap_pct, 2) if gap_pct is not None else None,
        'openingType': opening,
        'volumeRatio20': round(volume_ratio20, 2) if volume_ratio20 is not None else None,
        'volumeState': volume_state,
        'technical': {
            'sma20': round(sma20, 3) if sma20 else None,
            'sma60': round(sma60, 3) if sma60 else None,
            'sma200': round(sma200, 3) if sma200 else None,
            'rsi14': round(rsi14, 2) if rsi14 is not None else None,
            'macd': macd_value,
            'atr14': round(atr14, 3) if atr14 else None,
            'vwap20': round(vwap20, 3) if vwap20 else None,
            'trend': trend,
        },
        'levels': levels,
        'bias': {'direction': direction, 'confidence': confidence, 'reasons': reasons},
        'scenarios': scenarios,
        'fundamentals': fundamentals,
        'fundamentalError': fundamental_error,
        'warnings': warnings,
    }

    if args.format == 'json':
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    lines = [
        '# ' + result['name'] + '（' + result['symbol'] + '）每日股价趋势',
        '',
        '- 数据时间：' + (result['quoteTime'] or '未获取') + '；最新日线：' + result['lastDate'] + '；来源：' + result['source'],
        '- 当前/盘前参考价：' + str(result['currentPrice']) + ' ' + result['currency'] + '；昨收/参考收盘：' + str(result['previousClose']) + '；阶段：' + result['phase'],
        '- ' + ('上一交易日涨跌幅：' if premarket else '涨跌幅：') + str(result['changePct']) + '%；缺口：' + (str(result['gapPct']) + '%' if result['gapPct'] is not None else '未开盘/未获取') + '；开盘类型：' + result['openingType'],
        '- 20 日量比：' + (str(result['volumeRatio20']) if result['volumeRatio20'] is not None else '未获取') + '；量能：' + result['volumeState'],
        '',
        '## 今日关键位',
        '',
        '| 枢轴 | R1 | R2 | S1 | S2 | 20 日支撑 | 20 日阻力 | ATR14 |',
        '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        '| ' + str(result['levels']['pivot']) + ' | ' + str(result['levels']['r1']) + ' | ' + str(result['levels']['r2']) + ' | ' + str(result['levels']['s1']) + ' | ' + str(result['levels']['s2']) + ' | ' + str(result['levels']['support20']) + ' | ' + str(result['levels']['resistance20']) + ' | ' + str(result['levels']['atr14']) + ' |',
        '',
        '## 趋势与判断',
        '',
        '- 趋势：' + result['technical']['trend'] + '；SMA20/60/200：' + str(result['technical']['sma20']) + ' / ' + str(result['technical']['sma60']) + ' / ' + str(result['technical']['sma200']),
        '- RSI14：' + str(result['technical']['rsi14']) + '；MACD：' + (json.dumps(result['technical']['macd'], ensure_ascii=False) if result['technical']['macd'] else '未获取'),
        '- VWAP20：' + (str(result['technical']['vwap20']) if result['technical']['vwap20'] else '未获取'),
        '- 判断：' + result['bias']['direction'] + '（置信度 ' + result['bias']['confidence'] + '）；' + '；'.join(result['bias']['reasons']),
        '',
        '## 开盘情景（条件式，不是概率承诺）',
        '',
        '| 情景 | 触发 | 观察 | 失效 | 主观概率 |',
        '| --- | --- | --- | --- | --- |',
    ]
    for scenario in scenarios:
        lines.append(
            '| ' + scenario['name'] + ' | ' + scenario['trigger'] + ' | ' + scenario['observe'] + ' | ' + scenario['invalidation'] + ' | ' + scenario['probability'] + ' |'
        )
    lines.append('')
    lines.append('## 基本面与数据缺口')
    if fundamentals:
        latest = fundamentals[0]
        lines.append('- 最新报告期：' + str(latest.get('reportDate')) + ' ' + str(latest.get('reportName')))
        lines.append('- 营收：' + str(latest.get('revenue')) + '；归母净利：' + str(latest.get('netProfit')) + '；ROE：' + str(latest.get('roe')) + '；毛利率：' + str(latest.get('grossMargin')))
        lines.append('- 财务为报告期累计口径；今天的方向判断仍需盘中量价确认，不用财务表替代交易信号。')
    elif fundamental_error:
        lines.append('- A 股基本面未获取：' + fundamental_error)
    else:
        lines.append('- 港股/美股无结构化财务数据；不编造营收、净利、ROE 或现金流。')
    if result['warnings']:
        lines.append('')
        lines.append('**数据提示**：' + '；'.join(result['warnings']))
    lines.append('')
    lines.append('> 本工具只提供当日趋势与关键位参考，不构成投资建议；盘前/盘中数据可能延迟，开盘后必须刷新。')
    print('\n'.join(lines))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('每日趋势扫描失败：' + str(error), file=sys.stderr)
        sys.exit(2)
