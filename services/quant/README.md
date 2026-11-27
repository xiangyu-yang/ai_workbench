# Cuter Quant Service

可选 Python 服务，只承接量化/统计计算，不复制 Cuter 的对话、审批、多租户和技能运行时。

## 启动

```bash
cd services/quant
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8100
```

## 接口

```text
GET  /health
POST /v1/indicators
POST /v1/backtest/sma
```

示例：

```bash
curl -s http://localhost:8100/health
```

请求体包含按日期升序的日线 `bars`：

```json
{
  "bars": [
    {"date":"2026-01-02","open":10,"high":10.5,"low":9.8,"close":10.2,"volume":100000}
  ]
}
```

## 边界

- 不保存行情、用户或组织数据；
- 不接受未认证的公网请求，默认只放在内网；
- 回测是简单 SMA 交叉基线，不构成策略收益承诺；
- 需要更复杂因子/组合优化时再扩展，不把主控制面迁到 Python。
