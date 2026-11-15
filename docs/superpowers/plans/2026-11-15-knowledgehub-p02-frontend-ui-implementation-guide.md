# KnowledgeHub P02 — Frontend UI Manual Implementation Guide (Tasks 10–18)

**Date:** 2026-11-15  
**Status:** IMPLEMENTATION GUIDE / PROPOSED ADDENDUM — not P02 approval, not implementation evidence.  
**Branch inspected:** <code>feature/knowledgehub-learning</code>.  
**Parent plan:** <code>docs/superpowers/plans/2026-11-01-knowledgehub-p02-collections-react-frame.md</code>.  
**Source of truth:** P02 design spec, Master, tracked Stitch reference, and current frontend source.  
**Learning boundary:** Owner writes/runs production React/TypeScript and tests. This document teaches exact edit locations and assembly; it does not authorize an agent to implement product code, apply SQL, alter permissions, start services, or mark acceptance complete.

## A. Read this before Task 10

The existing plan says **what** to build. This guide explains **where**, **in what order**, **with which installed primitives**, and **what observable result** to verify. Follow the parent plan's security/API contracts even where illustrative snippets below are abbreviated.

1. First read <code>AGENTS.md</code>, <code>src/apps/Blocks.Web/components.json</code>, <code>src/apps/Blocks.Web/package.json</code>, and actual local files on the working branch. Record <code>git status --short</code> before edits. Do not overwrite unrelated changes.
2. Review the tracked reference triad:
   - <code>docs/knowledgehub/references/stitch_blocks_interface/screen.png</code> — 1280×1024 visual reference.
   - <code>.../code.html</code> — prototype hierarchy/labels/interactions, **not** production JSX/API contract.
   - <code>.../DESIGN.md</code> — optional design cues, **not** permission to redesign Blocks globally.
3. P02 includes collection CRUD, selection and two **honest empty/unavailable tab frames**. It does **not** include documents, upload, progress, AI answers, chat history, citations or search. Keep original mockup files untouched.
4. Mockup discrepancy to correct rather than copy: the reference screenshot shows the collection dropdown open and a repository/file surface; prototype tab toggling/default visible classes are not an authoritative behavior spec. Follow P02: **repository tab is the initial active tab**; capture separate open-selector/tab screenshots. Existing sample file rows, counts, upload hints, status percentages and answer text are illustrative only.
5. The existing <code>MainLayout</code> owns sidebar/topbar, page scrolling and breadcrumb. KnowledgeHub owns **only its content area**. Never copy the fixed <code>aside</code>, <code>header</code>, <code>main h-screen</code> or Material Symbols CDN from the prototype.

### A1. Mockup → React regions → reuse map

| Mockup region / behavior | P02 React responsibility | Reuse exactly from installed source |
| --- | --- | --- |
| Global sidebar/topbar | Already exists; do not rebuild | <code>components/layout/MainLayout/{MainLayout,app-sidebar}.tsx</code> |
| Collection title + dropdown | Selected collection title, menu, next-page loading, create entry | <code>ui/button</code>, <code>ui/popover</code>, <code>ui/command</code>, <code>ui/scroll-area</code>, Lucide |
| “N tài liệu” chip | <code>DocumentCount=0</code> from real selected DTO, never mock “4” | <code>ui/badge</code> |
| Tab 01 / Tab 02 switch | React tab state; no URL selection state duplication | <code>ui/tabs</code> |
| Import/drop-zone area | Informative **disabled** P03 placeholder | <code>ui/card</code>, <code>ui/button</code>, Lucide; no real file input |
| Repository table/filter/status | True empty/unavailable state in P02; **no fake rows** | <code>ui/card</code>, <code>ui/separator</code>, <code>ui/skeleton</code> if loading |
| Ask & Research panel | Informative **disabled** future AI frame; no fabricated sessions/answers | <code>ui/card</code>, <code>ui/button</code>, Lucide |
| Create/rename | Domain form, async save, auth-aware permissions | <code>ui/dialog</code>, <code>ui/form</code>, <code>ui/input</code>, <code>ui/textarea</code>, <code>react-hook-form</code>, <code>zod</code> |
| Delete | Real target confirmation and pending/error preservation | <code>ui/confirm-delete-dialog</code>, <code>ui/button</code> |
| Toast/error/loading | Truthful server states | <code>ui/sonner</code>, <code>ui/skeleton</code> and small feature-level error messages |

