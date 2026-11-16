#!/usr/bin/env python3
"""仓位与风险预算：按止损距离计算仓位、R 倍数与参数 VaR。"""
import argparse
import json
import math
import os


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--format', choices=['markdown', 'json'], default='json')
    return parser.parse_args()


def main():
    args = parse_args()
    if not args.input:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    with open(args.input, 'r', encoding='utf-8-sig') as handle:
        data = json.load(handle)
    equity = float(data.get('accountEquity', 0))
    entry = float(data.get('entry', 0))
    stop = float(data.get('stop', 0))
    target = float(data.get('target', 0))
    risk_pct = float(data.get('riskPct', 1.0)) / 100
    max_position_pct = float(data.get('maxPositionPct', 20)) / 100
    annual_vol = float(data.get('annualVolPct', 0)) / 100
    horizon_days = int(data.get('horizonDays', 20))
    if equity <= 0 or entry <= 0:
        raise SystemExit('accountEquity 与 entry 必须大于 0')
    if stop >= entry:
        raise SystemExit('stop 必须低于 entry')
    if target <= entry:
        raise SystemExit('target 必须高于 entry')

    per_share_risk = entry - stop
    risk_capital = equity * risk_pct
    shares_by_risk = math.floor(risk_capital / per_share_risk)
    shares_by_cap = math.floor((equity * max_position_pct) / entry)
    shares = max(0, min(shares_by_risk, shares_by_cap))
    position = shares * entry
    max_loss = shares * per_share_risk
    r_multiple = (target - entry) / per_share_risk
    var95 = position * annual_vol * math.sqrt(horizon_days / 252) * 1.645 if annual_vol else None

    result = {
        'shares': shares,
        'positionValue': round(position, 2),
        'positionPctOfEquity': round(position / equity * 100, 2),
        'riskCapital': round(risk_capital, 2),
        'maxLoss': round(max_loss, 2),
        'maxLossPctOfEquity': round(max_loss / equity * 100, 2),
        'rMultiple': round(r_multiple, 2),
        'breakEvenWinRatePct': round(100 / (1 + r_multiple), 2) if r_multiple > 0 else None,
        'var95Parametric': round(var95, 2) if var95 is not None else None,
        'notes': [
            '仓位取风险预算与最大仓位上限的较小值',
            'VaR 为参数法估算，假设收益近似正态，实际尾部风险可能更大',
            '止损必须与 thesis 失效条件一致，不构成投资建议',
        ],
    }
    if args.format == 'json':
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    lines = ['# 仓位与风险预算', '']
    lines.append('- 股数：' + str(shares) + '；市值：' + str(result['positionValue']) + '（' + str(result['positionPctOfEquity']) + '% 账户）')
    lines.append('- 最大亏损：' + str(result['maxLoss']) + '（' + str(result['maxLossPctOfEquity']) + '% 账户）')
    lines.append('- R 倍数：' + str(result['rMultiple']) + '；盈亏平衡胜率：' + str(result['breakEvenWinRatePct']) + '%')
    lines.append('- 参数 VaR 95%（' + str(horizon_days) + ' 日）：' + str(result['var95Parametric']))
    lines.append('')
    lines.append('> 以上为风险预算计算，不构成投资建议。')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
