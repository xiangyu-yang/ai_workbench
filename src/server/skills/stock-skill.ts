import type { SkillDefinition } from './library';
import {
  DAILY_SNAPSHOT_TEMPLATE,
  FETCH_MARKET_SCRIPT,
  LIVE_MARKET_SCAN_SCRIPT,
  MARKET_DATA_REFERENCE,
  VOLUME_PRICE_REFERENCE,
} from './stock-data';

const STOCK_BODY = `# 股票深度分析与预测

## 何时使用

当用户要求分析某只股票、判断未来走势、评估估值、制定买入/卖出区间、比较同业、做持仓风险检查时使用。典型触发：
- “深度分析一下贵州茅台 / 中国移动 / 某只美股”
- “预测一下未来 3-12 个月走势，给目标价和情景”
- “现在贵不贵？DCF 和可比公司怎么看”
- “帮我判断这份持仓的风险和止损位”

如果用户只是问股价、涨跌幅或一条新闻，不要触发完整技能，直接回答并给来源。

## 先确认

在开始研究前，先确认或声明默认值：
1. 标的与市场：A 股 / 港股 / 美股，代码、币种、财年。
2. 决策问题：买入、持有、卖出、观望、仓位调整。
3. 时间维度：短线（1-4 周）、波段（1-3 月）、中期（6-12 月）、长期（3 年+）。
4. 投资者类型：价值、成长、股息、交易；风险承受度。
5. 数据截止日：股价、财报、指引、行业数据的日期。
6. 是否需要技术面/交易执行建议；若不需要，基本面与估值优先。

## 工作流

### 1. 建立研究框架

按 references/research-framework.md 的五层框架：
生意模式 → 行业结构 → 护城河 → 管理层与治理 → 财务质量。
不要一上来堆指标；先回答“这家公司靠什么赚钱、能否持续”。

### 2. 获取真实行情与量价诊断

必须优先获取真实日线，不允许凭记忆写“今日行情”：
- A 股：600941 / 600941.SH；港股：00700.HK；美股：AAPL。
- 调用 run_skill_script：
  - script：scripts/live_market_scan.py
  - args：["--symbol","600941","--days","250","--format","markdown"]
- 脚本会拉取腾讯公开行情，输出：收盘/涨跌幅/成交额、换手率、5 日与 20 日量比（当日成交量/前 N 日均量）、量价组合（放量上涨/放量下跌/缩量上涨/缩量下跌）、5 日量价背离、OBV/MFI/VWAP、均线、RSI、ATR、支撑阻力。
- 如果实时接口失败，先调用 scripts/fetch_market_data.py 检查代码与网络；仍失败则让用户上传 CSV 或稍后重试。**禁止编造当日行情。**
- 报告第一屏必须有“行情快照 + 量价诊断”，并注明数据截止时间与来源。
- 如果用户只提供 CSV，则用 scripts/technical_scan.py 分析，并注明数据由用户提供、可能非最新。

### 3. 取证与数据审计

- 一手来源优先：年报/季报、招股书、交易所公告、业绩会、官方指引、监管文件。
- 二手来源：权威行业报告、同业财报、可信媒体；标注日期与原文位置。
- 每个关键数字必须有来源、口径、币种、时间。
- 至少一个反方来源；不把管理层指引当已实现事实。
- 数据不足时写“未获取”，不要用记忆或估算冒充事实。

### 4. 基本面与财务质量

- 增长：收入/利润/用户/单价拆分，区分量、价、结构。
- 盈利：毛利率、经营利润率、净利率、ROIC/ROE，和同业、历史比。
- 现金流：经营现金流、资本开支、自由现金流、现金转换率。
- 资产负债：净现金/净负债、利息覆盖、到期结构、或有负债。
- 稀释：股本变化、股权激励、可转债。
- 会计质量：应收/存货/合同负债异常、非经常性损益、关联交易。

### 5. 估值：多方法交叉

读取 references/valuation-playbook.md，至少使用两种方法：
- **DCF**：明确 FCF 口径、增长、WACC、永续增长、净债务、股本。
- **反向 DCF**：当前股价隐含了什么增长？这个增长是否可信？
- **相对估值**：PE/PB/EV-EBITDA/PS，和同业、历史分位比；注意周期与会计差异。
- **分部估值（SOTP）**：多业务公司分别估值后加总。
- **股息/回购**：股息率、派息率、回购收益率。

使用 scripts/equity_valuation.py 计算 DCF、反向 DCF、可比 PE 和情景期望值；输入 JSON，资产中有示例。脚本输出的数字仍需你检查假设，不要把模型输出当成事实。

### 6. 技术面与交易时机（可选）

如果用户需要入场/止损/仓位，读取 references/technical-playbook.md，并结合 live_market_scan.py 的输出（或用户 CSV 的 technical_scan.py 结果）。
技术面只用于**执行时机和风险管理**，不能替代基本面 thesis。至少看：
- 趋势：价格与 SMA20/60/200、均线排列；
- 动量：RSI、MACD，避免超买追高；
- 波动：ATR、布林带、年化波动；
- 量价：放量突破/缩量回调；
- 关键位：近期高低点、成交密集区、前高/前低。

### 7. 催化剂与风险

- 催化剂：财报、指引、产品发布、价格调整、政策、并购、回购、指数纳入。
- 风险：需求、竞争、价格战、监管、汇率、利率、地缘、流动性、治理、会计。
- 为每个催化剂/风险标注时间窗、概率、影响方向与可验证信号。

### 8. 概率化预测

不要给单点“必涨/必跌”结论。使用 assets/scenario-sample.json 的结构：
- 悲观 / 基准 / 乐观三种情景；
- 每种情景给概率、目标价/区间、触发条件、关键假设；
- 计算概率加权目标价、期望收益、下行风险；
- 给出置信度（高/中/低）和**失效条件**（什么发生则 thesis 不成立）；
- 明确时间维度；3 个月和 12 个月结论可以不同。

预测是条件概率，不是承诺。必须写“不构成投资建议”。

### 9. 生成报告

按 assets/equity-research-template.md 输出：
摘要（结论/评级/目标区间/置信度）→ 生意与行业 → 护城河 → 财务 → 估值 → 情景预测 → 催化剂 → 风险 → 反方观点 → 数据与来源。
用 workspace_write 写入 Markdown，文件名含标的与日期。

### 10. 质量门槛

- 报告开头有真实行情快照、数据截止日与来源；不得用记忆替代当日行情。
- 量价必须说明：5/20 日量比（当日成交量/前 N 日均量）、量价组合、5 日背离、关键位；不能只写“放量”或“缩量”，也不要把量比解释成“N 日均量/60 日均量”。量比阈值以脚本为准：≥1.2 放量、≤0.8 缩量，不要简单写成“>1 就是放量”。
- 每个关键数字有来源、日期、口径。
- 至少两种估值方法，且说明差异。
- 至少一个反方观点和失效条件。
- 情景概率合计 100%，目标价与假设一致。
- 区分事实、推断、预测。
- 不承诺收益，不使用“稳赚/必涨/内部消息”。
- 不提供内幕信息、操纵市场或规避监管的建议。

## 输出规范

- 开头先给“行情快照 + 量价诊断”，再给结论卡片；写明数据截止日、来源、5/20 日量比与量价组合。
- 结论卡片：评级（买入/增持/中性/减持/回避）、时间维度、目标区间、概率加权收益、置信度。
- 目标价用区间，不用单点；说明对应情景与概率。
- 估值表展示关键假设与敏感性（WACC ±1%、增长 ±2%）。
- 技术面单独成节，明确“仅用于执行”。
- 来源表含标题、机构、日期、链接/文档。
- 结尾固定免责声明。

## 包内资源

- references/research-framework.md：五层研究框架与检查清单
- references/valuation-playbook.md：DCF/反向 DCF/相对估值/情景方法
- references/technical-playbook.md：趋势、动量、波动与关键位
- references/market-data-sources.md：A/H/US 行情代码、公开数据源、字段口径与限制
- references/volume-price-playbook.md：放量/缩量、量价背离、OBV/MFI/VWAP 的实战解释
- references/risk-discipline.md：仓位、回撤、行为偏差与合规
- scripts/equity_valuation.py：DCF、反向 DCF、可比 PE、情景期望值
- scripts/fetch_market_data.py：拉取 A/H/US 日线与实时快照
- scripts/live_market_scan.py：实时行情 + 量价诊断 + 技术面，一条命令产出
- scripts/technical_scan.py：用户 CSV 的均线、RSI、MACD、ATR、布林带、回撤、支撑阻力
- scripts/risk_position.py：仓位、止损、R 倍数、参数 VaR
- assets/equity-research-template.md：完整研究报告模板
- assets/fundamentals-sample.json：估值脚本输入示例（非真实数据）
- assets/scenario-sample.json：三情景预测示例
- assets/price-sample.csv：技术扫描输入示例（合成数据）
- assets/valuation-checklist.md：估值与预测检查清单
- assets/daily-market-snapshot.md：行情快照与量价诊断模板

## 脚本约定

脚本从 SKILL_INPUT 或 --input 读取 JSON/CSV，输出 JSON 或 Markdown。实时分析优先使用 live_market_scan.py；它内部调用 fetch_market_data.py。脚本只做计算与格式化；假设是否合理由你判断。不要把脚本输出直接当投资结论。
`;