**Important local-code exception:** <code>src/components/ui/combobox.tsx</code> currently renders <code>CommandItem value={option.Text}</code>, and toggles a selected value back to empty. It is **not safe as-is** for P02 duplicate collection names, UUID-only selection and server paging. Do not rewrite a second generic combobox: compose the already-installed **Popover + Command** primitives in a <code>knowledgehub/components/CollectionSelector.tsx</code>, with UUID item values and name search keywords. Do not use the prototype's manually toggled dropdown DOM. Existing <code>ui/select</code> is suitable for small fixed lists but is less suitable for explicit “Tải thêm” paging.

**shadcn versioning:** Local components are Radix-based, while current upstream documentation also offers Base UI variants with different APIs. The repository's source files are authoritative. All necessary primitives above are already checked in; **do not run shadcn add/overwrite, install dependencies, or upgrade components** for P02.

### A2. Target file inventory (relative to <code>src/apps/Blocks.Web/src</code>)

**Existing files to edit narrowly**

| File | Exact edit anchor |
| --- | --- |
| <code>config/constants.ts</code> | Add one <code>KNOWLEDGEHUB_BASE</code> near the other *_BASE constants and one <code>KnowledgeHub</code> endpoint group in <code>API_ENDPOINTS</code>; keep System/Catalog/File untouched |
| <code>Router.tsx</code> | Add import after other page imports; add one <code>Route path="/knowledgehub"</code> inside the already protected <code>MainLayout</code> route group |
| <code>main.tsx</code> **or** a minimal auth lifecycle insertion | Mount a KnowledgeHub-only cache boundary **under** <code>AuthProvider</code> and **inside** <code>QueryClientProvider</code> if required after inspecting lifecycle; do not clear all query data or rewrite auth |
| <code>contexts/AuthContext.tsx</code> | Only if the tested logout/actor switch path cannot be covered by the child boundary; preserve existing SystemService behavior |
| <code>styles/index.css</code> | Prefer **no edit**. Use theme utilities and local feature classes first; any extra theme adjustment must be narrowly scoped and reviewed |

**New feature files, with one clear responsibility each**

~~~text
src/features/knowledgehub/
  types/collections.types.ts
  api/collections.api.ts
  hooks/collection-query-keys.ts
  hooks/useCollections.ts
  hooks/useCollectionMutations.ts
  hooks/useCollectionSelection.ts
  hooks/KnowledgeHubCacheBoundary.tsx
  routes/KnowledgeHubPage.tsx
  components/CollectionSelector.tsx
  components/CollectionFormDialog.tsx
  components/CollectionDeleteDialog.tsx
  components/RepositoryFrame.tsx
  components/AskResearchFrame.tsx
  components/CollectionState.tsx
  ...focused *.test.ts / *.test.tsx beside those files
~~~

This is a recommended bounded map, not a mandate to create unused abstractions. Keep API logic out of layout components and keep global shadcn primitives untouched.

## Task 10 — API contracts, types, protected route (small edits first)

**10.1** In <code>config/constants.ts</code>, directly after <code>FILE_BASE</code>, propose:

~~~ts
const KNOWLEDGEHUB_BASE = "/api/knowledgehub";
~~~

In <code>API_ENDPOINTS</code> add a sibling of <code>System</code>, <code>Catalog</code>, <code>File</code>, not a replacement:

~~~ts
KnowledgeHub: {
  COLLECTIONS: KNOWLEDGEHUB_BASE + "/collections",
},
~~~

**10.2** In <code>Router.tsx</code>, append a page import near the other route imports:

~~~tsx
import KnowledgeHubPage from "./features/knowledgehub/routes/KnowledgeHubPage";
~~~

Inside the existing authenticated <code>Route element={...ProtectedRoute/MainLayout...}</code> next to <code>/faculty</code> and <code>/auditlog</code>, insert:

