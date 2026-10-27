# KnowledgeHub Part Briefs And Session Handoff

Date: 2026-10-27
Status: Master, decomposition, and P00 integration contracts APPROVED by owner on 2026-10-27; P01 next.

Master: `docs/superpowers/specs/2026-10-27-knowledgehub-master-design.md`.

These are analysis briefs, not approved detailed specs or implementation plans.
The owner writes all product code. Agents analyze, teach, plan, review, and
record evidence. A part may require several sessions; split it further if its
plan is too large for a beginner to understand and verify incrementally.

## Delivery Order

| Part | Scope | Prerequisites | Status |
| --- | --- | --- | --- |
| P00 | Integration decisions and contracts | Master approved | ACCEPTED |
| P01 | Python runtime, Gateway, identity | P00 | NOT STARTED |
| P02 | Collections and React feature frame | P01 | NOT STARTED |
| P03 | File lifecycle and document repository | P02 | NOT STARTED |
| P04 | Durable worker and job lifecycle | P03 | NOT STARTED |
| P05 | Parsing, chunks, source view, keyword search | P04 | NOT STARTED |
| P06 | Embeddings, vector retrieval, evaluation | P05 | NOT STARTED |
| P07 | Grounded Ask and citation inspection | P05 | NOT STARTED |
| P08 | Persistent sessions and full chat controls | P07 | NOT STARTED |
| P09 | Automatic document summary | P04, P05, P07 | NOT STARTED |
| P10 | Document-grounded Research | P06, P08 | NOT STARTED |
| P11 | Integrated reliability and security acceptance | P03-P10 | NOT STARTED |
| P12 | Mockup parity and final local acceptance | P02-P11 | NOT STARTED |

Recommended learning order is table order. P07 can start on keyword retrieval
if P06 is blocked, but that does not remove P06 from the final scope. Visual
checks begin in P02 and continue throughout; P12 is not the first UI review.

Use `DRAFT`, `SPEC APPROVED`, `PLAN READY`, `OWNER IMPLEMENTING`,
`REVIEW REQUIRED`, `CHANGES REQUIRED`, and `ACCEPTED` for in-progress parts.
Do not mark a dependent part ready while a blocking prerequisite is unresolved.

## P00 - Integration Decisions And Contracts

Draft: `docs/superpowers/specs/2026-10-27-knowledgehub-p00-integration-contracts-design.md`.

Confirmed in discussion: private collections without administrator bypass;
database `knowledgehub` in the existing PostgreSQL container; no dedicated test
database; database-first with explicit SQLAlchemy mappings; `uv` tooling.
Continue in this session or a new one. No implementation is authorized.

**Goal:** remove integration assumptions before creating projects or schemas.

**Read:** master; current frontend auth/API/menu patterns; JWT issuer and permission
contracts; FileService upload/finalize/preview and hardening design; AppHost and
Gateway; existing database-first instructions.

**Decide:** private collection ownership; Python package location/tooling;
PostgreSQL ownership and safe verification without a dedicated test DB; SQL-first mapping;
public route prefix; JWT validation and action permissions; feature/shell visual
boundary. Name the open FileService/worker identity questions and their owners.

**Exclude:** product scaffolding, dependency installation, SQL application,
menu seeds, and fake endpoints.

**Acceptance:** a reviewed contract/decision record with no unidentified blocker
for P01/P02. P03/P04 may retain explicitly listed design gates, but cannot start
their implementation until those gates are resolved.

**Learn:** HTTP boundaries, authentication vs authorization, process vs service,
and why IDs and file paths are not permissions.

## P01 - Python Runtime, Gateway, And Identity

**Goal:** a small Python API reachable through Blocks with real auth boundaries.

**Scope:** minimum Python package; health/readiness; validated configuration;
existing JWT validation; authorized API example; compatible response envelopes;
Gateway forwarding and Aspire local startup.

**Exclude:** a worker that has no job yet, collections, files, AI, and a second
authentication system.

