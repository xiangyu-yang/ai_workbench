#!/usr/bin/env python3
"""实时行情 + 量价诊断：拉取日线，计算放量/缩量、量价背离、OBV、MFI、VWAP 与技术指标。

示例：
  python3 live_market_scan.py --symbol 标的代码或名称 --days 250 --format markdown
  python3 live_market_scan.py --symbol 美股代码 --days 120 --format json
"""
import argparse
import json
import math
import statistics
import sys

from fetch_market_data import fetch_market, normalize_symbol
from fetch_fundamentals import fetch_f10, fmt_money, fmt_pct, item_of


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
    fundamentals = []
    fundamental_error = ''
    if market['market'] == 'cn':
        try:
            rows = fetch_f10(normalize_symbol(args.symbol), 8)
            fundamentals = [item_of(row) for row in rows]
        except Exception as error:
            fundamental_error = str(error)
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
    valuation = None
    if fundamentals:
        latest_f = fundamentals[0]
        report_name = str(latest_f.get('reportName') or '')
        factor = 1.0
        if '三季' in report_name:
            factor = 4 / 3
        elif '半年' in report_name or '中报' in report_name:
            factor = 2.0
        elif '一季' in report_name:
            factor = 4.0
        eps = latest_f.get('eps')
        annualized_eps = eps * factor if eps else None
        pe = quote.get('pe')
        if pe is None and annualized_eps:
            pe = last['close'] / annualized_eps
        if pe and annualized_eps:
            valuation = {
                'method': 'PE 锚定（非 DCF）',
                'reportPeriod': report_name,
                'annualizedEps': round(annualized_eps, 3),
                'pe': round(pe, 2),
                'earningsYieldPct': round(100 / pe, 2),
                'scenarios': [
                    {'name': '悲观', 'peMultiple': 0.8, 'price': round(annualized_eps * pe * 0.8, 2)},
                    {'name': '基准', 'peMultiple': 1.0, 'price': round(annualized_eps * pe, 2)},
                    {'name': '乐观', 'peMultiple': 1.2, 'price': round(annualized_eps * pe * 1.2, 2)},
                ],
                'note': '机械估值锚点，不含增长/风险溢价假设，不替代 DCF；仅用于交叉检查。',
            }
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
        'fundamentals': fundamentals,
        'valuation': valuation,
        'bars': len(bars),
        'warnings': market.get('warnings', []) + ([('基本面未获取：' + fundamental_error)] if fundamental_error else []),
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
    if result['fundamentals']:
        latest = result['fundamentals'][0]
        lines.append('')
        lines.append('## 基本面快照（A 股，报告期累计）')
        lines.append('')
        lines.append('- 最新报告期：' + latest['reportDate'] + ' ' + latest['reportName'])
        lines.append('- 营收：' + fmt_money(latest['revenue']) + '，同比 ' + fmt_pct(latest['revenueYoY']) + '；归母净利：' + fmt_money(latest['netProfit']) + '，同比 ' + fmt_pct(latest['netProfitYoY']))
        lines.append('- ROE：' + fmt_pct(latest['roe']) + '；毛利率：' + fmt_pct(latest['grossMargin']) + '；净利率：' + fmt_pct(latest['netMargin']) + '；负债率：' + fmt_pct(latest['debtRatio']))
        lines.append('- EPS：' + str(latest['eps']) + '；BPS：' + str(latest['bps']) + '；经营现金流：' + fmt_money(latest['operatingCashFlow']))
    if result.get('valuation'):
        val = result['valuation']
        lines.append('')
        lines.append('## 估值锚点（机械参考，非 DCF）')
        lines.append('')
        lines.append('- 年化 EPS：' + str(val['annualizedEps']) + '；当前 PE：' + str(val['pe']) + '；盈利收益率：' + str(val['earningsYieldPct']) + '%')
        lines.append('- 情景价格：' + '；'.join(item['name'] + ' ' + str(item['price']) + '（PE ' + str(item['peMultiple']) + 'x）' for item in val['scenarios']))
        lines.append('- ' + val['note'])
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