~~~tsx
<Route path="/knowledgehub" element={<KnowledgeHubPage />} />
~~~

No second <code>BrowserRouter</code>, <code>SidebarProvider</code> or <code>ProtectedRoute</code>; the enclosing group already supplies those.

**10.3** Create <code>types/collections.types.ts</code> with the actual P02 PascalCase contract. Keep list inputs in snake_case:

~~~ts
export interface CollectionDto {
  Id: string;
  Name: string;
  Description: string | null;
  CreatedAt: string;
  UpdatedAt: string;
  DocumentCount: number; // Always 0 in P02
}
export interface CollectionPageDto {
  Data: CollectionDto[];
  TotalRow: number;
  PageIndex: number;
  PageSize: number;
}
export interface CollectionInput {
  Name: string;
  Description: string | null;
}
export interface CollectionListParams {
  page_index: number;
  page_size: number;
}
export interface DeleteCollectionDto {
  Id: string;
}
~~~

**10.4** Create <code>api/collections.api.ts</code>. Import the existing <code>api</code> and <code>ApiResponse</code> from <code>@/lib/api</code>. All five operations use the existing Gateway endpoint (GET list/detail, POST create, PUT edit, DELETE soft delete). A compact, typed **error contract** example:

~~~ts
import api, { type ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import type { CollectionDto, CollectionPageDto, CollectionInput, CollectionListParams, DeleteCollectionDto } from "../types/collections.types";

export class CollectionApiError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = "CollectionApiError";
  }
}
function unwrap<T>(result: ApiResponse<T>): T {
  if (!result.Success) {
    throw new CollectionApiError(result.StatusCode, result.Message || "Không thể thực hiện yêu cầu.");
  }
  if (result.Data == null) {
    throw new Error("Phản hồi KnowledgeHub không có dữ liệu.");
  }
  return result.Data;
}

const base = API_ENDPOINTS.KnowledgeHub.COLLECTIONS;
export const collectionsApi = {
  list: async (params: CollectionListParams, signal?: AbortSignal) =>
    unwrap<CollectionPageDto>(await api.get<CollectionPageDto>(base, { params, signal })),
  detail: async (id: string, signal?: AbortSignal) =>
    unwrap<CollectionDto>(await api.get<CollectionDto>(base + "/" + encodeURIComponent(id), { signal })),
  create: async (body: CollectionInput) =>
    unwrap<CollectionDto>(await api.post<CollectionDto>(base, body)),
  update: async (id: string, body: CollectionInput) =>
    unwrap<CollectionDto>(await api.put<CollectionDto>(base + "/" + encodeURIComponent(id), body)),
  remove: async (id: string) =>
    unwrap<DeleteCollectionDto>(await api.delete<DeleteCollectionDto>(base + "/" + encodeURIComponent(id))),
};
~~~

**Do not duplicate** refresh-token logic: <code>lib/api.ts</code> already handles soft application 401. Do not interpret HTTP 200 as success when <code>Success=false</code>. If real API differs from the accepted P02 spec, stop and reconcile the contract instead of silently adapting behavior.

**Task 10 checkpoint:** Import resolves; authenticated route shares MainLayout; fake unit response <code>{Success:false,StatusCode:403}</code> rejects, never renders a successful page.

## Task 11 — Actor-private queries and lifecycle

**11.1** Create <code>hooks/collection-query-keys.ts</code>; use an explicit actor prefix:

~~~ts
export const collectionKeys = {
  actor: (actorId: string) => ["knowledgehub", actorId] as const,
  lists: (actorId: string) => [...collectionKeys.actor(actorId), "collections"] as const,
  list: (actorId: string, page: number, size: number) =>
    [...collectionKeys.lists(actorId), { page, size }] as const,
  detail: (actorId: string, id: string) =>
    [...collectionKeys.actor(actorId), "detail", id] as const,
};
~~~

**11.2** In <code>hooks/useCollections.ts</code>, read authenticated <code>user?.Id</code> from <code>useAuth()</code>. Use <code>useQuery</code> with <code>queryFn: ({signal}) =&gt; collectionsApi.list(..., signal)</code>, <code>enabled</code> only when actor exists and view permission is granted. For detail also require a **valid URL selection** (Task 12). Query keys must include actor and parameters. Do not use <code>keepPreviousData</code> across actor/collection identity.