**Acceptance:** isolated checks cover authorized/unauthorized requests and actual
Gateway routing; local startup/shutdown is documented. Missing environment is
reported, not replaced by always-authorized fixtures in production code.

**Learn:** Python modules/types, virtual environments, FastAPI request lifecycle,
validation, exceptions, configuration, and first small automated tests.

## P02 - Collections And React Feature Frame

**Goal:** first real user-owned vertical slice with a visible React result.

**Scope:** collection CRUD; owner and platform permissions; reviewed persistence;
frontend API/types/hooks/routes; collection selection/count/empty/loading/error
states; protected route and real menu integration; both mockup tab positions.

**Exclude:** document upload, fake chat replies, and rebuilding unrelated global
shell controls. Future controls may be explicitly unavailable during development,
but cannot count as accepted final functionality.

**Acceptance:** create/rename/select/delete persists correctly; another actor
cannot access the collection; non-empty deletion semantics are explicit.
Capture the reference desktop viewport, layout baseline, and agreed deviations.

**Learn:** Python persistence and transactions; React components, props, state,
forms, TypeScript contracts, query keys, invalidation, and routing.

## P03 - File Lifecycle And Document Repository

**Goal:** upload and manage private originals through FileService, without
inventing a file-reference contract.

**Scope:** approved namespace and authenticated RPC integration; stage/finalize/
register; trusted references; list/search/filter documents; real upload progress;
authorized original download; logical deletion and reconciliation boundaries.

**Gate:** design finalize ownership, token forwarding, failure/retry behavior, and
cross-service consistency before code. User-supplied paths are never accepted.
Specify durable worker credentials/delegation with P04 before asynchronous reads.

**Exclude:** direct storage access, static private URLs, parsing in an upload
request, physical purge, and claims that upload acknowledgement means READY.

**Acceptance:** two actors cannot register/download/delete each other's files;
failed finalization/DB save preserves known-good data; retry does not duplicate
references; repository counts and actions reflect real state.

**Learn:** multipart requests, blobs, cancellation, resource cleanup, RPC
contracts, trust boundaries, and handling a partial cross-service failure.

## P04 - Durable Worker And Job Lifecycle

**Goal:** durable asynchronous work with safe failure behavior from its first use.

**Scope:** API/worker process separation; atomic document/job scheduling;
claim/lease/reclaim; bounded attempts/backoff; persisted stage/error; cancellation;
idempotent publication; deletion races; authenticated file access after the
uploading user token expires.

**Exclude:** Celery/Redis, holding transactions during external work, storing user
JWTs, and dummy READY transitions without actual processing.

**Acceptance:** production worker handlers operate on isolated fixtures; process
termination and restart do not lose or duplicate work; retry/cancel/deletion
cannot publish stale data. A source change has a distinct processing version.

**Learn:** asyncio, transaction boundaries, locking, state machines, retries,
leases, and why UI progress must come from persisted work.

## P05 - Parsing, Chunks, Source View, And Keyword Search

**Goal:** find an exact passage in an uploaded document without an LLM.

**Scope:** text PDF first, then Markdown/TXT; safe bounded parsing; normalized
blocks and provenance; stable chunks; keyword search; source inspection; real
processing feedback; an initial fixed benchmark including negative questions.

**Exclude:** OCR/EPUB, made-up page or line coordinates, embeddings, and treating
user HTML/Markdown as trusted application markup.

**Acceptance:** search finds expected source passages; PDF pages survive
normalization; non-PDF sources show section/line references only when supported;
empty/corrupt/oversized sources fail honestly; cross-owner retrieval is blocked.
READY requires usable indexed content, not summary generation.

**Learn:** parsing boundaries, Unicode/text handling, deterministic functions,
chunk trade-offs, SQL search, provenance, and focused regression tests.

## P06 - Embeddings, Vector Retrieval, And Evaluation

**Goal:** add and measure semantic retrieval against an existing baseline.

**Scope:** approved embedding model/provider; pgvector readiness; versioned
embedding data; bounded batching/retry/cost; keyword/vector comparison using
fixed questions and relevant evidence; Recall@K/MRR.

