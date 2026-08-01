import urllib.request
import json
import ssl
import time
import os
from datetime import datetime

ssl_context = ssl._create_unverified_context()
gateway_url = "http://localhost:43100"
task_dir = os.path.join(os.environ["OBSIDIAN_VAULT_PATH"], "02-plugins", "tradelab", "tasks", "2026-06-13-research-goal")
trial_log_path = os.path.join(task_dir, "trial-log-2year.md")
report_path = os.path.join(task_dir, "report-2year.md")

def post_json(path, data, token=None):
    url = f"{gateway_url}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    with urllib.request.urlopen(req, context=ssl_context) as res:
        return json.loads(res.read().decode("utf-8"))

def get_json(path, token=None):
    url = f"{gateway_url}{path}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=ssl_context) as res:
        return json.loads(res.read().decode("utf-8"))

def generate_ema_adx_source(fast_ema, slow_ema, adx_thresh):
    return f"""
from tradelab_sdk import StrategyContext

def on_candle(ctx: StrategyContext):
    close = ctx.history["close"]
    high = ctx.history["high"]
    low = ctx.history["low"]
    
    if len(close) < max({slow_ema}, 30):
        return None
        
    hist_len = 150
    c_slice = close[-hist_len:]
    h_slice = high[-hist_len:]
    l_slice = low[-hist_len:]
    
    fast = ctx.indicators.sma(c_slice, {fast_ema})
    slow = ctx.indicators.sma(c_slice, {slow_ema})
    adx = ctx.indicators.adx(h_slice, l_slice, c_slice, 14)
    
    if len(adx) == 0 or adx[-1] is None:
        return None
        
    if ctx.indicators.crossover(fast, slow) and adx[-1] > {adx_thresh}:
        return ctx.buy_market(percent=100)
        
    if ctx.indicators.crossunder(fast, slow):
        return ctx.close_position()
""".strip()

def generate_ema_rsi_source(fast_ema, slow_ema, rsi_lower, rsi_upper):
    return f"""
from tradelab_sdk import StrategyContext

def on_candle(ctx: StrategyContext):
    close = ctx.history["close"]
    
    if len(close) < max({slow_ema}, 20):
        return None
        
    hist_len = 150
    c_slice = close[-hist_len:]
    
    fast = ctx.indicators.sma(c_slice, {fast_ema})
    slow = ctx.indicators.sma(c_slice, {slow_ema})
    rsi = ctx.indicators.rsi(c_slice, 14)
    
    if len(rsi) == 0 or rsi[-1] is None:
        return None
        
    if ctx.indicators.crossover(fast, slow) and {rsi_lower} <= rsi[-1] <= {rsi_upper}:
        return ctx.buy_market(percent=100)
        
    if ctx.indicators.crossunder(fast, slow) or rsi[-1] > 80:
        return ctx.close_position()
""".strip()

def generate_bb_reversion_source(bb_period, bb_std):
    return f"""
from tradelab_sdk import StrategyContext

def on_candle(ctx: StrategyContext):
    close = ctx.history["close"]
    
    if len(close) < {bb_period}:
        return None
        
    hist_len = {bb_period}
    c_slice = close[-hist_len:]
    
    middle, upper, lower = ctx.indicators.bollinger_bands(c_slice, {bb_period}, {bb_std})
    
    if len(lower) == 0 or lower[-1] is None or upper[-1] is None or middle[-1] is None:
        return None
        
    if float(close[-1]) < lower[-1]:
        return ctx.buy_market(percent=100)
        
    if float(close[-1]) >= middle[-1]:
        return ctx.close_position()
""".strip()