**11.3** Implement <code>hooks/KnowledgeHubCacheBoundary.tsx</code> as a small context-aware component mounted under the existing providers. On actor transition/logout:
- cancel old actor's queries with prefix <code>["knowledgehub", oldActorId]</code>;
- remove **only old actor's** KnowledgeHub queries after cancellation;
- ensure old pending mutations cannot update a new actor's cache, form, toast or URL;
- reset feature dialogs/drafts on actor change; avoid globally clearing Faculty/System caches.

Because a mutation can finish after a sign-out or route change, mutation handlers must capture initiating actor ID and compare with a **current-actor ref/generation** before any side effect. Test this explicitly; actor-scoped keys alone do not protect navigation.

**Task 11 checkpoint:** Cached A never paints under B; A's pending create/delete cannot select/clear B's <code>c</code>; requests consume AbortSignal. Real server ownership checks still remain mandatory.

## Task 12 — URL-only selection, no competing selected-ID state

**12.1** Create <code>hooks/useCollectionSelection.ts</code>. Use React Router <code>useSearchParams()</code>. Do not create <code>useState(selectedCollectionId)</code>, auto-select the first collection or store selection in localStorage.

Suggested pure parser **inside this file** (or a nearby tested helper):

~~~ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
export type Selection =
  | { state: "none" }
  | { state: "invalid" }
  | { state: "selected"; id: string };

export function parseSelection(params: URLSearchParams): Selection {
  const all = params.getAll("c");
  if (all.length === 0) return { state: "none" };
  if (all.length !== 1 || !UUID.test(all[0]) || all[0].toLowerCase() === ZERO_UUID) {
    return { state: "invalid" };
  }
  return { state: "selected", id: all[0].toLowerCase() };
}
~~~

**12.2** For explicit selection, use <code>setSearchParams(previous =&gt; { const next = new URLSearchParams(previous); next.set("c", id); return next; });</code> (push by default). For deletion of the **currently selected** collection, delete only <code>c</code> with <code>{ replace: true }</code> after confirming current actor + current URL still match the mutation target. Preserve unrelated query keys. On rename keep URL unchanged.

**12.3** Detail requests must be independent of which list page contains the item. Duplicate, missing, malformed and zero UUID params trigger **no detail request**. Missing/deleted/foreign detail all render the same unavailable state. Back/Forward and refresh derive from URL.

**Task 12 checkpoint:** <code>/knowledgehub?c=valid-id&foo=1</code> preserves <code>foo</code>; invalid repeated <code>c</code> does not trigger request; browser history works.

## Task 13 — Collection header, selector, pagination, honest states

**13.1** Create <code>components/CollectionSelector.tsx</code>; props should include <code>selection</code>, <code>selectedCollection</code>, <code>list/page/loading/error</code>, <code>canCreate</code>, <code>onSelect(id)</code>, <code>onCreate()</code>, <code>onLoadMore()</code>. Keep asynchronous data/route decisions in page/hooks, not in a generic shadcn primitive.

**13.2** Compose these **already installed** source files:
- <code>ui/popover.tsx</code>: Popover, PopoverTrigger, PopoverContent.
- <code>ui/command.tsx</code>: Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty.
- <code>ui/button.tsx</code>, <code>ui/badge.tsx</code>, Lucide ChevronDown / Check / Plus.

Example fragment illustrating UUID identity (not a complete selector):

~~~tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="ghost" className="min-w-0 max-w-full justify-start text-left">
      <span className="min-w-0 truncate">{selectedCollection?.Name ?? "Chọn bộ sưu tập"}</span>
      <ChevronDown className="size-4 shrink-0" />
    </Button>
  </PopoverTrigger>
  <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
    <Command>
      <CommandInput placeholder="Tìm trong danh sách đã tải..." />
      <CommandList>
        <CommandEmpty>Không có bộ sưu tập phù hợp</CommandEmpty>
        <CommandGroup>
          {collections.map((collection) => (
            <CommandItem
              key={collection.Id}
              value={collection.Id}
              keywords={[collection.Name]}
              onSelect={() => onSelect(collection.Id)}
            >
              <span className="min-w-0 flex-1 truncate">{collection.Name}</span>
              {selectedId === collection.Id && <Check className="size-4" />}
            </CommandItem>
          ))}
        </CommandGroup>
        {/* A real load-more Button appears here when another page exists. */}
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
~~~