**Exclude:** unmeasured hybrid complexity, multiple vector databases, provider
switching UI, and real-provider dependency in normal automated tests.

**Acceptance:** vector results remain owner/source scoped; failed embeddings
do not corrupt valid text/chunks; keyword behavior remains usable under its
declared readiness policy; experiment records model/version, results, latency,
and limitations. Hybrid is added only if justified by evaluation.

**Learn:** vectors, ranking, evaluation data, reproducibility, and the difference
between similarity and factual confidence.

## P07 - Grounded Ask And Citation Inspection

**Goal:** ask one question and inspect its actual supporting evidence.

**Scope:** explicit retrieval/evidence/answer contracts; bounded model call;
insufficient evidence; citation validation; source selection; Ask rendering;
mockup-style citation modal with passage/context/copy/download.

**Exclude:** fabricated citations, unrestricted model tools, persistent multi-turn
history, and model memory presented as uploaded-document evidence.

**Acceptance:** each citation resolves to selected authorized evidence/version;
unsupported questions decline or qualify the answer; hostile document text
cannot change permissions or system behavior; modal keyboard/focus works;
deleted/stale/unavailable sources are reported honestly.

**Learn:** structured model output, prompt/data separation, validation,
request states, accessible dialogs, and citation-grounding tests.

## P08 - Persistent Sessions And Full Chat Controls

**Goal:** replace every static conversation interaction with real behavior.

**Scope:** collection-scoped sessions/messages; new/select/search/delete;
date grouping; multi-turn follow-up; source-context changes; history collapse;
composer; copy; answer regeneration/versioning; real model/latency/usage metadata.

**Decide:** context carried between turns; what source changes invalidate;
duplicate send and concurrent generation; failed/abandoned runs; refresh recovery;
stale citations; honest unavailable telemetry. Streaming is optional unless the
approved interaction requires it; aborting HTTP is not proof server work stopped.

**Exclude:** four hardcoded sessions, text-node replacement as message history,
and new API namespaces or state libraries without need.

**Acceptance:** sessions survive reload; actor and collection boundaries hold;
new turns append correctly; regeneration has defined history semantics; failures
preserve conversation state; counts, filters, and source selection are real.

**Learn:** relational modeling, derived UI state, list identity, async races,
mutation handling, scrolling, and testing interactive state changes.

## P09 - Automatic Document Summary

**Goal:** concise summary appears after indexing without user action.

**Scope:** automatic idempotent job; overview and 3-5 key points; independent
QUEUED/GENERATING/READY/FAILED/SKIPPED states; source/prompt/model version;
bounded input/cost/retries; Document Detail interface matching the feature.

**Exclude:** manual generate/regenerate buttons, chapter summaries, and blocking
document READY/search/Ask on summary success.

**Acceptance:** repeated scheduling creates one current result; provider failure
leaves the document usable; oversized input is bounded/skipped honestly;
deletion/reprocessing cannot publish a stale summary.

**Learn:** derived artifacts, reuse of job handling, bounded summarization,
independent loading states, and failure isolation.

## P10 - Document-Grounded Research

**Goal:** answer a broader question with traceable cross-document findings.

**Scope:** bounded research request/run; subquestions and evidence gathering;
findings, synthesis, citations, limitations, unanswered questions; real progress
and failure/cancellation behavior; UI within the Ask/Research workspace.

**Exclude:** internet research, autonomous tool permissions, and agent frameworks
unless a concrete need is approved.

**Acceptance:** report citations validate like Ask; contradictory or insufficient
evidence remains visible; resource limits and owner/source scope hold; refresh,
failure, and cancellation have defined outcomes.

**Learn:** decomposing a longer workflow, evidence aggregation, partial results,
run lifecycle, and testing bounded external work.

## P11 - Integrated Reliability And Security Acceptance

**Goal:** verify cross-part guarantees, not postpone basic safeguards here.