const RESEARCH_FRAMEWORK = `# 股票研究五层框架

## 第一层：生意模式

- 公司卖什么？客户是谁？怎么收费？
- 收入是一次性、订阅、交易费还是广告？
- 成本结构：固定/可变、边际成本、规模效应。
- 周期属性：需求是否随经济、政策、价格周期波动？
- 一句话：这家公司如何把投入变成自由现金流？

## 第二层：行业结构

- 市场规模、增速、渗透率、阶段（导入/成长/成熟/衰退）。
- 竞争格局：CR3/CR5、进入壁垒、替代品、上下游议价权。
- 供需：产能、库存、价格趋势。
- 政策：补贴、准入、定价、环保、数据安全。
- 用 Porter 五力或价值链，但不要模板化堆砌。

## 第三层：护城河

| 护城河 | 验证问题 | 反证 |
| --- | --- | --- |
| 品牌 | 能否提价而不流失？ | 促销依赖、口碑下滑 |
| 网络效应 | 用户越多价值越大？ | 多归属、迁移成本低 |
| 切换成本 | 客户迁移要付出什么？ | 标准化、开源替代 |
| 成本优势 | 结构性成本领先？ | 靠补贴/规模暂时领先 |
| 牌照/专利 | 稀缺且可持续？ | 政策变化、专利到期 |
| 数据/渠道 | 独占数据或渠道？ | 数据可替代、渠道反叛 |

护城河要体现在财务上：稳定/上升的 ROIC、毛利率、复购、定价权。

## 第四层：管理层与治理

- 战略是否清晰、执行是否有记录？
- 资本配置：再投资回报、并购、分红、回购、负债。
- 激励：管理层持股、考核指标、关联交易。
- 治理：大股东占用、质押、诉讼、审计意见、董事会独立性。
- 指引可信度：历史达成率。

## 第五层：财务质量

- 收入质量：应收、合同负债、渠道库存、关联收入。
- 利润质量：非经常性损益、政府补助、资本化、折旧假设。
- 现金流：经营现金流/净利润、FCF、现金转换。
- 资产负债表：净债务、短债、利息覆盖、或有负债、表外项目。
- 股本：稀释、回购、股权激励。
- 同业对比与历史趋势至少 3-5 年。

## 市场差异

- A 股：政策与流动性影响大，注意涨跌停、停牌、北向资金、国企考核。
- 港股：流动性折价、南向资金、汇率、老千股与治理风险。
- 美股：指引文化、回购、股权激励、SEC 披露、税务。
- ADR/双重上市：汇率、托管、投票权差异。

## 来源优先级

1. 交易所/监管披露（年报、季报、招股书、8-K/10-K/10-Q、公告）
2. 公司业绩会、官方指引、投资者关系材料
3. 同业财报与行业数据
4. 权威媒体/研究机构
5. 社区/论坛（只作线索）

## 数据截止

报告开头写清：股价截止日、财报截止日、数据来源日。不同市场收盘时间不同，避免混用。
`;

