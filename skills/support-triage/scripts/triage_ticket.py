#!/usr/bin/env python3
"""工单分级：基于影响、安全、核心链路和客户等级给出 P0-P3 与 SLA 建议。"""
import argparse
import json
import os
import re


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--text', default='')
    parser.add_argument('--tier', default='standard', choices=['standard', 'key', 'strategic'])
    parser.add_argument('--channel', default='ticket')
    return parser.parse_args()


P0_WORDS = ['数据泄露', '越权', '被黑', '勒索', '全站', '所有用户', '全部客户', '核心服务不可用', '安全事件', 'payment outage']
P1_WORDS = ['无法登录', '登录失败', '支付失败', '无法支付', '订单丢失', '数据丢失', '生产环境', '全部报错', '无法使用', 'down']
P2_WORDS = ['导出失败', '报错', '加载失败', '显示错误', '部分用户', '单个页面', '同步失败', '慢']
CATEGORY_RULES = [
    ('安全', ['泄露', '越权', '攻击', '安全', '漏洞']),
    ('账单', ['退款', '发票', '账单', '扣费', '价格']),
    ('故障', ['无法', '失败', '报错', '不可用', '超时', '宕机']),
    ('咨询', ['怎么', '如何', '能否', '支持吗', '教程']),
]


def main():
    args = parse_args()
    text = args.text
    if not text and args.input:
        with open(args.input, 'r', encoding='utf-8-sig') as handle:
            text = handle.read()
    if not text:
        raise SystemExit('缺少工单文本：使用 --text、--input 或 SKILL_INPUT')

    lowered = text.lower()
    p0 = [word for word in P0_WORDS if word.lower() in lowered]
    p1 = [word for word in P1_WORDS if word.lower() in lowered]
    p2 = [word for word in P2_WORDS if word.lower() in lowered]
    category = '其他'
    for name, words in CATEGORY_RULES:
        if any(word.lower() in lowered for word in words):
            category = name
            break

    if p0:
        priority = 'P0'
    elif p1 or args.tier in ('key', 'strategic'):
        priority = 'P1'
    elif p2:
        priority = 'P2'
    else:
        priority = 'P3'

    sla = {
        'P0': {'first': '5 分钟', 'update': '30 分钟', 'escalate': '技术负责人/安全/管理层'},
        'P1': {'first': '15 分钟', 'update': '2 小时', 'escalate': '二线/客户成功负责人'},
        'P2': {'first': '1 小时', 'update': '1 个工作日', 'escalate': '二线支持'},
        'P3': {'first': '4 小时', 'update': '2 个工作日', 'escalate': '无'},
    }[priority]

    result = {
        'priority': priority,
        'category': category,
        'sla': sla,
        'signals': {'p0': p0, 'p1': p1, 'p2': p2},
        'customerTier': args.tier,
        'channel': args.channel,
        'nextSteps': [
            '确认影响范围与客户等级',
            '按 SLA 首次响应并给出下一次更新时间',
            'P0/P1 立即升级并建立事件记录',
            '安全事件转安全通道，不在普通工单讨论细节',
        ],
        'replyOutline': [
            '确认问题与影响',
            '说明已采取/正在采取的动作',
            '给出临时绕过或下一步',
            '明确下一次更新时间与联系人',
        ],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