**13.3** Paging rule: first GET <code>page_index=1&page_size=50</code>. Show a real <code>Tải thêm</code> control while <code>loadedCount &lt; TotalRow</code>; fetch next page only on demand and deduplicate by UUID. Search above filters **loaded** items only; label it accurately, not as global server search. Do not fabricate document-count values from mockup or silently stop at 50.

**13.4** Distinguish states: no collections / no selection / selected detail pending / list pending / permission denied / temporary 503 / invalid URL / missing-deleted-foreign detail. Use <code>CollectionState.tsx</code> for presentational messages if repetition appears. The badge reads the selected real DTO's <code>DocumentCount</code>, which is zero in P02.

**Task 13 checkpoint:** 51+ fixtures, duplicate names with distinct UUIDs, selected item off current list page, non-clickable action when permission absent, no stale data flashing.

## Task 14 — Create, rename, delete with existing shadcn dialog/form primitives

**14.1** Create <code>components/CollectionFormDialog.tsx</code> for both create/rename. Use the existing <code>ui/dialog.tsx</code>, <code>ui/form.tsx</code> (or <code>ui/field.tsx</code> with React Hook Form), <code>ui/input.tsx</code>, <code>ui/textarea.tsx</code>, <code>ui/button.tsx</code>, <code>react-hook-form</code>, <code>zod</code> and <code>zodResolver</code>. Inspect <code>PopupFaculty.tsx</code> for local syntax, **but do not copy its client-generated UUID**: KnowledgeHub IDs are backend-generated.

Fields: <code>Name</code> required (trim, reject NUL, 1–200 Unicode **code points**); <code>Description</code> optional/nullable (trim, reject NUL, max 2000 code points, blank → null). For JS code-point length use <code>Array.from(value).length</code>, not <code>value.length</code>. Form submit sends **only** <code>{Name, Description}</code>; edit sends both values even when description is null. Do not infer that duplicate names are invalid.

**14.2** Create <code>hooks/useCollectionMutations.ts</code>, using TanStack <code>useMutation</code> and Task 10's rejecting API adapter. On success and only if initiating/current actor still match: invalidate the actor's list; create selects the returned ID; rename refetches/updates the actor's detail without changing URL. On failed/uncertain response: keep dialog, inputs, URL and error message, with no success toast. Prevent double submits; choose and test pending dismissal rules.

**14.3** Create <code>components/CollectionDeleteDialog.tsx</code> reusing <code>ui/confirm-delete-dialog.tsx</code>. It already supports <code>isLoading</code>, <code>confirmVariant="destructive"</code>, <code>stopAutoClose</code>. Supply the **target name plus an ID fragment** because names can repeat. Use <code>stopAutoClose={true}</code> and close only after confirmed mutation success; block dismissal if pending. Deletion of the selected item removes only current <code>c</code> with replace and evicts affected detail; deleting another ID does not change current selection.

**14.4** Gate visible actions by exact permission flags from <code>MainLayout</code> Outlet context (<code>IsAdded</code>, <code>IsUpdated</code>, <code>IsDeleted</code>). A hidden button is not security; API/RPC/owner SQL remain authoritative.

**Task 14 checkpoint:** create/edit/delete success + every soft-error state; draft retained after 403/503; duplicate-name disambiguation; keyboard, Escape, focus restoration, pending state and actor switching.

## Task 15 — Assemble the mockup hierarchy with truthful tabs

**15.1** Create <code>routes/KnowledgeHubPage.tsx</code>. Start with the existing protected layout context:

~~~tsx
import { useOutletContext } from "react-router-dom";
import type { GetPermissionByUser } from "@/features/system/types/role.types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const { permission } = useOutletContext<{ permission: GetPermissionByUser | null }>();
const canCreate = permission?.IsAdded === true;
// Read actor, URL selection, queries, mutations via Task 11/12/14 hooks.
~~~