const VALUATION_PLAYBOOK = `# 估值手册

## 原则

- 估值是假设的函数，不是精确真理；给区间和敏感性。
- 至少两种方法交叉；差异大时解释原因。
- 周期股用正常化利润，不用峰值利润。
- 高增长公司关注单位经济模型与再投资回报。
- 金融/地产/公用事业用适配方法（PB/股息/NAV），不要硬套 DCF。

## DCF

### 步骤

1. 选择 FCF 口径：FCFF = EBIT×(1-tax) + D&A - CapEx - ΔNWC；或 FCFE。
2. 预测 5-10 年，收入增长 → 利润率 → 税率 → 再投资 → FCF。
3. WACC：
   - Ke = Rf + β×ERP + 国家/规模/治理溢价；
   - Kd = 利息成本×(1-tax)；
   - 按市值权重。
4. 永续增长 g：长期通胀/名义 GDP 下限，通常 1.5%-3%；不得高于 WACC。
5. EV = Σ FCF_t/(1+WACC)^t + TV/(1+WACC)^n；TV = FCF_n×(1+g)/(WACC-g)。
6. Equity = EV - 净债务 - 少数股东权益 + 联营/投资；除以稀释股本。
7. 敏感性：WACC ±1%、g ±0.5%、增长 ±2%。

### 常见错误

- FCF 与折现率口径不一致（FCFF 用 WACC，FCFE 用 Ke）。
- 忘记净债务、少数股东、期权稀释。
- 永续增长高于 WACC 或长期 GDP。
- 用峰值利润/峰值价格。
- 双重计算投资资产。

## 反向 DCF

当前股价隐含什么增长？
- 固定其他假设，求解使 DCF 价值 = 当前价格的统一增长率；
- 对比历史增速、行业增速、分析师一致预期；
- 如果隐含增长明显高于可实现水平，说明预期过满；反之可能有安全边际。

## 相对估值

- PE：稳定盈利、可比会计；注意周期与一次性项目。
- PB：金融/重资产；结合 ROE。
- EV/EBITDA：跨资本结构比较；注意租赁与资本化。
- PS：高增长/亏损公司；结合毛利率与获客成本。
- 历史分位：当前估值在自身 3-5 年区间的什么位置。
- 同业选择：业务、地区、增长、风险相近；不要只选低估值同行。

## 分部估值（SOTP）

- 多业务分别选可比公司与倍数；
- 加总 EV，减去净债务/总部成本；
- 说明分部数据来源与分配假设；
- 控股折价/流动性折价要论证。

## 情景与概率

- 悲观/基准/乐观，概率合计 100%；
- 每个情景有独立驱动假设与目标价；
- 期望值 = Σ 概率×目标价；同时给下行幅度与概率；
- 概率不是精确科学，用区间/信心等级表达；
- 明确失效条件：什么数据/事件会改变情景。

## 安全边际

- 安全边际 = (内在价值 - 价格) / 内在价值；
- 对高不确定性资产要求更大折扣；
- 不要用安全边际掩盖错误的增长假设。

## 输出检查

- 假设表完整：增长、利润率、税率、WACC、g、净债务、股本。
- 估值区间与当前价、目标区间一致。
- 至少一个反方情景。
- 说明方法局限。
`;

