#!/usr/bin/env python3
"""A 股结构化基本面快照（东方财富 F10 公开接口）。

示例：
  python3 fetch_fundamentals.py --symbol 标的代码或名称 --periods 8
  python3 fetch_fundamentals.py --symbol 标的代码或名称 --format markdown
"""
import argparse
import datetime as dt
import json
import sys
import urllib.parse
import urllib.request

from fetch_market_data import fetch_quote, normalize_symbol

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36'


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbol', required=True)
    parser.add_argument('--periods', type=int, default=8)
    parser.add_argument('--format', choices=['json', 'markdown'], default='json')
    return parser.parse_args()


def http_json(url):
    request = urllib.request.Request(
        url,
        headers={'User-Agent': UA, 'Referer': 'https://emweb.securities.eastmoney.com/'},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode('utf-8', errors='ignore'))


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fetch_f10(resolved, periods):
    if resolved['market'] != 'cn':
        raise ValueError('结构化基本面接口当前仅支持 A 股；港股/美股请使用行情快照与公开资料')
    code = resolved['code']
    suffix = resolved['display'].split('.')[-1]
    secucode = code + '.' + suffix
    filt = '(SECUCODE="' + secucode + '")'
    url = (
        'https://datacenter.eastmoney.com/securities/api/data/v1/get?'
        'reportName=RPT_F10_FINANCE_MAINFINADATA&columns=ALL&filter='
        + urllib.parse.quote(filt)
        + '&pageNumber=1&pageSize=' + str(max(4, periods))
        + '&sortTypes=-1&sortColumns=REPORT_DATE'
    )
    data = http_json(url)
    rows = ((data.get('result') or {}).get('data') or [])
    if not rows:
        raise ValueError('F10 接口没有返回财务数据（可能代码错误、接口限流或该公司不适用）')
    return rows


def item_of(row):
    return {
        'reportDate': str(row.get('REPORT_DATE') or '')[:10],
        'reportName': row.get('REPORT_DATE_NAME') or row.get('REPORT_TYPE') or '',
        'currency': row.get('CURRENCY') or 'CNY',
        'revenue': number(row.get('TOTALOPERATEREVE')),
        'revenueYoY': number(row.get('TOTALOPERATEREVETZ')),
        'netProfit': number(row.get('PARENTNETPROFIT')),
        'netProfitYoY': number(row.get('PARENTNETPROFITTZ')),
        'deductedNetProfit': number(row.get('KCFJCXSYJLR')),
        'deductedNetProfitYoY': number(row.get('KCFJCXSYJLRTZ')),
        'roe': number(row.get('ROEJQ')),
        'roic': number(row.get('ROIC')),
        'grossMargin': number(row.get('XSMLL')),
        'netMargin': number(row.get('XSJLL')),
        'debtRatio': number(row.get('ZCFZL')),
        'eps': number(row.get('EPSJB')),
        'bps': number(row.get('BPS')),
        'operatingCashFlow': number(row.get('NETCASH_OPERATE_PK')),
        'totalAssets': number(row.get('TOTAL_ASSETS_PK')),
        'totalEquity': number(row.get('TOTAL_EQUITY_PK')),
        'totalShares': number(row.get('TOTAL_SHARE')),
    }


def fmt_money(value):
    if value is None:
        return '未获取'
    if abs(value) >= 100000000:
        return str(round(value / 100000000, 2)) + ' 亿'
    if abs(value) >= 10000:
        return str(round(value / 10000, 2)) + ' 万'
    return str(round(value, 2))


def fmt_pct(value):
    if value is None:
        return '未获取'
    return str(round(value, 2)) + '%'


def main():
    args = parse_args()
    resolved = normalize_symbol(args.symbol)
    quote = None
    quote_error = ''
    try:
        quote = fetch_quote(resolved)
    except Exception as error:
        quote_error = str(error)
    rows = fetch_f10(resolved, args.periods)
    history = [item_of(row) for row in rows]
    latest = history[0]
    warnings = []
    if quote_error:
        warnings.append('行情快照获取失败：' + quote_error)
    warnings.append('财务数据为报告期累计口径；不同行业与会计政策需结合报表附注。')
    result = {
        'symbol': resolved['display'],
        'name': (quote or {}).get('name') or resolved['display'],
        'market': resolved['market'],
        'source': 'eastmoney-f10',
        'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'latest': latest,
        'history': history,
        'quote': quote,
        'warnings': warnings,
    }
    if args.format == 'json':
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    lines = []
    lines.append('# ' + result['name'] + '（' + result['symbol'] + '）基本面快照')
    lines.append('')
    lines.append('- 最新报告期：' + latest['reportDate'] + ' ' + latest['reportName'] + '；来源：东方财富 F10')
    lines.append('- 营业收入：' + fmt_money(latest['revenue']) + '，同比 ' + fmt_pct(latest['revenueYoY']))
    lines.append('- 归母净利润：' + fmt_money(latest['netProfit']) + '，同比 ' + fmt_pct(latest['netProfitYoY']))
    lines.append('- 扣非净利润：' + fmt_money(latest['deductedNetProfit']) + '，同比 ' + fmt_pct(latest['deductedNetProfitYoY']))
    lines.append('- ROE：' + fmt_pct(latest['roe']) + '；ROIC：' + fmt_pct(latest['roic']) + '；毛利率：' + fmt_pct(latest['grossMargin']) + '；净利率：' + fmt_pct(latest['netMargin']))
    lines.append('- 资产负债率：' + fmt_pct(latest['debtRatio']) + '；EPS：' + str(latest['eps']) + '；BPS：' + str(latest['bps']))
    lines.append('- 经营现金流：' + fmt_money(latest['operatingCashFlow']))
    if quote:
        lines.append('- 行情估值：现价 ' + str(quote.get('price')) + '；PE ' + str(quote.get('pe')) + '；PB ' + str(quote.get('pb')) + '；总市值 ' + fmt_money(quote.get('marketCap')))
    lines.append('')
    lines.append('## 近几期趋势（报告期累计）')
    lines.append('')
    lines.append('| 报告期 | 营收 | 营收同比 | 归母净利 | 净利同比 | ROE | 毛利率 |')
    lines.append('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
    for item in history:
        lines.append('| ' + item['reportDate'] + ' | ' + fmt_money(item['revenue']) + ' | ' + str(item['revenueYoY']) + '% | ' + fmt_money(item['netProfit']) + ' | ' + str(item['netProfitYoY']) + '% | ' + str(item['roe']) + '% | ' + str(item['grossMargin']) + '% |')
    if warnings:
        lines.append('')
        lines.append('**数据提示**：' + '；'.join(warnings))
    lines.append('')
    lines.append('> 财务数据为公开接口的结构化结果，可能与公司公告口径存在差异；不构成投资建议。')
    print('\n'.join(lines))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('基本面获取失败：' + str(error), file=sys.stderr)
        sys.exit(2)
