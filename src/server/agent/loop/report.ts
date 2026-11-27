export const DEEP_REPORT_PROMPT =
  '你已完成数据获取。现在不要调用工具，直接输出最终的中文深度研究报告，4000-6000 字。必须包含：结论卡片、行情快照与量价诊断（含A/H/US资金流）、生意模式/行业格局、护城河/管理层、财务质量、估值（PE 锚定/反向 DCF/相对估值/敏感性）、下季度与 12 个月情景预测、催化剂/风险表、技术面执行参考、反方观点/数据缺口、来源与免责声明。不要只写“开始撰写”，不要复述工具参数。';

export const DAILY_REPORT_PROMPT =
  '你已完成数据获取。现在不要调用工具，直接输出中文“每日股价趋势”简报，1800-3000 字。必须以“# 标的名称 每日股价趋势”作为一级标题，然后包含：数据状态与阶段、今日结论、A/H/US资金流向（主力/散户/5/10日累计及口径）、枢轴/R1/R2/S1/S2、20日支撑阻力、ATR、高开/平开/低开三种情景及触发/观察/失效、盘中量能/VWAP验证、1-5日观察、催化剂/风险、数据缺口与一次免责声明。不要写长期 DCF、完整三张财务报表或深度估值模板；不要只写“开始撰写”，不要复述工具参数。';

export function reportSynthesisPrompt(daily: boolean): string {
  return daily ? DAILY_REPORT_PROMPT : DEEP_REPORT_PROMPT;
}

export function dailySubjectFromRequest(request: string): string {
  const stock = request.match(
    /([A-Za-z\u4e00-\u9fa5]{1,16})\s*(\d{5,6}(?:\.(?:HK|SH|SZ|BJ))?)/i,
  );
  if (stock) return `${stock[1].trim()} ${stock[2]}`.trim();
  const prefix = request
    .split(/(今天|今日|当天|早盘|开盘|盘中|走势|分析|预测)/)[0]
    .replace(/[，,。？?：:]/g, '')
    .trim();
  if (!prefix || /^(马上|现在|今日|今天|帮我|请|分析|预测)$/.test(prefix)) return '个股';
  return prefix;
}

export function buildStockArtifact(
  finalText: string,
  options: { userRequest: string; daily: boolean; date?: Date },
): { heading: string; name: string; content: string } {
  const normalized = finalText.replace(/(^|[^\n])(#{1,3}\s+)/g, '$1\n\n$2').trim();
  const subject = dailySubjectFromRequest(options.userRequest);
  const firstHeadingIndex = normalized.search(/^#{1,3}[ \t]+/m);
  const reportBody = firstHeadingIndex >= 0 ? normalized.slice(firstHeadingIndex) : normalized;
  const dailyHeading = `${subject || '个股'} 每日股价趋势`;
  const headings = [...normalized.matchAll(/^#{1,3}[ \t]+(.+)$/gm)];
  const reportHeading =
    headings.find((match) => {
      const text = match[1].trim();
      return (
        /(报告|分析|研究|预测|策略|趋势|简报)/.test(text) &&
        !/^(第[一二三四五六七八九十\d]+步|候选)/.test(text)
      );
    }) || headings.find((match) => !/^(第[一二三四五六七八九十]+步|候选)/.test(match[1].trim()));

  const heading = options.daily
    ? dailyHeading
    : reportHeading?.[1]?.trim().replace(/^#+\s*/, '') || '股票分析报告';
  const content = options.daily
    ? `# ${dailyHeading}\n\n${reportBody}`
    : reportHeading?.index
      ? normalized.slice(reportHeading.index).trim()
      : normalized;
  const safeName = heading.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const day = (options.date || new Date()).toISOString().slice(0, 10);
  return { heading, name: `${safeName}_${day}.md`, content };
}

export function emptyReplyText(params: {
  hasReasoning: boolean;
  hasTool: boolean;
  lengthLimited: boolean;
}): string {
  const budget = params.lengthLimited ? '（输出长度受限）' : '';
  if (params.hasReasoning) {
    return `（模型只返回了思考过程${budget}，未生成最终回答。请增大本地模型上下文/输出预算，或关闭深度思考后重试。）`;
  }
  if (params.hasTool) {
    return `（工具已执行，但模型没有生成最终说明${budget}。可以继续追问，或检查上方工具返回结果。）`;
  }
  return `（模型未返回内容${budget}，请重试或检查模型配置。）`;
}