const TECHNICAL_PLAYBOOK = `# 技术面执行手册

## 定位

技术面用于**执行时机与风险控制**，不替代基本面。不要用一根阳线/死叉推翻 thesis。

## 趋势

- 价格在 SMA20/60/200 之上/之下；
- 均线排列：20>60>200 为多头结构，反之为空头；
- 高低点：更高的高点/低点 = 上升趋势；
- 用周线定方向，日线找入场，避免多周期冲突。

## 动量

- RSI(14)：>70 超买、<30 超卖；强趋势中可长期钝化，不单独反转。
- MACD：DIF/DEA 金叉/死叉、柱体变化；结合趋势，不机械交易。
- 量价：突破需要成交量确认；缩量回调比放量下跌健康。

## 波动与风险

- ATR(14)：设置止损距离，通常 1.5-2.5×ATR；
- 年化波动 = 日收益标准差×√252；
- 布林带：挤压后扩张可能伴随趋势；触及上轨不等于卖出。
- 最大回撤：历史极端风险参考，不代表未来。

## 关键位

- 近期 swing high/low（20/60 日）；
- 前高/前低、缺口、成交密集区；
- 整数关口与心理位；
- 突破后回踩确认；假突破用收盘价与成交量验证。

## 入场框架

1. 方向：基本面/趋势一致；
2. 触发：突破回调结束、均线支撑、量价配合；
3. 止损：结构位下方/ATR 外，事先定义；
4. 目标：前高/测量移动/风险回报 ≥2:1；
5. 仓位：按风险预算，不按“感觉”。

## 禁止

- 不承诺胜率；不把历史回测当未来收益。
- 不用“庄家/内幕/必涨”叙事。
- 不在财报/事件前满仓赌方向。
- 不频繁交易、不报复性加仓。
`;