Use <code>mx-auto w-full max-w-7xl min-w-0 space-y-4</code> for the feature body. Do **not** add another <code>h-screen</code>, <code>fixed left-0</code>, separate sidebar, duplicated breadcrumb bar or global color overrides: <code>MainLayout.tsx</code> already renders the Blocks shell and scroll container.

**15.2** Render, from top to bottom:

~~~text
KnowledgeHubPage (inside existing MainLayout)
  FeatureHeader
    CollectionSelector (title/dropdown)
    DocumentCount Badge (real DTO, 0 in P02)
    Create/Rename/Delete buttons (permission-gated)
  Tabs defaultValue="repository"
    TabsList
      TabsTrigger value="repository": Kho tài liệu & Import
      TabsTrigger value="research": Hỏi đáp & Nghiên cứu
    TabsContent value="repository"
      RepositoryFrame (honest empty / disabled upload)
    TabsContent value="research"
      AskResearchFrame (honest unavailable AI frame)
  CollectionFormDialog (create/edit)
  CollectionDeleteDialog
~~~

**15.3** Create <code>components/RepositoryFrame.tsx</code>: preserve the mockup's upload surface silhouette/icon and repository-area hierarchy using Card/Button/Separator, **but no working file input, drag handler, fabricated documents, status filters, fake progress, “12 files” metadata or upload size promise**. Label clearly <code>Chức năng tải tài liệu sẽ có ở giai đoạn tiếp theo</code>. When selected, show <code>Chưa có tài liệu trong bộ sưu tập này</code> and zero count. When no selected collection, lead with the selection action. Keep focus/disabled semantics truthful.

**15.4** Create <code>components/AskResearchFrame.tsx</code>: retain the second tab's overall spatial position without rendering fake conversations, “nguồn trích dẫn”, active composer, research answers or models. Show a well-labeled future capability state and, if a disabled button is visible, actually disable it. Don't reproduce the prototype's citation modal.

**15.5** Visual decisions: use current semantic Tailwind utilities (<code>bg-background</code>, <code>bg-muted</code>, <code>text-muted-foreground</code>, <code>border-border</code>, <code>text-primary</code>) and Lucide icons. Approximate mockup spacing and hierarchy with small local class adjustments; preserve MainLayout typography/color system instead of copying the Stitch CDN or replacing <code>:root</code> tokens. On mobile, selector and actions stack; tabs can wrap/scroll horizontally without horizontal page overflow.

**Task 15 checkpoint:** both tabs switch and have correct accessible Radix semantics; repository tab initially active; no fake functional document/AI feature; no shell duplication.

## Task 16 — Tests by file and behavior, not “test later”

Place Vitest/Testing Library tests next to the files they cover. Reuse <code>vitest.config.ts</code>, <code>src/test/setup.ts</code> and nearby Faculty/Router tests. Use deterministic **test-only** fake DTOs, never a production fixture list.

| Test file | Mandatory assertions |
| --- | --- |
| <code>api/collections.api.test.ts</code> | GET/POST/PUT/DELETE use Gateway prefix; <code>Success=false</code> 400/403/404/503 rejects, never success |
| <code>hooks/useCollectionSelection.test.ts</code> | No <code>c</code>, valid, empty, duplicate, malformed, zero UUID; preserve unrelated params; push selection / replace selected delete |
| <code>hooks/useCollections.test.tsx</code> | Actor-prefixed keys; abort/read cancellation; no leak A→B; off-page detail; paged list 51+ |
| <code>hooks/useCollectionMutations.test.tsx</code> | Success navigation/invalidation, error preserves draft, late A mutation cannot navigate B |
| <code>components/CollectionSelector.test.tsx</code> | Duplicate names choose correct UUID; pagination; disabled permission; keyboard access |
| <code>components/CollectionFormDialog.test.tsx</code> | Unicode code-point counts, blank and NUL, nullable description, pending, Escape/focus, 403/503 |
| <code>components/CollectionDeleteDialog.test.tsx</code> | Target identity shown, no auto-close before success, unaffected selection for other ID |
| <code>routes/KnowledgeHubPage.test.tsx</code> | Protected layout context, initial repository tab, two honest frames, error/empty/invalid states, no fake actions |

