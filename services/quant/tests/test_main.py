from fastapi.testclient import TestClient
from app.main import app


def bars(count=80):
    return [
        {
            "date": f"2026-01-{(index % 28) + 1:02d}",
            "open": 10 + index * 0.1,
            "high": 10.5 + index * 0.1,
            "low": 9.8 + index * 0.1,
            "close": 10.2 + index * 0.1,
            "volume": 100000,
        }
        for index in range(count)
    ]


def test_health():
    assert TestClient(app).get("/health").json()["status"] == "ok"


def test_indicators():
    response = TestClient(app).post("/v1/indicators", json={"bars": bars()})
    assert response.status_code == 200
    assert response.json()["count"] == 80


def test_backtest():
    response = TestClient(app).post(
        "/v1/backtest/sma",
        json={"bars": bars(), "fast": 5, "slow": 20},
    )
    assert response.status_code == 200
    assert "total_return_pct" in response.json()
