"""Cuter 可选量化服务。

定位：只承接 Python 生态更适合的指标、回测和后续 ML 计算；
不复制对话、审批、多租户与技能运行时。

运行：
  pip install -r requirements.txt
  uvicorn app.main:app --host 0.0.0.0 --port 8100
"""
from __future__ import annotations

import math
import statistics
from datetime import date
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

app = FastAPI(title="Cuter Quant Service", version="0.1.0")


class Bar(BaseModel):
    date: str
    open: float = Field(gt=0)
    high: float = Field(gt=0)
    low: float = Field(gt=0)
    close: float = Field(gt=0)
    volume: float = Field(ge=0)

    @field_validator("date")
    @classmethod
    def valid_date(cls, value: str) -> str:
        date.fromisoformat(value[:10])
        return value[:10]


class IndicatorRequest(BaseModel):
    bars: list[Bar] = Field(min_length=30, max_length=5000)
    risk_free_rate: float = 0.0


class BacktestRequest(BaseModel):
    bars: list[Bar] = Field(min_length=60, max_length=5000)
    fast: int = Field(default=20, ge=2, le=250)
    slow: int = Field(default=60, ge=3, le=500)
    fee_bps: float = Field(default=5.0, ge=0, le=200)
    risk_free_rate: float = 0.0

    @field_validator("slow")
    @classmethod
    def slow_must_exceed_fast(cls, value: int, info):
        fast = info.data.get("fast", 20)
        if value <= fast:
            raise ValueError("slow 必须大于 fast")
        return value


class IndicatorResponse(BaseModel):
    count: int
    last_date: str
    sma20: float | None
    sma60: float | None
    rsi14: float | None
    atr14: float | None
    annualized_volatility_pct: float | None
    max_drawdown_pct: float | None


class BacktestResponse(BaseModel):
    total_return_pct: float
    annualized_return_pct: float | None
    max_drawdown_pct: float
    sharpe: float | None
    trades: int
    exposure_pct: float


def _sma(values: list[float], window: int) -> float | None:
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def _rsi(values: list[float], window: int = 14) -> float | None:
    if len(values) <= window:
        return None
    changes = [values[i] - values[i - 1] for i in range(1, len(values))]
    gains = [max(change, 0.0) for change in changes]
    losses = [max(-change, 0.0) for change in changes]
    avg_gain = sum(gains[:window]) / window
    avg_loss = sum(losses[:window]) / window
    for index in range(window, len(gains)):
        avg_gain = (avg_gain * (window - 1) + gains[index]) / window
        avg_loss = (avg_loss * (window - 1) + losses[index]) / window
    if avg_loss == 0:
        return 100.0
    return 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)


def _atr(bars: list[Bar], window: int = 14) -> float | None:
    if len(bars) <= window:
        return None
    ranges = []
    for index in range(1, len(bars)):
        ranges.append(
            max(
                bars[index].high - bars[index].low,
                abs(bars[index].high - bars[index - 1].close),
                abs(bars[index].low - bars[index - 1].close),
            )
        )
    value = sum(ranges[:window]) / window
    for item in ranges[window:]:
        value = (value * (window - 1) + item) / window
    return value


def _drawdown(values: list[float]) -> float:
    peak = values[0]
    worst = 0.0
    for value in values:
        peak = max(peak, value)
        worst = min(worst, value / peak - 1.0)
    return worst


def _backtest(req: BacktestRequest) -> BacktestResponse:
    closes = [bar.close for bar in req.bars]
    fast = _sma(closes, req.fast)
    slow = _sma(closes, req.slow)
    if fast is None or slow is None:
        raise HTTPException(status_code=422, detail="日线数量不足以计算均线")

    equity = 1.0
    peak = 1.0
    worst = 0.0
    returns: list[float] = []
    position = 0
    trades = 0
    exposed = 0
    fee = req.fee_bps / 10_000.0

    for index in range(req.slow, len(closes)):
        fast_value = sum(closes[index - req.fast + 1:index + 1]) / req.fast
        slow_value = sum(closes[index - req.slow + 1:index + 1]) / req.slow
        desired = 1 if fast_value > slow_value else 0
        if desired != position:
            equity *= 1.0 - fee
            position = desired
            trades += 1
        daily = closes[index] / closes[index - 1] - 1.0
        if position:
            equity *= 1.0 + daily
            exposed += 1
        returns.append(daily if position else 0.0)
        peak = max(peak, equity)
        worst = min(worst, equity / peak - 1.0)

    total_return = equity - 1.0
    periods = len(returns)
    annualized = (equity ** (252 / periods) - 1.0) if periods and equity > 0 else None
    volatility = statistics.pstdev(returns) if len(returns) > 1 else 0.0
    sharpe = (
        (statistics.mean(returns) - req.risk_free_rate / 252) / volatility * math.sqrt(252)
        if volatility > 0
        else None
    )
    return BacktestResponse(
        total_return_pct=round(total_return * 100, 2),
        annualized_return_pct=round(annualized * 100, 2) if annualized is not None else None,
        max_drawdown_pct=round(worst * 100, 2),
        sharpe=round(sharpe, 2) if sharpe is not None else None,
        trades=trades,
        exposure_pct=round(exposed / periods * 100, 2) if periods else 0.0,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "cuter-quant"}


@app.post("/v1/indicators", response_model=IndicatorResponse)
def indicators(req: IndicatorRequest) -> IndicatorResponse:
    closes = [bar.close for bar in req.bars]
    log_returns = [
        math.log(closes[index] / closes[index - 1])
        for index in range(1, len(closes))
        if closes[index - 1] > 0
    ]
    volatility = statistics.pstdev(log_returns) * math.sqrt(252) if len(log_returns) > 1 else None
    return IndicatorResponse(
        count=len(closes),
        last_date=req.bars[-1].date,
        sma20=_sma(closes, 20),
        sma60=_sma(closes, 60),
        rsi14=_rsi(closes),
        atr14=_atr(req.bars),
        annualized_volatility_pct=round(volatility * 100, 2) if volatility is not None else None,
        max_drawdown_pct=round(_drawdown(closes) * 100, 2),
    )


@app.post("/v1/backtest/sma", response_model=BacktestResponse)
def sma_backtest(req: BacktestRequest) -> BacktestResponse:
    return _backtest(req)
