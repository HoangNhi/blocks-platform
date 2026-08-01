import urllib.request
import json
import ssl
import time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
base_url = "https://localhost:56347"

def request(method, path, body=None, headers=None):
    url = f"{base_url}{path}"
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req, context=ctx) as response:
        return json.loads(response.read().decode())

def get_token():
    resp = request("POST", "/api/system/Auth/login", {"username": "admin", "password": "Abc@123"})
    data = resp.get("Data", resp.get("data", {}))
    return data.get("accessToken", data.get("AccessToken"))

token = get_token()
headers = {"Authorization": f"Bearer {token}"}

# Get strategy baseline
strategy_id = "95fab118-fbd5-4e8c-8fde-e8e7196f524c"

# Create Bot
bot_resp = request("POST", "/api/tradelab/bots", {
    "strategy_id": strategy_id,
    "name": "Baseline Bot",
    "mode": "backtest",
    "status": "draft",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "runtime_config": {
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h"
    }
}, headers)
bot_id = bot_resp["Data"]["id"]

# Run Backtest
run_resp = request("POST", f"/api/tradelab/bots/{bot_id}/backtests", {
    "exchange": "binance",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "start_at": "2024-06-01T00:00:00Z",
    "end_at": "2026-06-01T00:00:00Z",
    "initial_equity": 100,
    "fee_bps": 4, 
    "slippage_bps": 1
}, headers)
run_id = run_resp["Data"]["run"]["id"]

while True:
    time.sleep(1)
    status_resp = request("GET", f"/api/tradelab/bot-runs/{run_id}", headers=headers)
    status = status_resp["Data"].get("pipeline_status")
    if status in ["completed", "failed"]:
        break

analysis_resp = request("GET", f"/api/tradelab/bot-runs/{run_id}/analysis", headers=headers)
metrics = analysis_resp["Data"].get("metrics", {})

pf = metrics.get("profit_factor", 0)
dd = metrics.get("max_drawdown_percent", 100)
mr = metrics.get("monthly_return_percent", 0)
tr = metrics.get("total_return_percent", 0)
tc = metrics.get("total_trades", 0)

print(f"Status: {status}")
print(f"Profit Factor: {pf:.2f}")
print(f"Max Drawdown: {dd:.2f}%")
print(f"Monthly Return: {mr:.2f}%")
print(f"Total Return: {tr:.2f}%")
print(f"Total Trades: {tc}")

# Also print the first 5 error/warning logs if any
logs = analysis_resp["Data"].get("logs", [])
for log in logs[:5]:
    if log.get("log_level") in ["error", "warning"]:
        print(f"{log['log_level'].upper()}: {log['message']}")
