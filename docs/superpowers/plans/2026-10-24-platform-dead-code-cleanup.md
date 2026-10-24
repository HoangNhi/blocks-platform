# Platform Dead Code Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove three unused Shared public members without changing current HTTP behavior.

**Architecture:** Delete only the unused property and two validator classes. Reuse the existing SystemService contract harness for absence checks and existing consumer harnesses for behavior verification.

**Tech Stack:** C#, .NET 10, existing console regression harnesses, PowerShell.

**Spec:** `docs/superpowers/specs/2026-10-24-platform-dead-code-cleanup-design.md`

## Global Constraints

- Remove only `DateTimeHelper.VietnamNow`, `DeleteListRequestValidator`, and `GetByIdDeleteRequestValidator`, plus the resulting unused imports.
- Keep `DeleteListRequest.Ids`, `GetByIdRequest.Id`, and `DateTimeHelper.VietnamTimeZone` unchanged.
- Keep `/embed`: HTTP 200, `Success=false`, application `StatusCode=410`.
- Do not change Gateway, AppHost, ServiceDefaults, dependencies, configuration, protobuf, frontend, database, or storage.
- Preserve authentication, permissions, audit, active validation, converters, and response envelopes.
- No new dependencies, test framework, abstractions, or baseline-warning cleanup.
- No database-backed checks; external compiled consumers require separate inventory before rollout.
- Preserve unrelated user changes; run checks sharing build outputs sequentially.

## Review Focus

- Deleted symbols accidentally retained: reflection checks cover all three, not only the first failure.
- DTO types accidentally removed or changed: contract checks retain exact property types.
- Date conversion damaged by deleting the helper: retain timezone field and run existing converter checks.
- Empty delete list accidentally begins failing validation: retain existing HTTP success and single service-call assertions.
- Gateway compatibility accidentally changed: retain `/embed` forwarding and existing file/RPC boundary checks.

## File Map

| File | Responsibility |
| --- | --- |
| `src/platform/Blocks.Shared/Common/DateTimeHelper.cs` | Delete unused `VietnamNow` property only. |
| `src/platform/Blocks.Shared/DTOs/Base/DeleteListRequest.cs` | Delete validator and unused import; retain DTO. |
| `src/platform/Blocks.Shared/DTOs/Base/GetByIdRequest.cs` | Delete validator and unused import; retain DTO. |
| `test/SystemService.CleanupChecks/Program.cs` | Add assertions inside existing `void RunContractChecks()`. |
| `test/SystemService.CleanupChecks/ValidationChecks.cs` | Rename existing empty-list test/message to describe preserved behavior. |

## Task 1: Remove Unused Shared Members

**Files:** The five source/test files in File Map; record execution results in this plan.

**Interfaces:**
- Consumes: existing `void RunContractChecks()`, `void Assert(bool condition, string name)`, and `ValidationChecks.RunAsync()`.
- Produces: unchanged retained DTO/timezone APIs; three removed public members; unchanged HTTP and validation behavior.

- [x] **Step 1: Record baseline**

Check `git status --short`; read the spec, File Map sources, and each harness mode before running it.
Run SystemService `contract` and `validation` checks against unchanged code and record exit codes.
Reserve the full consumer matrix for Step 5.
Separate existing failures from regressions; do not fix unrelated problems.

- [x] **Step 2: Add failing contract assertions**

Insert these assertions in `RunContractChecks()` before the existing protobuf checks.
Use the existing `System.Reflection` import and `Assert` helper; do not introduce a test mode or helper class.

```csharp
var clock = typeof(Blocks.Shared.Common.DateTimeHelper);
var shared = clock.Assembly;
Assert(clock.GetProperty("VietnamNow", BindingFlags.Public | BindingFlags.Static) == null, "unused VietnamNow removed");
Assert(shared.GetType("Blocks.Shared.DTOs.Base.DeleteListRequestValidator") == null, "unused DeleteListRequestValidator removed");
Assert(shared.GetType("Blocks.Shared.DTOs.Base.GetByIdDeleteRequestValidator") == null, "unused GetByIdDeleteRequestValidator removed");
Assert(clock.GetField("VietnamTimeZone", BindingFlags.Public | BindingFlags.Static)?.FieldType == typeof(TimeZoneInfo), "timezone field retained");
Assert(typeof(Blocks.Shared.DTOs.Base.DeleteListRequest).GetProperty("Ids")?.PropertyType == typeof(List<Guid>), "delete DTO contract retained");
Assert(typeof(Blocks.Shared.DTOs.Base.GetByIdRequest).GetProperty("Id")?.PropertyType == typeof(Guid?), "get-by-id DTO contract retained");
```

Run `dotnet run --project test/SystemService.CleanupChecks -- contract`.
Expected: exit 1 with `Assertion failed: unused VietnamNow removed`, not a compilation or infrastructure error.
The other absence checks become observable as the preceding removals are made in Step 3.

- [x] **Step 3: Delete the three unused members**

Remove `public static DateTime VietnamNow` only; rerun `contract` and expect
`unused DeleteListRequestValidator removed` to fail.
Remove `DeleteListRequestValidator` and its `using FluentValidation`; rerun and
expect `unused GetByIdDeleteRequestValidator removed` to fail.
Remove `GetByIdDeleteRequestValidator` and its `using FluentValidation`; rerun
and expect exit 0 with all existing contract assertions still passing.
Keep retained DTO declarations, defaults, nullability, and timezone lookup unchanged.

- [x] **Step 4: Keep the existing validation characterization accurate**