**Scope:** ownership/action-permission matrix; input and rendering safety;
provider limits; queue recovery under real process boundaries; deletion and
reprocessing across chunks/vectors/sessions/summaries/reports; health/readiness;
logs without secrets; deployment artifact preparation where approved.

**Exclude:** production data changes, unapproved external AI spend, deployment,
and unrelated platform refactoring.

**Acceptance:** isolated integration and negative cases have evidence; missing
DB/network/provider environments remain NOT RUN with clear required follow-up;
no high-impact unresolved security/data-loss finding is accepted as done.

**Learn:** integration vs unit evidence, operational failure modes, safe logging,
resource limits, and reading a review report.

## P12 - Mockup Parity And Final Local Acceptance

**Goal:** complete the approved master and reproduce the KnowledgeHub interface.

**Scope:** requirement-to-part/test mapping; all visible controls; collection
context; document import/states/actions; sessions/thread/composer; source filter;
citations; Document Detail/summary; Research; agreed shell integration.

**Acceptance:** compare screenshots against `code.html`/`screen.png` at the
recorded reference viewport with deterministic permitted fixtures; inspect
1440x900 and 390x844; test keyboard, focus, long text, scroll, loading, empty,
error, unavailable, processing, and ready states.

Run relevant frontend build/lint/tests and backend/contract checks defined by
the implemented projects. Verify actual local AppHost/Gateway/FileService flows
in an explicitly available authorized environment. List approved visual
deviations and every NOT RUN gate. No dummy buttons or fake success states.

**Exclude:** counting screenshot similarity as proof of backend correctness,
or counting passing unit tests as proof of visual parity.

**Learn:** end-to-end reasoning, visual regression, accessibility, and evidence-
based product acceptance. Real production deployment needs separate approval.

## Session Prompt - Analyze And Plan A Part

Replace `Pxx` with the next eligible part.

```text
$superpowers:using-superpowers

KnowledgeHub learning workflow. Work on Pxx only.
Read AGENTS.md, git status, the current source, and:
- docs/superpowers/specs/2026-10-27-knowledgehub-master-design.md
- docs/knowledgehub/README.md, especially Pxx
- approved prerequisite specs and review outcomes

First confirm master approval and accepted prerequisites. If a prerequisite
is missing, explain the blocker; do not silently implement it.

Use brainstorming to analyze this part and write its detailed spec.
After I approve that spec, use writing-plans to write a small-step plan
for me to implement manually. Include concepts, files to inspect, behavior,
checks, expected results, and acceptance criteria. Do not supply the whole
production solution.

Do not execute the plan, edit product code, install dependencies, apply SQL,
change menu/permission data, deploy, or delegate implementation.
Read-only exploration and review delegation are allowed.
```

## Session Prompt - Review Owner Implementation

```text
$superpowers:using-superpowers

Review my KnowledgeHub Pxx implementation against its approved spec and plan,
the master, and applicable mockup areas. Start with git status and establish
the exact diff/commit scope; do not assume all working-tree changes are mine
for this part.

Report bugs, risks, behavior mismatches, security/accessibility gaps, and
missing tests first, ordered by severity with file/line references.
Run only safe checks within authorized scope. Ask before data changes or
external-provider calls. Do not fix product code or delegate fixes.

Record PASS/FAIL/NOT RUN, baseline failures, open findings, accepted deviations,
and next-part dependencies. If required evidence is missing, do not mark
the part ACCEPTED. After review, update only this part's documentation/outcome.
```

## Outcome Record

Create an outcome only when actual review occurs, for example:
`docs/knowledgehub/outcomes/P02.md`.

```text
Part:
Status:
Approved spec:
Approved plan:
Reviewed commit/diff:
Requirement IDs and mockup areas:
Checks: command, environment, PASS/FAIL/NOT RUN
Findings fixed:
Open findings and risks:
Accepted deviations and owner approval:
Decisions/contracts for following parts:
Owner explanation of implemented flow:
Next eligible part:
```

Do not create completed outcomes in advance. Do not mark this roadmap or the
master approved merely because a file exists or an agent reviewed the draft.
