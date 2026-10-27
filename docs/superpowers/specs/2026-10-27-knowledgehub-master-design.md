# KnowledgeHub Master Design And Learning Contract

Date: 2026-10-27
Status: APPROVED by owner on 2026-10-27; detailed part specs and plans remain pending.
Delivery model: owner implements; agents analyze, plan, teach, and review.

This document defines the proposed final product and learning workflow.
It is not an implementation plan and does not authorize product edits,
dependency installation, database changes, or deployment.

## 1. Intent And Confirmed Decisions

Build KnowledgeHub inside Blocks to learn Python and React through a usable
document intelligence product, not through isolated exercises.

The owner has selected:

- Approach A: integrated vertical slices inside the existing Blocks platform.
- Python backend and React frontend as the learning surfaces.
- A master scope divided into parts before detailed implementation planning.
- Each part follows analysis, detailed spec, approved plan, owner implementation,
  agent review, and recorded outcome. A fresh session is optional.
- The reference spec as input, not an immutable architecture or task list.
- A final working interface reproducing the supplied `code.html` mockup.

Approval of the approach is not approval of this draft or of code changes.

## 2. Inputs And Source Of Truth

Reference directory:
`D:\Workspace\Personal\Doc\Blocks\KnowledgeHub`.

| Input | Role |
| --- | --- |
| `KnowledgeHub_Blocks_Plugin_Spec_v3_MVP_AutoSummary.md` | Product and technical reference. Its heading says v2 despite its filename. |
| `stitch_blocks_interface/code.html` | Primary visual and visible-interaction reference. Static sample content is not production data or a working API contract. |
| `stitch_blocks_interface/screen.png` | Supplemental visual reference for the captured state. |
| `stitch_blocks_interface/DESIGN.md` | Supplemental design tokens; generic orchestration examples are not KnowledgeHub requirements. |
| Current repository source and `AGENTS.md` | Authoritative integration, security, dependency, and file-ownership constraints. |
| This approved master and approved part specs | Product requirements and recorded decisions for this implementation. |

Keep original inputs unchanged. A part spec may refine this master but must
record and seek approval for a material scope change. Do not silently drop
features because they are difficult or because an early slice omits them.

## 3. Approaches

| Approach | Trade-off | Outcome |
| --- | --- | --- |
| Integrated vertical slices | Platform contracts must be resolved early; each slice teaches Python/React against the real application. | Selected by owner. |
| Standalone prototype, integrate later | Faster isolation but duplicates identity, file integration, and shell work. | Not selected. |

Within the selected approach, defer detailed plans until their dependencies
have actually been implemented and reviewed. Do not write a giant plan against
an imagined future repository.

## 4. Proposed Final Product Scope

The following scope is proposed for approval, not attributed to a prior owner
decision. "Later part" means deferred work, not removed final scope.

| ID | Final capability | Delivery parts |
| --- | --- | --- |
| KH-01 | KnowledgeHub mounts in authenticated Blocks navigation, through Gateway and local Aspire orchestration. | P00-P02, P12 |
| KH-02 | Owner-scoped collection create/list/edit/delete and selection; real document counts and safe empty states. | P01-P03 |
| KH-03 | Upload text PDF, Markdown, and TXT through the approved FileService lifecycle; list/filter/search documents; authorized download/delete. | P03-P05, P12 |
| KH-04 | Separate durable worker, persisted processing stages, retry/cancel, crash recovery, and idempotency. | P04-P05, P12 |
| KH-05 | Extract and inspect text, preserve source/page references, persist chunks, and perform keyword search. | P05 |
| KH-06 | Embeddings and vector retrieval; fixed benchmark and keyword/vector comparison. Hybrid only if evaluation supports it. | P06 |
| KH-07 | Grounded Ask with validated citations, explicit insufficient-evidence behavior, and source selection restricted to authorized ready documents. | P07 |
| KH-08 | Persistent conversation sessions, multi-turn follow-up, session search/delete, answer copy/regenerate, and real response metadata. | P08 |
| KH-09 | Citation inspection matching the mockup: exact passage, source context, source location, copy snippet, and authorized original download. | P05, P07-P08, P12 |
| KH-10 | Automatic concise document summary with overview and 3-5 key points; independent status and bounded retries. | P09 |
| KH-11 | Research over uploaded documents with findings, citations, limitations, and unanswered questions. | P10 |
| KH-12 | Security, reliable local operation, evaluation, and full KnowledgeHub visual/interaction acceptance. | Every part, P11-P12 |

Collections are private and user-owned, confirmed during P00 discussion.
Administrators also access only their own collections; no cross-owner bypass.
Sharing, workspaces, and membership are not part of the current scope.

Document deletion must immediately exclude its evidence from new retrieval.
The detailed spec must define access to historical answers/citations after
source deletion and distinguish logical removal from physical retention.
Collection deletion must not silently destroy source files or active work.