In `ValidationChecks.cs`, rename `unregistered_shared_validator_stays_inactive()`
and its call to `empty_delete_list_preserves_baseline()`.
Replace only the obsolete assertion message with
`empty delete list preserves baseline success`.
Keep its request, HTTP 200, `Success=true`, application 200, and exactly one service-call assertions.
Run `dotnet run --project test/SystemService.CleanupChecks -- validation`;
expect exit 0 and `PASS SystemService validation characterization checks`.
Keep all existing converter, JWT-header, authorization-order, and active-validator checks.

- [x] **Step 5: Verify all affected consumers**

Run sequentially from the repository root:

```powershell
dotnet build src/platform/Blocks.Shared/Blocks.Shared.csproj
dotnet build src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj
dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj
dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj
dotnet build src/services/Blocks.FileService/Blocks.FileService.csproj
dotnet build src/platform/Blocks.AppHost/Blocks.AppHost.csproj
dotnet run --project test/SystemService.CleanupChecks -- contract
dotnet run --project test/SystemService.CleanupChecks -- runtime
dotnet run --project test/SystemService.CleanupChecks -- validation
dotnet run --project test/CatalogService.CleanupChecks -- contract
dotnet run --project test/CatalogService.CleanupChecks -- runtime
dotnet run --project test/CatalogService.CleanupChecks -- validation
dotnet run --project test/FileService.RemovalChecks -- gateway
dotnet run --project test/FileService.RemovalChecks -- boundary
& ./test/Backend.Upgrade.Check.ps1 -Check all
```

Expected: each command exits 0; FileService reports 0 failures.
Record warnings and NOT RUN cases separately, never as passed assertions.
These checks do not authorize AppHost startup against application data or prove deployment compatibility.

- [x] **Step 6: Review and commit the scoped change**

Inspect `git diff --check` and `git diff --stat`; confirm no product changes
outside the three Shared files and no dropped behavior assertions.
Record results in this plan and request one focused independent read-only review.
Stage only the five File Map files and this plan; exclude generated output and unrelated changes.
Commit with `git commit -m "refactor: remove unused Shared members"`.

## Execution Results

- **Step 1 Baseline**: `git status --short` clean; SystemService `contract` exit 0; SystemService `validation` exit 0 (`PASS SystemService validation characterization checks`).
- **Step 2 TDD Red**: Contract assertions added; `dotnet run --project test/SystemService.CleanupChecks -- contract` failed with exit 1 and `Assertion failed: unused VietnamNow removed`.
- **Step 3 TDD Green progression**:
  - Removed `DateTimeHelper.VietnamNow` -> failed with exit 1 and `Assertion failed: unused DeleteListRequestValidator removed`.
  - Removed `DeleteListRequestValidator` and `using FluentValidation;` -> failed with exit 1 and `Assertion failed: unused GetByIdDeleteRequestValidator removed`.
  - Removed `GetByIdDeleteRequestValidator` and `using FluentValidation;` -> passed with exit 0 (`All contract checks passed!`).
- **Step 4 Validation Characterization**: Renamed test and call to `empty_delete_list_preserves_baseline()`, updated message to `"empty delete list preserves baseline success"`; `dotnet run --project test/SystemService.CleanupChecks -- validation` passed with exit 0 (`PASS SystemService validation characterization checks`).
- **Step 5 Full Consumer Matrix**:
  - `dotnet build src/platform/Blocks.Shared/Blocks.Shared.csproj`: Exit 0 (0 warnings, 0 errors).
  - `dotnet build src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj`: Exit 0 (0 warnings, 0 errors).
  - `dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj`: Exit 0 (0 warnings, 0 errors).
  - `dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj`: Exit 0 (4 baseline warnings, 0 errors).
  - `dotnet build src/services/Blocks.FileService/Blocks.FileService.csproj`: Exit 0 (2 baseline warnings, 0 errors).
  - `dotnet build src/platform/Blocks.AppHost/Blocks.AppHost.csproj`: Exit 0 (1 baseline ASPIRE010 warning, 0 errors).
  - `dotnet run --project test/SystemService.CleanupChecks -- contract`: Exit 0 (`All contract checks passed!`).
  - `dotnet run --project test/SystemService.CleanupChecks -- runtime`: Exit 0 (`All runtime checks passed (no database connection).`).
  - `dotnet run --project test/SystemService.CleanupChecks -- validation`: Exit 0 (`PASS SystemService validation characterization checks`).
  - `dotnet run --project test/CatalogService.CleanupChecks -- contract`: Exit 0 (`PASS contract checks`).
  - `dotnet run --project test/CatalogService.CleanupChecks -- runtime`: Exit 0 (`PASS runtime checks`).
  - `dotnet run --project test/CatalogService.CleanupChecks -- validation`: Exit 0 (`PASS CatalogService validation characterization checks`).
  - `dotnet run --project test/FileService.RemovalChecks -- gateway`: Exit 0 (`FileService checks: 0 failure(s), 0 NOT RUN.`).
  - `dotnet run --project test/FileService.RemovalChecks -- boundary`: Exit 0 (`FileService checks: 0 failure(s), 0 NOT RUN.`).
  - `& ./test/Backend.Upgrade.Check.ps1 -Check all`: Exit 0 (`All checks passed.`).
- **Step 6 Self-Review**: Diff scoped strictly to the 5 File Map files (2 deletions in Shared, 2 test updates in SystemService.CleanupChecks) and this plan. No dropped behavior assertions, no whitespace errors.

## Execution Handoff

Recommend native execution: one small task with tightly coupled deletions and checks.
Use an independent reviewer for the finished diff, not parallel edits to these files.
Wait for plan review and execution-method selection before changing product code.