Create tests in the smallest useful implementation increments: Task 10 API tests; 11/12 hook tests; 13 selector tests; 14 dialog/mutation tests; 15 page visual/state tests. Do not use a successful mocked UI test as evidence that the real Gateway/DB permissions work.

## Task 17 — Integration gate (do not silently execute)

Follow parent plan strictly: ask owner authorization for SystemService menu/grants and live disposable actors, then verify through protected <code>/knowledgehub</code> → Gateway → backend. Do not modify SystemService role data by direct SQL, fabricate actors or touch a shared DB to make UI seem functional. If approval/environment is unavailable, record **NOT RUN** (never PASS).

UI-specific checks: unauthenticated redirect; denied <code>IsViewed</code>; allowed add/update/delete buttons only for actual permissions; another user's UUID uniformly unavailable; soft HTTP200 errors do not show success or close forms.

## Task 18 — Visual acceptance with a deviation ledger

**Record three viewports:** 1280×1024 (reference), 1440×900 (desktop), 390×844 (mobile), zoom 100%, reference DPR 1 unless owner records different actual environment. Capture at least these separately:
1. Authenticated, **no** collection selected, repository tab active, dropdown closed.
2. A real selected collection, **dropdown open**, zero-document badge; compare selector/header/table **hierarchy**, not fake row contents.
3. Selected collection, **research** tab active, unavailable frame.
4. Create/rename/delete dialogs, validation and server-error variants.
5. Narrow viewport with long Unicode collection name, menu open and scroll/keyboard checks.

**Compare geometry, spacing, alignment, typography hierarchy, overlay layering, focus and responsiveness**, not raw pixel similarity for fabricated file content or a different app shell. Document each divergence as <code>accepted shell difference</code>, <code>intentional P02 disabled state</code>, or <code>bug to fix</code>. Do not “fix” the prototype's inconsistent visible tab state by making production tabs inconsistent.

## D. Manual run sequence (stop after each check)

| Sequence | Owner edits | Minimum local check |
| --- | --- | --- |
| 1 | Task 10: types → constants → API adapter → protected route | <code>npm --prefix src/apps/Blocks.Web run build</code> + API test |
| 2 | Task 11–12: actor keys/lifecycle → URL parser/hooks | Focused hook tests, no A/B data leak |
| 3 | Task 13: selector/layout title + paging/states | Selector tests with 51 and duplicate-name fixtures |
| 4 | Task 14: dialogs + mutation wiring | Dialog tests, pending/soft-error/race checks |
| 5 | Task 15: honest repository/research frames and styling | Tab tests + desktop/mobile visual comparison |
| 6 | Task 16: regressions | <code>npm --prefix src/apps/Blocks.Web test</code>, <code>run build</code>, <code>run lint</code> |
| 7 | Task 17–18: approved integration and visual evidence | Real-authorized scenarios + screenshot/deviation ledger |

Run commands as the owner after prerequisites; this document did **not** execute any of them. Exact output, screenshots and acceptance belong in the eventual P02 outcome, **not** in this guide.

## E. Acceptance / stop conditions

**Ready for review:** all P02 API/URL/actor/security rules hold, all shadcn primitives are reused from current local source, all visual regions of the feature are represented without fake functionality, tab/dialog keyboard behavior is accessible, and tested differences from the approved mockup are recorded.

**Stop rather than guess** when API DTO differs from accepted spec, original reference cannot be reproduced, current branch changed significantly, a permission or DB action requires ungranted approval, or the owner prefers functioning upload/AI UI now — that last choice is a **scope change to P03+**, not styling work.

### External API docs (advisory; repository implementations win)

- shadcn/ui concept: https://ui.shadcn.com/docs
- shadcn/ui Radix Popover: https://ui.shadcn.com/docs/components/radix/popover
- shadcn/ui React Hook Form: https://ui.shadcn.com/docs/forms/react-hook-form
- TanStack Query cancellation: https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation
- React Router search params: https://reactrouter.com/api/hooks/useSearchParams