const RISK_DISCIPLINE = `# 风险与合规纪律

## 仓位

- 单笔风险预算：账户权益的 0.5%-2%（按策略与波动调整）。
- 仓位 = 风险预算 / (入场价 - 止损价)，并受最大仓位上限约束。
- 高波动/低流动性标的降低仓位；不要用杠杆放大未验证的 thesis。
- 相关持仓合并计算行业/因子暴露，避免“看似分散、实则同涨同跌”。

## 止损与失效

- 止损是 thesis 失效的价格表达，不是随机百分比。
- 事前写清：什么价格/数据/事件证明判断错了。
- 避免移动止损扩大亏损；不要摊平亏损直到逻辑崩溃。
- 用 ATR/结构位设置，不用“再等等”。

## 回撤

- 最大回撤、恢复时间、波动率是仓位依据。
- 连续亏损后降低风险预算，不用加倍下注回本。
- 情景分析至少包含一次 20%-40% 下行。

## 行为偏差

- 确认偏误：只找支持自己的证据。
- 锚定：盯住成本价而非价值。
- 近因：用最近涨跌外推。
- 过度自信：把好公司等于好股票、好价格。
- 处置效应：截断利润、让亏损奔跑。

## 合规

- 不提供内幕信息、不操纵市场、不承诺收益。
- 不诱导交易、不隐瞒风险、不伪造数据。
- 报告注明“不构成投资建议”，并提示数据截止与利益冲突。
- 涉及具体客户/账户时遵守适当性管理与隐私要求。

## 预测的边界

- 股票价格受宏观、流动性、情绪、突发事件影响，无法精确预测。
- 用概率化情景与区间，不用单点目标价冒充确定性。
- 置信度低时明确说“不足以形成结论”，而不是编一个数字。
`;

const EQUITY_TEMPLATE = `# {{标的}} 深度分析与情景预测

> 代码：{{代码}} ｜ 市场：{{市场}} ｜ 现价：{{价格}} {{币种}} ｜ 数据截止：{{日期}}
> 时间维度：{{3/12 个月}} ｜ 投资者类型：{{类型}} ｜ 分析师：{{姓名}}

## 结论卡片

| 项目 | 结论 |
| --- | --- |
| 评级 | 买入 / 增持 / 中性 / 减持 / 回避 |
| 时间维度 | {{期限}} |
| 基准目标区间 | {{低}} - {{高}} {{币种}} |
| 概率加权收益 | {{%}} |
| 下行风险 | {{%}}（概率 {{%}}） |
| 置信度 | 高 / 中 / 低 |
| 失效条件 | {{价格/数据/事件}} |

## 一、生意与行业

- 公司做什么、怎么赚钱：
- 行业规模/增速/阶段：
- 竞争格局与供需：
- 政策与周期：

## 二、护城河与治理

- 护城河类型与证据：
- 反证/侵蚀风险：
- 管理层资本配置与指引可信度：
- 治理风险：

## 三、财务质量

| 指标 | 2023 | 2024 | 2025E | 同业中位 | 说明 |
| --- | ---: | ---: | ---: | ---: | --- |
| 收入增速 | | | | | |
| 毛利率 | | | | | |
| 经营利润率 | | | | | |
| ROIC | | | | | |
| 经营现金流/净利润 | | | | | |
| 净负债/EBITDA | | | | | |

## 四、估值

### DCF

| 假设 | 值 | 依据 |
| --- | --- | --- |
| FCF 基数 | | |
| 5 年增长 | | |
| WACC | | |
| 永续增长 | | |
| 净债务 | | |
| 稀释股本 | | |
| DCF 每股价值 | | |

### 反向 DCF

- 当前价隐含的统一增长率：
- 对比历史/行业/一致预期：
- 判断：

### 相对估值

| 方法 | 倍数 | 隐含价值 | 说明 |
| --- | ---: | ---: | --- |
| PE | | | |
| EV/EBITDA | | | |
| PB | | | |

## 五、概率化预测

| 情景 | 概率 | 目标价/区间 | 相对现价 | 触发条件 | 关键假设 |
| --- | ---: | --- | ---: | --- | --- |
| 悲观 | | | | | |
| 基准 | | | | | |
| 乐观 | | | | | |
| **期望值** | 100% | | | | |

- 置信度与理由：
- 失效条件：
- 12 个月与 3 个月差异：

## 六、催化剂与风险

| 类型 | 事件 | 时间窗 | 概率 | 影响 |
| --- | --- | --- | ---: | --- |
| 催化 | | | | |
| 风险 | | | | |

## 七、技术面（仅执行参考）

- 趋势/均线：
- RSI/MACD：
- ATR/波动：
- 支撑/阻力：
- 入场/止损/仓位建议（如适用）：

## 八、反方观点

- 最强反方论点：
- 证据：
- 我为什么可能错：

## 九、来源

| # | 标题 | 机构 | 日期 | 链接/文档 |
| --- | --- | --- | --- | --- |
| 1 | | | | |

## 免责声明

本报告为研究与教育用途，不构成投资建议或收益承诺。市场有风险，决策需结合个人情况；数据以公开来源为准，可能存在延迟或误差。
`;

