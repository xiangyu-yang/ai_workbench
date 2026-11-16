#!/usr/bin/env python3
"""DCF、反向 DCF、可比 PE 与概率情景估值。输入 JSON，输出 Markdown/JSON。"""
import argparse
import json
import math
import os
import statistics


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--format', choices=['markdown', 'json'], default='markdown')
    parser.add_argument('--years', type=int, default=5)
    return parser.parse_args()


def require(data, key):
    value = data.get(key)
    if value is None or value == '':
        raise SystemExit('缺少字段：' + key)
    return value


def dcf_value(fcf, growth, wacc, terminal_growth, shares, net_debt, years):
    if wacc <= terminal_growth:
        raise SystemExit('WACC 必须大于永续增长率')
    if shares <= 0:
        raise SystemExit('股本必须大于 0')
    flows = []
    current = float(fcf)
    pv = 0.0
    for index in range(years):
        rate = growth[index] if index < len(growth) else growth[-1]
        current *= 1 + rate
        discount = (1 + wacc) ** (index + 1)
        pv += current / discount
        flows.append(current)
    terminal = current * (1 + terminal_growth) / (wacc - terminal_growth)
    pv_terminal = terminal / ((1 + wacc) ** years)
    enterprise = pv + pv_terminal
    equity = enterprise - float(net_debt)
    per_share = equity / float(shares)
    return {
        'flows': flows,
        'pvExplicit': pv,
        'pvTerminal': pv_terminal,
        'enterpriseValue': enterprise,
        'equityValue': equity,
        'perShare': per_share,
    }


def uniform_growth_value(fcf, growth, wacc, terminal_growth, shares, net_debt, years):
    return dcf_value(fcf, [growth] * years, wacc, terminal_growth, shares, net_debt, years)['perShare']


def reverse_dcf(price, fcf, wacc, terminal_growth, shares, net_debt, years):
    low, high = -0.5, 0.5
    for _ in range(100):
        mid = (low + high) / 2
        value = uniform_growth_value(fcf, mid, wacc, terminal_growth, shares, net_debt, years)
        if value < price:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def main():
    args = parse_args()
    input_path = os.environ.get('SKILL_INPUT') or args.input
    if not input_path:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    with open(input_path, 'r', encoding='utf-8-sig') as handle:
        data = json.load(handle)
    note = str(data.get('note') or '')
    if str(data.get('ticker') or '').upper() == 'DEMO' or '合成示例' in note:
        raise SystemExit('检测到 DEMO/合成示例数据，不能用于真实标的估值；请提供真实假设或使用 live_market_scan')

    price = float(require(data, 'price'))
    shares = float(require(data, 'shares'))
    net_debt = float(data.get('netDebt', 0))
    fcf = float(require(data, 'fcf'))
    wacc = float(require(data, 'wacc'))
    terminal_growth = float(data.get('terminalGrowth', 0.025))
    growth = data.get('growth') or [0.05] * args.years
    growth = [float(item) for item in growth][:args.years]
    if not growth:
        raise SystemExit('growth 不能为空')

    dcf = dcf_value(fcf, growth, wacc, terminal_growth, shares, net_debt, args.years)
    implied = reverse_dcf(price, fcf, wacc, terminal_growth, shares, net_debt, args.years)
    peers = [float(item.get('pe')) for item in data.get('peers', []) if item.get('pe')]
    eps = float(data['eps']) if data.get('eps') is not None else None
    peer_pe = statistics.median(peers) if peers else None
    relative = peer_pe * eps if peer_pe and eps else None

    scenarios = data.get('scenarios', [])
    probability = sum(float(item.get('probability', 0)) for item in scenarios)
    expected = None
    expected_return = None
    if scenarios:
        if abs(probability - 1) > 0.02:
            raise SystemExit('情景概率合计必须约为 1，当前为 ' + str(round(probability, 4)))
        expected = sum(float(item.get('probability', 0)) * float(item.get('target', price)) for item in scenarios)
        expected_return = (expected / price - 1) * 100

    result = {
        'ticker': data.get('ticker', ''),
        'currency': data.get('currency', ''),
        'price': price,
        'dcf': dcf,
        'dcfUpsidePct': round((dcf['perShare'] / price - 1) * 100, 2),
        'marginOfSafetyPct': round((dcf['perShare'] - price) / dcf['perShare'] * 100, 2) if dcf['perShare'] else None,
        'reverseDcfUniformGrowthPct': round(implied * 100, 2),
        'peerMedianPe': peer_pe,
        'relativePeValue': round(relative, 2) if relative is not None else None,
        'scenarioProbability': round(probability, 4),
        'expectedTarget': round(expected, 2) if expected is not None else None,
        'expectedReturnPct': round(expected_return, 2) if expected_return is not None else None,
        'scenarios': scenarios,
    }

    if args.format == 'json':
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    lines = []
    lines.append('# ' + result['ticker'] + ' 估值摘要')
    lines.append('')
    lines.append('- 现价：' + str(price) + ' ' + result['currency'])
    lines.append('- DCF 每股价值：' + str(round(dcf['perShare'], 2)) + '（相对现价 ' + str(result['dcfUpsidePct']) + '%）')
    lines.append('- 安全边际：' + str(result['marginOfSafetyPct']) + '%')
    lines.append('- 反向 DCF 隐含统一增长率：' + str(result['reverseDcfUniformGrowthPct']) + '%')
    if peer_pe:
        lines.append('- 同业中位 PE：' + str(round(peer_pe, 2)) + '；PE 法价值：' + str(result['relativePeValue']))
    lines.append('')
    lines.append('## DCF 假设')
    lines.append('')
    lines.append('| 项目 | 值 |')
    lines.append('| --- | ---: |')
    lines.append('| FCF 基数 | ' + str(fcf) + ' |')
    lines.append('| 预测增长 | ' + ', '.join(str(round(item * 100, 1)) + '%' for item in growth) + ' |')
    lines.append('| WACC | ' + str(round(wacc * 100, 2)) + '% |')
    lines.append('| 永续增长 | ' + str(round(terminal_growth * 100, 2)) + '% |')
    lines.append('| 净债务 | ' + str(net_debt) + ' |')
    lines.append('| 股本 | ' + str(shares) + ' |')
    lines.append('')
    lines.append('## 情景预测')
    lines.append('')
    lines.append('| 情景 | 概率 | 目标价 | 相对现价 | 说明 |')
    lines.append('| --- | ---: | ---: | ---: | --- |')
    for item in scenarios:
        target = float(item.get('target', price))
        lines.append('| ' + str(item.get('name', '')) + ' | ' + str(round(float(item.get('probability', 0)) * 100, 1)) + '% | ' + str(target) + ' | ' + str(round((target / price - 1) * 100, 2)) + '% | ' + str(item.get('thesis', '')) + ' |')
    if expected is not None:
        lines.append('| **期望值** | 100% | **' + str(round(expected, 2)) + '** | **' + str(round(expected_return, 2)) + '%** | 概率加权 |')
    lines.append('')
    lines.append('> 以上为假设驱动的估值结果，不构成投资建议。DCF 对 WACC、增长与永续假设高度敏感。')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
