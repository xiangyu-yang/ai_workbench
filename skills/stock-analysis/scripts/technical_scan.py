#!/usr/bin/env python3
"""价格 CSV 技术扫描：均线、RSI、MACD、ATR、布林带、回撤、支撑阻力。"""
import argparse
import csv
import json
import math
import os
import statistics


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--format', choices=['markdown', 'json'], default='json')
    return parser.parse_args()


def sma(values, window):
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def ema_series(values, window):
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
    rs = avg_gain / avg_loss
    return 100 - 100 / (1 + rs)


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


def main():
    args = parse_args()
    if not args.input:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    rows = []
    with open(args.input, 'r', encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            try:
                close = float(str(row.get('close', '')).replace(',', ''))
                high = float(str(row.get('high', close)).replace(',', ''))
                low = float(str(row.get('low', close)).replace(',', ''))
                volume = float(str(row.get('volume', 0)).replace(',', ''))
            except ValueError:
                continue
            rows.append({'date': row.get('date', ''), 'close': close, 'high': high, 'low': low, 'volume': volume})
    if len(rows) < 20:
        raise SystemExit('至少需要 20 行价格数据')

    closes = [row['close'] for row in rows]
    highs = [row['high'] for row in rows]
    lows = [row['low'] for row in rows]
    volumes = [row['volume'] for row in rows]
    returns = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes)) if closes[i - 1] > 0]
    volatility = statistics.pstdev(returns) * math.sqrt(252) if len(returns) > 1 else None

    sma20 = sma(closes, 20)
    sma60 = sma(closes, 60)
    sma200 = sma(closes, 200)
    ema12 = ema_series(closes, 12)
    ema26 = ema_series(closes, 26)
    macd = [a - b for a, b in zip(ema12, ema26)]
    signal = ema_series(macd, 9)
    rsi_value = rsi(closes)
    atr_value = atr(highs, lows, closes)
    recent = closes[-20:]
    std = statistics.pstdev(recent) if len(recent) > 1 else 0
    middle = sum(recent) / len(recent)
    upper = middle + 2 * std
    lower = middle - 2 * std
    volume_ratio = (volumes[-1] / (sum(volumes[-20:]) / 20)) if len(volumes) >= 20 and sum(volumes[-20:]) else None
    trend = 'mixed'
    if sma20 and sma60 and closes[-1] > sma20 > sma60:
        trend = 'bullish'
    if sma20 and sma60 and closes[-1] < sma20 < sma60:
        trend = 'bearish'
    if sma200:
        if closes[-1] > sma200 and trend == 'bullish':
            trend = 'bullish_long'
        elif closes[-1] < sma200 and trend == 'bearish':
            trend = 'bearish_long'

    result = {
        'ticker': '',
        'rows': len(rows),
        'lastDate': rows[-1]['date'],
        'lastClose': closes[-1],
        'change1dPct': round((closes[-1] / closes[-2] - 1) * 100, 2) if len(closes) > 1 else None,
        'sma20': round(sma20, 2) if sma20 else None,
        'sma60': round(sma60, 2) if sma60 else None,
        'sma200': round(sma200, 2) if sma200 else None,
        'trend': trend,
        'rsi14': round(rsi_value, 2) if rsi_value is not None else None,
        'macd': round(macd[-1], 4) if macd else None,
        'macdSignal': round(signal[-1], 4) if signal else None,
        'atr14': round(atr_value, 4) if atr_value else None,
        'bollinger': {'middle': round(middle, 2), 'upper': round(upper, 2), 'lower': round(lower, 2)},
        'annualizedVolPct': round(volatility * 100, 2) if volatility else None,
        'maxDrawdownPct': round(max_drawdown(closes) * 100, 2),
        'high52w': round(max(closes[-252:]), 2),
        'low52w': round(min(closes[-252:]), 2),
        'support20': round(min(lows[-20:]), 2),
        'resistance20': round(max(highs[-20:]), 2),
        'volumeRatio20': round(volume_ratio, 2) if volume_ratio else None,
        'warnings': [],
    }
    if len(closes) < 200:
        result['warnings'].append('样本不足 200 行，SMA200/52 周指标仅供参考')
    if rsi_value is not None and rsi_value > 70:
        result['warnings'].append('RSI 超买区，注意追高风险')
    if rsi_value is not None and rsi_value < 30:
        result['warnings'].append('RSI 超卖区，但弱趋势中可能持续')

    if args.format == 'json':
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    lines = ['# 技术面扫描', '']
    lines.append('- 最新收盘：' + str(result['lastClose']) + '（' + str(result['lastDate']) + '）')
    lines.append('- 趋势：' + trend + '；SMA20/60/200：' + str(result['sma20']) + '/' + str(result['sma60']) + '/' + str(result['sma200']))
    lines.append('- RSI14：' + str(result['rsi14']) + '；MACD：' + str(result['macd']) + ' / 信号 ' + str(result['macdSignal']))
    lines.append('- ATR14：' + str(result['atr14']) + '；年化波动：' + str(result['annualizedVolPct']) + '%')
    lines.append('- 支撑/阻力（20 日）：' + str(result['support20']) + ' / ' + str(result['resistance20']))
    lines.append('- 最大回撤：' + str(result['maxDrawdownPct']) + '%；量比：' + str(result['volumeRatio20']))
    if result['warnings']:
        lines.append('')
        lines.append('**提示**：' + '；'.join(result['warnings']))
    lines.append('')
    lines.append('> 技术面只用于执行时机与风险管理，不构成投资建议。')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