const FUNDAMENTALS_SAMPLE = `{
  "ticker": "DEMO",
  "note": "合成示例数据，仅用于演示估值脚本，不代表任何真实公司",
  "currency": "CNY",
  "price": 100,
  "shares": 1000,
  "netDebt": -5000,
  "fcf": 8000,
  "growth": [0.08, 0.07, 0.06, 0.05, 0.04],
  "wacc": 0.09,
  "terminalGrowth": 0.025,
  "eps": 5.2,
  "peers": [
    { "name": "Peer A", "pe": 14 },
    { "name": "Peer B", "pe": 16 },
    { "name": "Peer C", "pe": 12 }
  ],
  "scenarios": [
    { "name": "bear", "probability": 0.25, "target": 82, "thesis": "需求走弱、价格战" },
    { "name": "base", "probability": 0.5, "target": 108, "thesis": "稳态增长、利润率持平" },
    { "name": "bull", "probability": 0.25, "target": 130, "thesis": "新品放量、毛利率提升" }
  ]
}
`;

const SCENARIO_SAMPLE = `{
  "ticker": "DEMO",
  "horizonMonths": 12,
  "currentPrice": 100,
  "scenarios": [
    { "name": "bear", "probability": 0.25, "targetLow": 75, "targetHigh": 85, "triggers": ["收入连续两季下滑", "价格战"], "assumptions": "毛利率下降 3pct" },
    { "name": "base", "probability": 0.5, "targetLow": 100, "targetHigh": 112, "triggers": ["指引达成", "份额稳定"], "assumptions": "收入增长 8%" },
    { "name": "bull", "probability": 0.25, "targetLow": 125, "targetHigh": 140, "triggers": ["新品超预期", "提价"], "assumptions": "毛利率提升 2pct" }
  ],
  "invalidation": ["核心客户流失", "监管处罚", "管理层大幅减持"],
  "confidence": "medium"
}
`;

const WEIGHTED_CHECKLIST = `# 估值与预测检查清单

## 数据

- [ ] 股价、财报、指引、行业数据都有日期
- [ ] 币种、财年、股本口径一致
- [ ] 净债务/少数股东/投资资产没有遗漏
- [ ] 关键数字有一手来源

## 估值

- [ ] 至少两种方法
- [ ] DCF 的 FCF 与折现率口径匹配
- [ ] WACC > 永续增长
- [ ] 敏感性分析（WACC/增长）
- [ ] 反向 DCF 隐含增长与历史/行业对比
- [ ] 周期股用正常化利润
- [ ] 相对估值同业可比

## 预测

- [ ] 三情景概率合计 100%
- [ ] 每个情景有触发条件与目标区间
- [ ] 给出期望值、下行风险、置信度
- [ ] 明确时间维度
- [ ] 写出失效条件
- [ ] 至少一个反方观点

## 合规

- [ ] 不承诺收益
- [ ] 不提供内幕/操纵建议
- [ ] 有免责声明
- [ ] 区分事实、推断、预测
`;

const EQUITY_VALUATION_SCRIPT = String.raw`#!/usr/bin/env python3
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
    if not args.input:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    with open(args.input, 'r', encoding='utf-8-sig') as handle:
        data = json.load(handle)

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
`;

const TECHNICAL_SCRIPT = String.raw`#!/usr/bin/env python3
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
`;

const RISK_SCRIPT = String.raw`#!/usr/bin/env python3
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
`;

