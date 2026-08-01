import urllib.request
import json
import ssl
from datetime import datetime

# Disable SSL verification for local dev certs
ssl_context = ssl._create_unverified_context()

gateway_url = "http://localhost:43100"

def post_json(path, data):
    url = f"{gateway_url}{path}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, context=ssl_context) as res:
        return json.loads(res.read().decode("utf-8"))

def main():
    symbol = "BTCUSDT"
    timeframe = "15m"
    start_at = "2026-03-01T00:00:00Z"
    end_at = "2026-06-01T00:00:00Z"
    strategy_id = "95fab118-fbd5-4e8c-8fde-e8e7196f524c" # TradeLab Baseline SMA 9/21
    
    print(f"Requesting fill preview for {symbol} {timeframe} ({start_at} to {end_at})...")
    preview_data = {
        "strategy_id": strategy_id,
        "exchange": "binance",
        "symbol": symbol,
        "timeframe": timeframe,
        "requested_start_at": start_at,
        "requested_end_at": end_at,
        "source": "strategy_lab"
    }
    
    preview_res = post_json("/api/tradelab/datasets/fill-preview", preview_data)
    print("Preview response received.")
    
    if not preview_res.get("Success"):
        print("Failed to get preview:", preview_res)
        return
        
    data = preview_res["Data"]
    preview_id = data["previewId"]
    fingerprint = data["requestFingerprint"]
    missing_ranges = data.get("missingRanges", [])
    
    print(f"Preview ID: {preview_id}")
    print(f"Request Fingerprint: {fingerprint}")
    print(f"Missing Ranges count: {len(missing_ranges)}")
    
    if not missing_ranges:
        print("No missing ranges to fill!")
        return

    print("Starting local fill...")
    fill_data = {
        "strategy_id": strategy_id,
        "exchange": "binance",
        "symbol": symbol,
        "timeframe": timeframe,
        "requested_start_at": start_at,
        "requested_end_at": end_at,
        "preview_id": preview_id,
        "request_fingerprint": fingerprint,
        "confirm_local_fill": True,
        "source": "strategy_lab"
    }
    
    fill_res = post_json("/api/tradelab/datasets/fill-local", fill_data)
    print("Fill response received:")
    print(json.dumps(fill_res, indent=2))

if __name__ == "__main__":
    main()