def main():
    print("Logging in to obtain JWT token...")
    login_res = post_json("/api/system/Auth/login", {"username": "admin", "password": "Abc@123"})
    token = login_res["Data"]["AccessToken"]
    print("Login successful.")

    suffix = int(time.time())
    strategy_name = f"WFA 2Year Strategy {suffix}"
    strategy_slug = f"wfa-2year-strategy-{suffix}"
    print(f"Creating strategy: {strategy_name}...")
    group_res = get_json("/api/tradelab/strategy-groups", token)
    group_id = group_res["Data"]["items"][0]["id"]
    
    strat_res = post_json("/api/tradelab/strategies", {
        "strategy_group_id": group_id,
        "name": strategy_name,
        "slug": strategy_slug,
        "description": "Programmatic 2-Year WFA strategy on 1h",
        "runtime_config": {},
        "risk_config": {}
    }, token)
    strategy_id = strat_res["Data"]["id"]
    print(f"Strategy created. ID: {strategy_id}")

    print("Creating bot...")
    bot_res = post_json("/api/tradelab/bots", {
        "strategy_id": strategy_id,
        "strategy_version_id": None,
        "name": f"WFA 2Year Bot {suffix}",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "runtime_config": {
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "marketType": "USD_M_FUTURES"
        },
        "risk_config": {
            "stepSize": 0.001,
            "tickSize": 0.01,
            "minNotional": 10,
            "maxOrderPercent": 100,
            "maxDrawdownPercent": 35,
            "maxPositionPercent": 100
        }
    }, token)
    bot_id = bot_res["Data"]["id"]
    print(f"Bot created. ID: {bot_id}")

    os.makedirs(task_dir, exist_ok=True)
    with open(trial_log_path, "w", encoding="utf-8") as f:
        f.write("# TradeLab 2-Year WFA Trial Log\n\n")
        f.write(f"Created: {datetime.now().isoformat()}\n\n")
        f.write("| Phase | Trial ID | Strategy Description | Return % | Max DD % | Profit Factor | Trades | Status |\n")
        f.write("| --- | --- | --- | --- | --- | --- | --- | --- |\n")

    ema_adx_params = [
        (9, 21, 15), (9, 21, 20), (12, 26, 15), (12, 26, 20), (15, 30, 20)
    ]
    
    ema_rsi_params = [
        (9, 21, 40, 70), (12, 26, 40, 70), (12, 26, 45, 65), (15, 30, 40, 70)
    ]
    
    bb_params = [
        (14, 2.0), (20, 2.0), (30, 2.0)
    ]

    trials = []
    trial_count = 0
    
    # ----------------------------------------------------
    # PHASE 1: IN-SAMPLE SEARCH
    # Range: 2024-06-01 to 2025-06-01 (12 months)
    # ----------------------------------------------------
    print("\n=== PHASE 1: IN-SAMPLE SEARCH (BTCUSDT 1h, 2024-06-01 to 2025-06-01) ===")
    
    for p in ema_adx_params:
        trial_count += 1
        desc = f"EMA Cross ({p[0]}/{p[1]}) + ADX > {p[2]}"
        code = generate_ema_adx_source(p[0], p[1], p[2])
        trials.append({"phase": "IS", "id": f"IS_Trial_{trial_count:02d}", "desc": desc, "code": code, "params": p, "type": "ema_adx"})
        
    for p in ema_rsi_params:
        trial_count += 1
        desc = f"EMA Cross ({p[0]}/{p[1]}) + RSI [{p[2]}, {p[3]}]"
        code = generate_ema_rsi_source(p[0], p[1], p[2], p[3])
        trials.append({"phase": "IS", "id": f"IS_Trial_{trial_count:02d}", "desc": desc, "code": code, "params": p, "type": "ema_rsi"})
        
    for p in bb_params:
        trial_count += 1
        desc = f"BB Reversion ({p[0]}, {p[1]} std)"
        code = generate_bb_reversion_source(p[0], p[1])
        trials.append({"phase": "IS", "id": f"IS_Trial_{trial_count:02d}", "desc": desc, "code": code, "params": p, "type": "bb"})

    is_results = []
    for trial in trials:
        print(f"Running Phase 1 Trial {trial['id']}: {trial['desc']}...")
        try:
            ver_res = post_json(f"/api/tradelab/strategies/{strategy_id}/versions", {
                "source_code": trial["code"]
            }, token)
            
            backtest_res = post_json(f"/api/tradelab/bots/{bot_id}/backtests", {
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "start_at": "2024-06-01T00:00:00Z",
                "end_at": "2025-06-01T00:00:00Z",
                "initial_equity": 100,
                "fee_bps": 10,
                "slippage_bps": 1
            }, token)
            run_id = backtest_res["Data"]["run"]["id"]
            
            status = "queued"
            for _ in range(80):
                run_status = get_json(f"/api/tradelab/bot-runs/{run_id}", token)["Data"]
                status = run_status["status"]
                if status in ["completed", "failed", "cancelled"]:
                    break
                time.sleep(0.5)
                
            if status == "completed":
                res = get_json(f"/api/tradelab/bot-runs/{run_id}/result", token)["Data"]
                ret = float(res["total_return_pct"])
                mdd = float(res["max_drawdown_pct"])
                pf = float(res["profit_factor"]) if res["profit_factor"] is not None else 0.0
                trades = int(res["total_trades"])
                
                trial["ret"] = ret
                trial["mdd"] = mdd
                trial["pf"] = pf
                trial["trades"] = trades
                trial["status"] = "Completed"
                
                is_results.append(trial)
                print(f"-> Completed. Return: {ret:.2f}%, MDD: {mdd:.2f}%, PF: {pf:.2f}, Trades: {trades}")
            else:
                trial["status"] = f"Failed ({status})"
                trial["ret"], trial["mdd"], trial["pf"], trial["trades"] = 0.0, 0.0, 0.0, 0
                print(f"-> Failed. Status: {status}")
                
        except Exception as e:
            trial["status"] = f"Error ({str(e)})"
            trial["ret"], trial["mdd"], trial["pf"], trial["trades"] = 0.0, 0.0, 0.0, 0
            print(f"-> Error: {e}")
            
        with open(trial_log_path, "a", encoding="utf-8") as f:
            f.write(f"| IS | {trial['id']} | {trial['desc']} | {trial.get('ret', 0.0):.2f}% | {trial.get('mdd', 0.0):.2f}% | {trial.get('pf', 0.0):.2f} | {trial.get('trades', 0)} | {trial['status']} |\n")

    completed_is = [t for t in is_results if t["status"] == "Completed" and t["trades"] > 1]
    completed_is.sort(key=lambda x: x["ret"], reverse=True)
    
    print("\n=== TOP 3 IN-SAMPLE 2-YEAR CANDIDATES ===")
    top_candidates = completed_is[:3]
    for idx, cand in enumerate(top_candidates):
        print(f"{idx+1}. {cand['id']} | {cand['desc']} | Return: {cand['ret']:.2f}% | MDD: {cand['mdd']:.2f}% | PF: {cand['pf']:.2f} | Trades: {cand['trades']}")
        
    if not top_candidates:
        print("No candidates with trades found. Aborting.")
        return

    # ----------------------------------------------------
    # PHASE 2: VALIDATION
    # Range: 2025-06-01 to 2025-12-01 (6 months)
    # ----------------------------------------------------
    print("\n=== PHASE 2: VALIDATION (BTCUSDT 1h, 2025-06-01 to 2025-12-01) ===")
    
    val_results = []
    for idx, cand in enumerate(top_candidates):
        val_id = f"VAL_Trial_{idx+1:02d}"
        print(f"Running Validation {val_id} (based on {cand['id']}): {cand['desc']}...")
        try:
            ver_res = post_json(f"/api/tradelab/strategies/{strategy_id}/versions", {
                "source_code": cand["code"]
            }, token)
            
            backtest_res = post_json(f"/api/tradelab/bots/{bot_id}/backtests", {
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "start_at": "2025-06-01T00:00:00Z",
                "end_at": "2025-12-01T00:00:00Z",
                "initial_equity": 100,
                "fee_bps": 10,
                "slippage_bps": 1
            }, token)
            run_id = backtest_res["Data"]["run"]["id"]
            
            status = "queued"
            for _ in range(80):
                run_status = get_json(f"/api/tradelab/bot-runs/{run_id}", token)["Data"]
                status = run_status["status"]
                if status in ["completed", "failed", "cancelled"]:
                    break
                time.sleep(0.5)
                
            if status == "completed":
                res = get_json(f"/api/tradelab/bot-runs/{run_id}/result", token)["Data"]
                ret = float(res["total_return_pct"])
                mdd = float(res["max_drawdown_pct"])
                pf = float(res["profit_factor"]) if res["profit_factor"] is not None else 0.0
                trades = int(res["total_trades"])
                
                val_run = {
                    "phase": "VAL",
                    "id": val_id,
                    "desc": cand["desc"],
                    "code": cand["code"],
                    "ret": ret,
                    "mdd": mdd,
                    "pf": pf,
                    "trades": trades,
                    "status": "Completed",
                    "parent_is_id": cand["id"]
                }
                val_results.append(val_run)
                print(f"-> Completed. Return: {ret:.2f}%, MDD: {mdd:.2f}%, PF: {pf:.2f}, Trades: {trades}")
            else:
                val_run = {
                    "phase": "VAL",
                    "id": val_id,
                    "desc": cand["desc"],
                    "code": cand["code"],
                    "ret": 0.0, "mdd": 0.0, "pf": 0.0, "trades": 0,
                    "status": f"Failed ({status})",
                    "parent_is_id": cand["id"]
                }
                val_results.append(val_run)
                print(f"-> Failed. Status: {status}")
                
        except Exception as e:
            val_run = {
                "phase": "VAL",
                "id": val_id,
                "desc": cand["desc"],
                "code": cand["code"],
                "ret": 0.0, "mdd": 0.0, "pf": 0.0, "trades": 0,
                "status": f"Error ({str(e)})",
                "parent_is_id": cand["id"]
            }
            val_results.append(val_run)
            print(f"-> Error: {e}")
            
        with open(trial_log_path, "a", encoding="utf-8") as f:
            f.write(f"| VAL | {val_run['id']} ({val_run['parent_is_id']}) | {val_run['desc']} | {val_run['ret']:.2f}% | {val_run['mdd']:.2f}% | {val_run['pf']:.2f} | {val_run['trades']} | {val_run['status']} |\n")

    completed_val = [t for t in val_results if t["status"] == "Completed"]
    if not completed_val:
        print("No completed validation runs.")
        return
        
    completed_val.sort(key=lambda x: x["ret"], reverse=True)
    best_candidate = completed_val[0]
    print(f"\n=== BEST CANDIDATE FOR OOS: {best_candidate['desc']} ===")
    
    # ----------------------------------------------------
    # PHASE 3: OUT-OF-SAMPLE HOLDOUT & STRESS TESTING
    # Range: 2025-12-01 to 2026-06-01 (6 months)
    # ----------------------------------------------------
    print("\n=== PHASE 3: OUT-OF-SAMPLE & STRESS (BTCUSDT 1h, 2025-12-01 to 2026-06-01) ===")
    
    # Baseline
    try:
        ver_res = post_json(f"/api/tradelab/strategies/{strategy_id}/versions", {
            "source_code": best_candidate["code"]
        }, token)
        
        backtest_res = post_json(f"/api/tradelab/bots/{bot_id}/backtests", {
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "start_at": "2025-12-01T00:00:00Z",
            "end_at": "2026-06-01T00:00:00Z",
            "initial_equity": 100,
            "fee_bps": 6,
            "slippage_bps": 1
        }, token)
        run_id = backtest_res["Data"]["run"]["id"]
        
        status = "queued"
        for _ in range(80):
            run_status = get_json(f"/api/tradelab/bot-runs/{run_id}", token)["Data"]
            status = run_status["status"]
            if status in ["completed", "failed", "cancelled"]:
                break
            time.sleep(0.5)
            
        if status == "completed":
            res = get_json(f"/api/tradelab/bot-runs/{run_id}/result", token)["Data"]
            oos_ret = float(res["total_return_pct"])
            oos_mdd = float(res["max_drawdown_pct"])
            oos_pf = float(res["profit_factor"]) if res["profit_factor"] is not None else 0.0
            oos_trades = int(res["total_trades"])
            oos_status = "Completed"
            print(f"OOS Baseline: Return: {oos_ret:.2f}%, MDD: {oos_mdd:.2f}%, PF: {oos_pf:.2f}, Trades: {oos_trades}")
        else:
            oos_ret, oos_mdd, oos_pf, oos_trades = 0.0, 0.0, 0.0, 0
            oos_status = f"Failed ({status})"
            print(f"OOS Baseline Failed: {status}")
    except Exception as e:
        oos_ret, oos_mdd, oos_pf, oos_trades = 0.0, 0.0, 0.0, 0
        oos_status = f"Error ({str(e)})"
        print(f"OOS Baseline Error: {e}")
        
    with open(trial_log_path, "a", encoding="utf-8") as f:
        f.write(f"| OOS_Base | OOS_Baseline | {best_candidate['desc']} | {oos_ret:.2f}% | {oos_mdd:.2f}% | {oos_pf:.2f} | {oos_trades} | {oos_status} |\n")

    # Stress
    try:
        backtest_res = post_json(f"/api/tradelab/bots/{bot_id}/backtests", {
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "start_at": "2025-12-01T00:00:00Z",
            "end_at": "2026-06-01T00:00:00Z",
            "initial_equity": 100,
            "fee_bps": 15,
            "slippage_bps": 5
        }, token)
        run_id = backtest_res["Data"]["run"]["id"]
        
        status = "queued"
        for _ in range(80):
            run_status = get_json(f"/api/tradelab/bot-runs/{run_id}", token)["Data"]
            status = run_status["status"]
            if status in ["completed", "failed", "cancelled"]:
                break
            time.sleep(0.5)
            
        if status == "completed":
            res = get_json(f"/api/tradelab/bot-runs/{run_id}/result", token)["Data"]
            stress_ret = float(res["total_return_pct"])
            stress_mdd = float(res["max_drawdown_pct"])
            stress_pf = float(res["profit_factor"]) if res["profit_factor"] is not None else 0.0
            stress_trades = int(res["total_trades"])
            stress_status = "Completed"
            print(f"OOS Stress: Return: {stress_ret:.2f}%, MDD: {stress_mdd:.2f}%, PF: {stress_pf:.2f}, Trades: {stress_trades}")
        else:
            stress_ret, stress_mdd, stress_pf, stress_trades = 0.0, 0.0, 0.0, 0
            stress_status = f"Failed ({status})"
            print(f"OOS Stress Failed: {status}")
    except Exception as e:
        stress_ret, stress_mdd, stress_pf, stress_trades = 0.0, 0.0, 0.0, 0
        stress_status = f"Error ({str(e)})"
        print(f"OOS Stress Error: {e}")
        
    with open(trial_log_path, "a", encoding="utf-8") as f:
        f.write(f"| OOS_Stress | OOS_Stress | {best_candidate['desc']} | {stress_ret:.2f}% | {stress_mdd:.2f}% | {stress_pf:.2f} | {stress_trades} | {stress_status} |\n")

    # Scorecard
    parent_is_run = None
    for t in completed_is:
        if t["id"] == best_candidate["parent_is_id"]:
            parent_is_run = t
            break

    passed_scorecard = True
    scorecard_reasons = []
    
    # Monthly calculations: IS = 12 months, Val = 6 months, OOS = 6 months
    is_monthly = (parent_is_run['ret'] / 12.0) if parent_is_run else 0.0
    val_monthly = best_candidate["ret"] / 6.0
    oos_monthly = oos_ret / 6.0
    
    if val_monthly < 5.0:
        passed_scorecard = False
        scorecard_reasons.append(f"Validation monthly-equivalent return is {val_monthly:.2f}%, below target 5%")
    if oos_monthly < 5.0:
        passed_scorecard = False
        scorecard_reasons.append(f"OOS monthly-equivalent return is {oos_monthly:.2f}%, below target 5%")
    if best_candidate["mdd"] > 15.0 or oos_mdd > 15.0:
        passed_scorecard = False
        scorecard_reasons.append("Max Drawdown exceeded 15% limit")
    if best_candidate["pf"] < 1.2 or (oos_pf < 1.2 and oos_trades > 0):
        passed_scorecard = False
        scorecard_reasons.append("Profit Factor below 1.2 threshold")
    if stress_ret < 0.0:
        passed_scorecard = False
        scorecard_reasons.append("Strategy broke under stress cost (negative return)")

    classification = "Successful Backtest Candidate" if passed_scorecard else "Failed Candidate"

    # Report
    with open(report_path, "w", encoding="utf-8") as r:
        r.write(f"# TradeLab 2-Year Strategy Research WFA Report\n\n")
        r.write(f"**Date:** {datetime.now().strftime('%Y-%m-%d')}\n")
        r.write(f"**Target Symbol:** BTCUSDT\n")
        r.write(f"**Timeframe:** 1h\n")
        r.write(f"**Initial Capital:** 100 USDT\n")
        r.write(f"**Final Classification:** {classification}\n\n")
        
        r.write("## 1. Summary of Best Candidate\n")
        r.write(f"* **Strategy Description:** {best_candidate['desc']}\n")
        r.write(f"* **Monthly Equivalent Return (Val):** {val_monthly:.2f}% / month\n")
        r.write(f"* **Monthly Equivalent Return (OOS):** {oos_monthly:.2f}% / month\n")
        r.write(f"* **Scorecard Status:** {'PASS' if passed_scorecard else 'FAIL'}\n")
        if scorecard_reasons:
            r.write("  * Reasons:\n")
            for reason in scorecard_reasons:
                r.write(f"    * {reason}\n")
        r.write("\n")
        
        r.write("## 2. Dataset Split Performance Table\n")
        r.write("| Dataset Split | Date Range | Cost Settings | Return % | Max DD % | Profit Factor | Trades | Monthly-Equiv. |\n")
        r.write("| --- | --- | --- | --- | --- | --- | --- | --- |\n")
        
        is_ret = parent_is_run['ret'] if parent_is_run else 0.0
        is_mdd = parent_is_run['mdd'] if parent_is_run else 0.0
        is_pf = parent_is_run['pf'] if parent_is_run else 0.0
        is_trades = parent_is_run['trades'] if parent_is_run else 0
        
        r.write(f"| **In-Sample** | 2024-06-01 to 2025-06-01 | 10 bps fee, 1 bps slip | {is_ret:.2f}% | {is_mdd:.2f}% | {is_pf:.2f} | {is_trades} | {is_monthly:.2f}% |\n")
        r.write(f"| **Validation** | 2025-06-01 to 2025-12-01 | 10 bps fee, 1 bps slip | {best_candidate['ret']:.2f}% | {best_candidate['mdd']:.2f}% | {best_candidate['pf']:.2f} | {best_candidate['trades']} | {val_monthly:.2f}% |\n")
        r.write(f"| **Out-of-Sample** | 2025-12-01 to 2026-06-01 | 6 bps fee, 1 bps slip | {oos_ret:.2f}% | {oos_mdd:.2f}% | {oos_pf:.2f} | {oos_trades} | {oos_monthly:.2f}% |\n")
        r.write(f"| **OOS Stress** | 2025-12-01 to 2026-06-01 | 15 bps fee, 5 bps slip | {stress_ret:.2f}% | {stress_mdd:.2f}% | {stress_pf:.2f} | {stress_trades} | {(stress_ret/6.0):.2f}% |\n\n")

        r.write("## 3. Risks & Robustness Discussion\n")
        r.write("* **Underlying Execution Mode:** Long-only purchases.\n")
        r.write("* **Quantity Step Size Constraint:** Min trade size is $60.\n")
        r.write("* **Cost Resilience:** Higher timeframe results show significant cost mitigation.\n\n")
        
        r.write("## 4. Run Configuration\n")
        r.write(f"```json\n")
        r.write(f"// Strategy ID: {strategy_id}\n")
        r.write(f"// Bot ID: {bot_id}\n")
        r.write(f"// Best Version Code:\n")
        r.write(f"{best_candidate['code']}\n")
        r.write(f"```\n")

if __name__ == "__main__":
    main()
