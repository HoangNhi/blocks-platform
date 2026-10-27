# Platform Dead Code Cleanup

Date: 2026-10-24
Status: Design approved by the user on 2026-10-24. Implementation plan review
and execution-method selection remain pending; product code is unchanged.

## Intent And Scope

Remove unused remnants identified while reviewing ApiGateway, AppHost,
ServiceDefaults, and Shared. The user selected dead-code removal rather than
leaving everything unchanged. Keep this a small, behavior-preserving cleanup.

Source inspection corrects one finding in the earlier proposal: the Gateway
`/embed` allowlist branch is executed compatibility behavior, not dead code.
Removing it would change the application error from 410 to 403. The proposed
scope below excludes that branch; approval must cover this corrected scope.

## Approaches

- Selected direction: remove confirmed unused Shared members, preserving current
  HTTP behavior, DTOs, authentication, permissions, and audit.
- Leave unchanged: no compatibility risk, but keeps unused public members.
- Broader cleanup from the initial proposal: also remove Gateway's `/embed`
  allowlist branch. Rejected for this scope because that changes observable
  behavior and requires separate approval and Gateway regression changes.

## Changes

| File | Remove | Preserve |
| --- | --- | --- |
| `src/platform/Blocks.Shared/Common/DateTimeHelper.cs` | `VietnamNow` | `VietnamTimeZone` and cross-platform timezone lookup |
| `src/platform/Blocks.Shared/DTOs/Base/DeleteListRequest.cs` | `DeleteListRequestValidator` and unused `using FluentValidation` | `DeleteListRequest` and `Ids` |
| `src/platform/Blocks.Shared/DTOs/Base/GetByIdRequest.cs` | `GetByIdDeleteRequestValidator` and unused `using FluentValidation` | `GetByIdRequest` and `Id` |

No callers of these members were found in production source. SystemService and
CatalogService scan their own validator assemblies, not Shared.
`test/SystemService.CleanupChecks/ValidationChecks.cs` already checks that an empty
delete list reaches the service without activating the Shared validator.
Keep that behavioral check; update its name/message only if needed to describe
the removed validator accurately.

## Constraints And Non-Goals

- Keep Gateway's forwarding of `POST /File/api/UploadFile/embed`: FileService
  returns HTTP 200 with `Success=false`, `StatusCode=410`. Do not remove the
  FileService compatibility action or alter Gateway's file security boundary.
- Do not change AppHost, ServiceDefaults, dependencies, configuration, protobuf,
  DTO fields, frontend, database, or storage.
- Keep `FluentValidationActionFilter`, date converters, JWT interception,
  response envelopes, and all active validation.
- These are public C# members. No in-repo callers does not establish compatibility
  with external compiled consumers; inventory those consumers before rollout.
- Preserve historical specs; this document supersedes no historical API or
  security decision beyond authorizing deletion of the three unused members.

## Verification After Implementation

- Add a small runnable absence check for the three removed public members in an
  existing regression harness; do not add a test framework.
- Build Shared and all four consuming services; build AppHost for integration.
- Run SystemService and CatalogService DB-free `contract`, `runtime`, and
  `validation` checks.
- Run FileService `gateway` and `boundary` checks to preserve `/embed` forwarding,
  upload/avatar access, and RPC blocking.
- Run `test/Backend.Upgrade.Check.ps1 -Check all` and review the final diff.
- Record baseline failures separately. Do not run database-backed checks or
  claim deployment/external-consumer verification from these isolated checks.

Implementation plan:
`docs/superpowers/plans/2026-10-24-platform-dead-code-cleanup.md`.