const PRICE_SAMPLE = String.raw`date,open,high,low,close,volume
2026-05-01,100.00,100.66,99.00,100.06,900000
2026-05-04,100.06,100.96,99.06,100.32,999334
2026-05-05,100.32,101.45,99.32,100.77,1094709
2026-05-06,100.77,102.13,99.77,101.41,1182321
2026-05-07,101.41,102.99,100.41,102.23,1258678
2026-05-08,102.23,104.03,101.24,103.23,1320735
2026-05-11,103.23,105.23,102.24,104.39,1366019
2026-05-12,104.39,106.58,103.41,105.69,1392724
2026-05-13,105.69,108.05,104.71,107.12,1399786
2026-05-14,107.12,109.63,106.15,108.66,1386923
2026-05-15,108.66,111.30,107.70,110.29,1354648
2026-05-18,110.29,113.03,109.34,111.98,1304248
2026-05-19,111.98,114.80,111.04,113.71,1237731
2026-05-20,113.71,116.57,112.78,115.45,1157750
2026-05-21,115.45,118.33,114.54,117.18,1067494
2026-05-22,117.18,120.04,116.29,118.86,970560
2026-05-25,118.86,121.67,117.99,120.47,929187
2026-05-26,120.47,123.19,119.62,121.97,1027770
2026-05-27,121.97,124.58,121.15,123.35,1121260
2026-05-28,123.35,125.82,122.56,124.58,1205928
2026-05-29,124.58,126.89,123.82,125.65,1278401
2026-06-01,125.65,127.77,124.87,126.53,1335787
2026-06-02,126.53,128.45,125.71,127.22,1375801
2026-06-03,127.22,128.93,126.36,127.72,1396845
2026-06-04,127.72,129.22,126.81,128.03,1398082
2026-06-05,128.03,129.31,127.09,128.15,1379462
2026-06-08,128.15,129.28,127.11,128.09,1341727
2026-06-09,128.09,129.18,126.85,127.87,1286382
2026-06-10,127.87,128.92,126.46,127.51,1215633
2026-06-11,127.51,128.52,125.96,127.03,1132301
2026-06-12,127.03,128.00,125.35,126.45,1039707
2026-06-15,126.45,127.37,124.69,125.81,941544
2026-06-16,125.81,126.68,123.99,125.13,958274
2026-06-17,125.13,125.95,123.29,124.45,1055770
2026-06-18,124.45,125.22,122.62,123.79,1147056
2026-06-19,123.79,124.55,122.00,123.18,1228493
2026-06-22,123.18,123.98,121.46,122.65,1296833
2026-06-23,122.65,123.49,121.02,122.22,1349354
2026-06-24,122.22,123.10,120.71,121.92,1383959
2026-06-25,121.92,122.84,120.55,121.76,1399271
2026-06-26,121.76,122.73,120.54,121.77,1394679
2026-06-29,121.77,122.95,120.55,121.95,1370365
2026-06-30,121.95,123.36,120.73,122.32,1327299
2026-07-01,122.32,123.97,121.10,122.89,1267198
2026-07-02,122.89,124.78,121.68,123.66,1192458
2026-07-03,123.66,125.79,122.45,124.64,1106059
2026-07-06,124.64,127.01,123.43,125.82,1011444
2026-07-07,125.82,128.42,124.62,127.20,912387
2026-07-08,127.20,130.03,126.00,128.77,987163
2026-07-09,128.77,131.81,127.58,130.52,1083239
2026-07-10,130.52,133.75,129.34,132.43,1172010
2026-07-13,132.43,135.82,131.26,134.48,1249937
2026-07-14,134.48,138.02,133.32,136.65,1313913
2026-07-15,136.65,140.31,135.51,138.92,1361387
2026-07-16,138.92,142.65,137.79,141.25,1390468
2026-07-17,141.25,145.02,140.14,143.61,1399995
2026-07-20,143.61,147.38,142.52,145.96,1389588
2026-07-21,145.96,149.69,144.90,148.27,1359664
2026-07-22,148.27,151.90,147.23,150.49,1311414
2026-07-23,150.49,153.99,149.48,152.59,1246762
2026-07-24,152.59,155.91,151.62,154.53,1168286
2026-07-27,154.53,157.63,153.59,156.27,1079114
2026-07-28,156.27,159.11,155.30,157.78,982802
2026-07-29,157.78,160.32,156.75,159.03,916811
2026-07-30,159.03,161.24,157.94,159.99,1015754
2026-07-31,159.99,161.85,158.85,160.65,1110083
2026-08-03,160.65,162.15,159.46,161.00,1196036
2026-08-04,161.00,162.12,159.76,161.03,1270187
2026-08-05,161.03,162.06,159.47,160.75,1329580
2026-08-06,160.75,161.72,158.85,160.17,1371847
2026-08-07,160.17,161.18,157.96,159.31,1395303
2026-08-10,159.31,160.37,156.82,158.20,1399013
2026-08-11,158.20,159.31,155.47,156.87,1382828
2026-08-12,156.87,158.03,153.93,155.35,1347395
2026-08-13,155.35,156.55,152.24,153.67,1294126
2026-08-14,153.67,154.91,150.44,151.88,1225143
2026-08-17,151.88,153.15,148.58,150.02,1143199
2026-08-18,150.02,151.31,146.69,148.13,1051559
2026-08-19,148.13,149.45,144.80,146.24,953876
2026-08-20,146.24,147.58,142.96,144.39,945953
2026-08-21,144.39,145.74,141.20,142.62,1043951
2026-08-24,142.62,143.98,139.54,140.95,1136210
2026-08-25,140.95,142.32,138.02,139.41,1219053
2026-08-26,139.41,140.78,136.65,138.03,1289176
2026-08-27,138.03,139.40,135.46,136.82,1343783
2026-08-28,136.82,138.18,134.46,135.80,1380698
2026-08-31,135.80,137.16,133.65,134.97,1398450
2026-09-01,134.97,136.32,133.04,134.34,1396329
2026-09-02,134.34,135.68,132.64,133.92,1374422
2026-09-03,133.92,135.24,132.45,133.70,1333601
2026-09-04,133.70,135.01,132.45,133.68,1275493
2026-09-07,133.68,135.14,132.47,133.85,1202416
2026-09-08,133.85,135.47,132.67,134.20,1117282
2026-09-09,134.20,135.96,133.05,134.71,1023486
2026-09-10,134.71,136.59,133.59,135.36,924767
2026-09-11,135.36,137.33,134.27,136.13,974938
2026-09-14,136.13,138.17,135.07,137.00,1071657
2026-09-15,137.00,139.08,135.97,137.94,1161532
2026-09-16,137.94,140.03,136.94,138.92,1240981
2026-09-17,138.92,140.98,137.96,139.91,1306836
2026-09-18,139.91,141.90,138.98,140.87,1356472
2026-09-21,140.87,142.76,139.98,141.77,1387910
2026-09-22,141.77,143.52,140.91,142.58,1399896
2026-09-23,142.58,144.16,141.69,143.27,1391953
2026-09-24,143.27,144.68,142.33,143.80,1364397
2026-09-25,143.80,145.08,142.81,144.15,1318327
2026-09-28,144.15,145.29,143.11,144.30,1255580
2026-09-29,144.30,145.34,143.15,144.23,1178657
2026-09-30,144.23,145.32,142.81,143.93,1090625
2026-10-01,143.93,145.06,142.24,143.39,994993
2026-10-02,143.39,144.56,141.43,142.61,904425
2026-10-05,142.61,143.82,140.38,141.59,1003668
2026-10-06,141.59,142.83,139.12,140.35,1098777
2026-10-07,140.35,141.61,137.65,138.90,1185962
2026-10-08,138.90,140.18,136.00,137.26,1261747
2026-10-09,137.26,138.55,134.20,135.47,1323110
2026-10-12,135.47,136.77,132.28,133.55,1367604
2026-10-13,133.55,134.85,130.26,131.53,1393457
2026-10-14,131.53,132.83,128.19,129.45,1399637
2026-10-15,129.45,130.74,126.09,127.34,1385899
`;

