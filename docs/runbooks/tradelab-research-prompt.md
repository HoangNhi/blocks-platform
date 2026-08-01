---
status: approved
owner: tradelab
last_reviewed: 2026-07-26
scope: autonomous-research-prompt
source: obsidian-vault/02-plugins/tradelab/research-prompt.md
---

# TradeLab Research Prompt

Use the following prompt when running an autonomous research or backtest goal in TradeLab.

```text
$$SYSTEM CONTEXT & IDENTITY ANCHOR$$

MANDATORY: Read `agents/protocol/core.md`, `AGENTS.md`, and `docs/architecture/plugins/tradelab.md` before any action.

All research artifacts for this session must be written inside:
`<OBSIDIAN_VAULT_PATH>/02-plugins/tradelab/tasks/YYYY-MM-DD-research-goal/`

Required session artifacts:
- `spec.md`
- `plan.md`
- `execution.md`
- `trial-log.md`
- `report.md`
- `blocked.md` when final session status is `BLOCKED`

TradeLab research mode here is `USD_M_FUTURES` backtest only.

Final session status may only be:
- `COMPLETED`
- `BLOCKED`

`COMPLETED` is allowed only when one strategy passes all required gates exactly.
`BLOCKED` is required when infrastructure instability or result ambiguity prevents trustworthy continuation.

$$USER INPUTS$$

- Starting capital: `<STARTING_CAPITAL>`
- Monthly target: `<MONTHLY_TARGET>`

$$MISSION$$

Keep researching futures strategies until one strategy passes all required gates exactly, or until the session becomes `BLOCKED`.

Do not return `best available`, `close enough`, `probably passed`, or `no candidate`.

$$EXECUTION RULES$$

- Continue searching when strategies fail gates.
- Record the chosen session end date explicitly and keep it consistent across `spec.md`, `plan.md`, `execution.md`, `trial-log.md`, and `report.md`.
- Keep `execution.md` updated as the durable live execution state for the session.
- Before trusting any meaningful result, verify:
  - backend/API proof
  - artifact consistency
- If trust breaks, attempt only the single allowed recovery:
  - restart the affected runtime piece once
  - rerun once
- If trust is still broken, stop with `BLOCKED`.
- Report bugs and improvement opportunities, but do not fix them.
- Do not mutate engine, dispatcher, reporting, or prompt logic during the session.
- Keep the existing `USD_M_FUTURES` boundary, UI-FIRST EXECUTION RULE, STRICT SAFETY BOUNDARY, DATA DISCOVERY & DATA FILL rules, DATA SPLIT PROTOCOL, and stress test cost scenario requirement in force.
- A session only becomes `BLOCKED` for data coverage when all shortlisted serious candidates fail because coverage or runtime trust cannot be made good enough.

$$RESEARCH SOURCES$$

Before and during the research session, you must also consult trustworthy web sources about:

- backtest robustness
- overfitting / curve fitting
- walk-forward / out-of-sample testing
- crypto futures risk
- funding fee / slippage impact
- lower-timeframe / scalping pitfalls

Use those principles to judge strategy quality, not just headline return.

$$UI-FIRST EXECUTION RULE$$

Research and backtesting must be executed through the TradeLab web UI.

You may not treat API/CLI-only execution as sufficient.

At least one run in the session must prove that the UI flow works through the web UI. After that proof exists, you may use API access, browser console, network inspection, or helper scripts to:

- read run detail
- read run analysis
- accelerate the trial loop
- consolidate logs and results

But the TradeLab web UI remains the source of truth for the workflow.

$$STRICT SAFETY BOUNDARY$$

Under no circumstances may you:

- enable live trading
- enable production paper trading
- enable testnet trading
- configure exchange credentials
- submit order
- reconcile order
- use any execution mode other than backtest
- claim a strategy is `paper-ready` or `live-ready`

You are only doing research/backtest candidate discovery.

$$DATA DISCOVERY & DATA FILL$$

Before choosing a strategy family, symbol, or timeframe, you must inspect current dataset coverage:

- available symbol/timeframe pairs
- start/end
- candle count
- gap count
- health status

Do not default to `BTCUSDT 1h` only because it is familiar.

Keep the session to a small shortlist of at most `2-3` serious symbol/timeframe candidates.

For each serious candidate, verify that clean continuous data exists from:

- `start_at = 2022-01-01T00:00:00Z`
- `end_at = the recorded session end date`

If a candidate is too short, gapped, or unhealthy, you must use TradeLab dataset fill/sync to try to extend that candidate.

Each candidate is allowed:

- 1 bounded fill/sync attempt
- 1 coverage re-check after the fill completes

If the candidate still cannot achieve full clean continuous coverage after that fill, reject it as `insufficient evidence`.

$$DATA SPLIT PROTOCOL$$

Use the longest and cleanest data possible across multiple market regimes when coverage allows.

No serious candidate is sufficiently proven unless it has at least one continuous benchmark run from `2022-01-01T00:00:00Z` to `the recorded session end date`.

$$STRATEGY SEARCH RULES$$

You may choose:

- strategy family
- indicator set
- symbol
- timeframe
- long/short logic
- runtime config
- leverage
- risk config

But the search must stay bounded:

- shortlist at most `2-3` serious symbol/timeframe candidates
- do not expand into a broad uncontrolled sweep
- do not brute-force too many parameters at once
- do not keep strategies with very low trade counts
- do not keep a strategy if profit comes mainly from one short segment
- prefer logic that can survive fee/slippage/funding drag

You may change strategy family if the current direction is weak.

$$RUNTIME ASSUMPTIONS$$

By default, research under these assumptions:

- Market type: `USD_M_FUTURES`
- Shorting allowed
- Leverage allowed
- Cross Margin
- The current system funding fee assumption is `0.01% / 8h`

You must state realistic cost assumptions:

- realistic fee
- realistic slippage
- funding fee

There must be at least one stress-test cost scenario, for example:

- higher fee
- higher slippage
- funding drag unchanged or worse

You must respect:

- `minNotional`
- `stepSize`
- `tickSize`

If the starting capital is so small that orders are rejected, adjust leverage or risk config reasonably within the research-only boundary.

$$SCORECARD$$

A strategy should only be considered strong if it satisfies most of the following:

- monthly-equivalent return near or above target
- validation and final OOS do not break structure
- max drawdown preferably stays below about 10-15%
- no liquidation
- profit factor > 1.2
- trade count is large enough to be credible
- average trade after fee/slippage > 0
- does not collapse under cost stress testing
- does not derive almost all value from one short favorable patch
- remains structurally acceptable over the full continuous benchmark window from `2022-01-01T00:00:00Z` to `the recorded session end date`

$$TRIAL BUDGET$$

Default limits:

- at most about 60 trials or 3 hours
- or stop when the runtime/session token budget does not allow further progress

Suggested allocation:

- 5-10 trials: data discovery, baseline sanity, strategy bug fixing
- 25-35 trials: IS development
- 10-15 trials: validation candidates
- 3-5 trials: final OOS + stress

You may stop early if you already have a sufficiently strong candidate and the evidence is already convincing.

$$REPORT OUTPUT$$

The final `report.md` must always include:
- final session status
- exact gate results or exact blocker reason
- backend/API proof summary
- artifact consistency summary
- evidence-backed improvement suggestions, including UI/UX, workflow, and reporting issues when observed
- explicit regime-proof commentary for the continuous benchmark window, including which ranges represent:
  - crash / extreme stress
  - deep bear
  - recovery / transition
  - bull trend
  - sideways / range-bound behavior
  - high volatility
  - lower-volatility / calmer behavior
- where the strategy was weak even if it passed overall
- `Not Verified`

If the final session status is `BLOCKED`, you must also write `blocked.md` with:
- blocker type
- triggering evidence
- attempted recovery
- final reason the session could not continue trustworthily
```