## 5. Mockup Fidelity Contract

Rebuild the interface as React components, not as embedded HTML or copied DOM
scripts. Static labels, counts, filenames, timestamps, progress, model names,
scores, and telemetry must become real data or honest unavailable states.

Required interface areas:

- KnowledgeHub breadcrumbs, collection dropdown/create action, and count badge.
- Both primary tabs: document import/repository and Ask/Research workspace.
- File picker/drop zone, upload feedback, status filters, document search,
  processing/error rows, retry/cancel, and document actions.
- Collapsible conversation history, new/select/search/delete sessions, and
  date grouping based on actual timestamps.
- Conversation thread, source-context selection, composer, citations,
  copy/regenerate actions, and response metadata.
- Citation modal with correct document/chunk context, highlighted passage,
  copy, download, close, and keyboard/focus behavior.

Document Detail/summary, collection management dialogs, search results, and
Research result states are required product additions where the mockup does
not fully show them. Their detailed designs belong to the owning parts.

Proposed fidelity boundary, requiring approval:

- Match KnowledgeHub layout, hierarchy, spacing, color intent, and interaction
  coverage. Do not replace the mockup with an unrelated generic dashboard.
- Keep the existing Blocks application shell, identity, avatar, menu authority,
  and theme. Do not add unrelated mockup modules, cluster names, fake search,
  notifications, or platform controls.
- If the owner requires the mockup's entire global sidebar/header, treat that
  as a separately approved shell change with checks of existing screens.
- Use existing UI primitives and Lucide icons. Document accepted differences
  for icon shapes, platform typography, and shell integration.
- Do not preserve prototype defects: initially open citation modal, fixed
  desktop offsets on mobile, inaccessible dialogs, or fake downloads.
- A retrieval score is not answer confidence. Show score only with its real
  meaning; never label a placeholder as a measured vector score.

Record baseline desktop viewport and reference screenshots in P02. P12 compares
the same state/data at that viewport, plus 1440x900 and 390x844 usability checks.
No overflow, obscured controls, inaccessible panes, or fabricated citation/page
positions. Mobile adapts the composition rather than shrinking the desktop.

## 6. Repository And Platform Boundaries

Observed current integration points:

- Frontend domains live in `src/apps/Blocks.Web/src/features/`.
- Protected routes use `src/apps/Blocks.Web/src/Router.tsx` and `MainLayout`.
- Sidebar menus come from SystemService; a hardcoded link is not final
  permission/menu integration.
- API calls use `src/apps/Blocks.Web/src/lib/api.ts` and endpoint constants.
- Preserve `Success`, `StatusCode`, `Data`, `Message`, including application
  failures carried in HTTP 200.
- Current AppHost has .NET resources and the JavaScript app, not Python
  resources. Concrete Python hosting APIs require verification in P01.
- BusinessService and CollabService are absent and must not be restored.

Proposed frontend location: `src/apps/Blocks.Web/src/features/knowledgehub/`,
following neighboring `api`, `hooks`, `routes`, and `types` patterns.

Backend location remains a P00 decision. `src/services/Blocks.KnowledgeHubService/`
is a candidate, not an established Python convention or a decided .NET project.
Do not add a .NET wrapper or a runtime plugin framework.

Proposed backend: FastAPI/Pydantic, PostgreSQL-owned persistence, and separate
API/worker processes sharing a Python package. Owner confirmed `uv`,
database `knowledgehub` in the existing PostgreSQL container, no dedicated test
database, and database-first with reviewed Git-recorded SQL before explicit
SQLAlchemy mappings. Alembic is not required initially. Runtime versions, check
commands, and exact folder layout are P00/P01 decisions.

## 7. Mandatory Integration Gates

### Identity And Authorization

Validate the existing JWT contract, not just parse its payload. Current
SystemService emits the actor GUID in `name` and username in `unique_name`;
do not assume actor identity is in `sub`.

Authenticate and authorize every private API, including jobs, source filters,
search, sessions, citations, and download. IDs supplied by the browser are not
proof of ownership. Define how existing platform action permissions are checked
in Python before calling collection CRUD done.

### FileService

Current browser upload stages an actor-bound batch using `FolderName` and returns
an acknowledgement, not a final trusted attachment reference. Internal RPCs
already support finalize, delete, and original-byte preview. Current storage
namespace mappings are System-specific.

P03 must design and review the actual finalize/registration contract, approved
KnowledgeHub namespace, authenticated Python RPC access, and failure/recovery
behavior before implementation. P04 must resolve durable worker access when the
uploading user's JWT has expired.

Do not store user JWTs in jobs, share signing secrets casually, read FileService
storage directly, expose private files as static URLs, accept arbitrary paths,
or bypass object authorization. Service authentication/delegation is a real
design decision, not a header-name convention.

There is no distributed transaction between KnowledgeHub DB and FileService.
Specify retries, duplicate registration, failed finalization, orphan references,
deletion during processing, and reconciliation without deleting uncertain data.