export const STOCK_SKILL: SkillDefinition = {
  name: '股票深度分析与预测',
  description:
    '面向 A 股/港股/美股的个股深度研究：生意模式、护城河、财务质量、DCF/反向 DCF/相对估值、技术面执行、催化剂与概率化情景预测，输出可审计报告而非单点喊单。',
  category: '金融',
  icon: 'trending-up',
  version: '1.0.0',
  license: 'internal',
  allowedTools: [
    'knowledge_search',
    'web_search',
    'read_url',
    'workspace_read',
    'workspace_write',
    'run_skill_script',
  ],
  body: STOCK_BODY,
  bindTo: ['深度研究员', '数据分析师', 'Atlas 首席策略官'],
  files: [
    { path: 'references/research-framework.md', content: RESEARCH_FRAMEWORK },
    { path: 'references/valuation-playbook.md', content: VALUATION_PLAYBOOK },
    { path: 'references/technical-playbook.md', content: TECHNICAL_PLAYBOOK },
    { path: 'references/market-data-sources.md', content: MARKET_DATA_REFERENCE },
    { path: 'references/volume-price-playbook.md', content: VOLUME_PRICE_REFERENCE },
    { path: 'references/risk-discipline.md', content: RISK_DISCIPLINE },
    { path: 'scripts/equity_valuation.py', content: EQUITY_VALUATION_SCRIPT },
    { path: 'scripts/fetch_market_data.py', content: FETCH_MARKET_SCRIPT },
    { path: 'scripts/live_market_scan.py', content: LIVE_MARKET_SCAN_SCRIPT },
    { path: 'scripts/technical_scan.py', content: TECHNICAL_SCRIPT },
    { path: 'scripts/risk_position.py', content: RISK_SCRIPT },
    { path: 'assets/equity-research-template.md', content: EQUITY_TEMPLATE },
    { path: 'assets/fundamentals-sample.json', content: FUNDAMENTALS_SAMPLE },
    { path: 'assets/scenario-sample.json', content: SCENARIO_SAMPLE },
    { path: 'assets/price-sample.csv', content: PRICE_SAMPLE },
    { path: 'assets/valuation-checklist.md', content: WEIGHTED_CHECKLIST },
    { path: 'assets/daily-market-snapshot.md', content: DAILY_SNAPSHOT_TEMPLATE },
  ],
};