### Database And External Services

Do not provision a dedicated test database; the owner declined it during P00.
Keep DB-free checks. DB-dependent automated checks remain NOT RUN without an
explicitly authorized safe environment; do not substitute the application DB.
Owner-performed manual checks may use deliberately disposable records with
explicit scope. Missing required evidence remains an acceptance gap, not PASS.
Applying development SQL, schema creation, migrations, menu/permission records,
real AI calls, or deployment needs explicit scope and environment agreement.
Never use System/File tables as KnowledgeHub persistence.

Record reviewed SQL in Git before authorized application. Never copy credentials
into docs, fixtures, commands shown in chat, or tracked configuration.

## 8. Reliability And AI Rules

- Basic timeout, retry classification, idempotency, leases/crash recovery, and
  deletion/cancellation races belong with the first worker, not a final polish
  phase. Do not hold database transactions open across parsing or provider calls.
- Derived text, chunks, summaries, and evidence identify their source/version.
  Reprocessing must not mix stale and current results.
- A searchable document's readiness does not depend on summary success.
  Summary states are separate; creation is automatic, with no manual summary
  regenerate control required.
- Treat documents and model output as untrusted. Retrieval cannot widen
  authorization; citations must resolve to selected authorized evidence.
- Bound file size, parsing resources, model context, output, retries, rate,
  time, and cost. Distinguish upload progress from ingestion stages.
- Mock external AI in normal automated tests. Real-provider checks are separate
  and must not be the sole evaluation of correctness.
- Start keyword-first, then measure vector search. Add infrastructure or
  frameworks only when an observed limitation warrants them.

## 9. Learning And Session Contract

Each part follows this sequence:

1. Read this master, the part brief, prior accepted outcomes, current source,
   and Git status. Reconfirm changed dependencies instead of trusting old plans.
2. Use Superpowers brainstorming to analyze that part and write its detailed
   spec. Resolve blocking decisions and obtain owner approval.
3. Use Superpowers writing-plans to prepare a plan for manual implementation.
   The agent must stop before executing it.
4. The owner implements and tests. The agent may explain concepts, offer small
   isolated examples, or guide debugging on request; it must not edit product
   code or run an implementation agent without a new explicit request.
5. The owner requests review. The agent inspects the diff, relevant callers,
   tests, and UI, reports findings first, and verifies permitted checks.
6. The owner fixes findings. The agent re-reviews and records the outcome.
   A new dependent part starts only after its prerequisites are accepted.

Planning must adapt normal code-heavy templates: list the objective, prerequisite
concepts, files/callers to inspect, observable behavior, small tasks, test/check
commands, expected results, and common traps. Do not include complete production
solutions that remove the learning exercise. Test-first guidance may use behavior
examples and assertions without supplying the whole implementation.

Separate product acceptance from learning evidence. For the latter, ask the owner
to explain one important flow or trade-off; do not invent an exam or require
memorizing framework internals.

Agents may delegate read-only exploration or review. They must not delegate
product implementation under this workflow.

## 10. Completion Evidence

A part outcome records:

- Accepted spec and plan paths; reviewed commit or exact diff scope.
- Implemented requirement IDs and mockup areas covered.
- Checks and results as PASS, FAIL, or NOT RUN, with baseline failures separate.
- Findings fixed, unresolved risks, and consciously accepted deviations.
- API/schema/security decisions and dependencies required by the next part.
- One short explanation from the owner of what they implemented.

NOT RUN is not PASS. Isolated tests do not establish real database, network,
provider, FileService, permission, or deployment behavior.

The master is complete only when all required capabilities and visible
KnowledgeHub controls have acceptance evidence, all required parts are accepted,
and no unresolved high-impact finding remains. Experimental UI fixtures are
allowed in tests/stories only and do not count as working product integration.

## 11. Non-Goals And Conditional Work

Not required: runtime plugin installation, new auth, new file storage, OCR,
EPUB, internet research, collaboration, GraphRAG, an agent marketplace,
Kubernetes, Kafka, Celery/Redis, or restoration of removed business features.

Hybrid retrieval is conditional on evaluation. Provider switching UI and manual
summary regeneration are not required. Real production deployment is a separate
authorization, not an automatic effect of completing local acceptance.

## 12. Part Index And Approval

Part briefs, dependency order, session prompts, and outcome tracking:
`docs/knowledgehub/README.md`.

P00 draft: `docs/superpowers/specs/2026-10-27-knowledgehub-p00-integration-contracts-design.md`.
The owner-confirmed refinements above do not approve the P00 draft automatically.

Approval of this draft accepts the proposed final scope, mockup fidelity
boundary, and owner-implementation workflow. P00 then resolves the stated
integration decisions; subsequent parts need their own approved spec and plan.
No detailed part plan or product implementation has been authorized yet.
