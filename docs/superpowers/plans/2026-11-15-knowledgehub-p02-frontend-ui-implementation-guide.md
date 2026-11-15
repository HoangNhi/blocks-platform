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

## Task 11 — Isolate TanStack Query cache by actor: implement each file

**Goal:** Read results and mutations belong to the authenticated actor. Actor A's responses, open forms and pending effects must not leak into B after logout/account switch. This is NOT a new authentication system. It assumes Task 10's typed <code>collectionsApi</code> exists.

### Checklist 11.1 — Create: <code>src/features/knowledgehub/hooks/collection-query-keys.ts</code>

Copy the complete module below. The top-level prefix isolates this feature from Faculty/System caches. List/detail keys also partition by user ID:

~~~ts
export const collectionKeys = {
  all: ["knowledgehub"] as const,
  actor: (actorId: string) => ["knowledgehub", actorId] as const,
  lists: (actorId: string) =>
    [...collectionKeys.actor(actorId), "collections"] as const,
  detail: (actorId: string, id: string) =>
    [...collectionKeys.actor(actorId), "detail", id] as const,
};
~~~

**Explain:** <code>["knowledgehub", "actor-A", "collections"]</code> must never be reused for <code>actor-B</code>. Collection identity uses UUID, not Name. For the infinite paginated selector, page numbers are stored as part of TanStack Query's <code>pageParams</code> (Task 13) under the actor's list key. Never call <code>queryClient.clear()</code> here.

### Checklist 11.2 — Create: <code>src/features/knowledgehub/hooks/KnowledgeHubCacheBoundary.tsx</code>

This boundary stays mounted above the feature route so a pending mutation from an unmounted page can still compare its initiating identity to the current identity. <code>version</code> also prevents an old A session from counting as a new A session after logout/relogin.

~~~tsx
import {
  createContext, useContext, useEffect, useRef,
  type ReactNode, type RefObject,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { collectionKeys } from "./collection-query-keys";

export type KnowledgeHubSession = Readonly<{
  actorId: string | null;
  version: number;
}>;

const SessionContext =
  createContext<RefObject<KnowledgeHubSession> | null>(null);

export function useKnowledgeHubSession() {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("KnowledgeHubCacheBoundary is required");
  }
  return session;
}

export function KnowledgeHubCacheBoundary({
  children,
}: { children: ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();
  const queryClient = useQueryClient();
  const actorId = !loading && isAuthenticated ? (user?.Id ?? null) : null;

  const current = useRef<KnowledgeHubSession>({ actorId: null, version: 0 });
  const previousActorId = current.current.actorId;

  // Maintain an immutable identity token for each login/account transition.
  if (previousActorId !== actorId) {
    current.current = {
      actorId,
      version: current.current.version + 1,
    };
  }

  useEffect(() => {
    if (!previousActorId || previousActorId === actorId) return;
    const key = collectionKeys.actor(previousActorId);

    // Never globally clear unrelated queries.
    void queryClient.cancelQueries({ queryKey: key }).then(() => {
      queryClient.removeQueries({ queryKey: key });
    });
  }, [previousActorId, actorId, queryClient]);

  return (
    <SessionContext.Provider value={current}>
      {children}
    </SessionContext.Provider>
  );
}
~~~

**Security note:** This illustrates the account-transition boundary, not server authorization. A complete Task 11 review must exercise fast A→B→A transitions, cancellation-vs-removal races and error branches. If the client remains mounted while login changes tokens without updating <code>user</code>, make AuthContext's existing lifecycle reconcile that transition; do not trust a JWT ID derived from localStorage as backend authority.

### Checklist 11.3 — Modify existing <code>src/App.tsx</code>

Current source renders <code>Router</code> and <code>Toaster</code> within a top-level div. Add **one import** and wrap Router in the boundary; this works because <code>main.tsx</code> already mounts <code>App</code> inside <code>QueryClientProvider</code> and <code>AuthProvider</code>:

~~~tsx
import { KnowledgeHubCacheBoundary } from
  "@/features/knowledgehub/hooks/KnowledgeHubCacheBoundary";
~~~

Replace only the existing <code>&lt;Router /&gt;</code> in <code>App.tsx</code> with:

~~~tsx
<KnowledgeHubCacheBoundary>
  <Router />
</KnowledgeHubCacheBoundary>
~~~

Do not add a second QueryClient, BrowserRouter, AuthProvider, SidebarProvider or custom refresh-token interceptor. Leave <code>Toaster</code> unchanged.

### Checklist 11.4 — Create: <code>src/features/knowledgehub/hooks/useCollections.ts</code>

Use <code>useInfiniteQuery</code> for the selector (Task 13) and <code>useQuery</code> for independent selected detail (Task 12). This covers both “selected collection lives on another page” and “more than 50 collections”. Both requests consume the AbortSignal forwarded through Task 10's API adapter.

~~~ts
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { collectionsApi } from "../api/collections.api";
import { collectionKeys } from "./collection-query-keys";
import type { Selection } from "./useCollectionSelection";

const PAGE_SIZE = 50;

export function useCollections(actorId: string | null, canView: boolean) {
  return useInfiniteQuery({
    queryKey: collectionKeys.lists(actorId ?? "signed-out"),
    enabled: Boolean(actorId && canView),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      if (!actorId) throw new Error("Chưa xác thực");
      return collectionsApi.list(
        { page_index: pageParam, page_size: PAGE_SIZE }, signal
      );
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, page) => n + page.Data.length, 0);
      if (lastPage.Data.length === 0 || loaded >= lastPage.TotalRow) {
        return undefined;
      }
      return lastPage.PageIndex + 1;
    },
    retry: false,
  });
}

export function useCollectionDetail(
  actorId: string | null,
  canView: boolean,
  selection: Selection,
) {
  const id = selection.state === "selected" ? selection.id : null;
  return useQuery({
    queryKey: collectionKeys.detail(
      actorId ?? "signed-out", id ?? "no-selection"
    ),
    enabled: Boolean(actorId && canView && id),
    queryFn: ({ signal }) => {
      if (!id) throw new Error("Chưa chọn bộ sưu tập");
      return collectionsApi.detail(id, signal);
    },
    retry: false,
  });
}
~~~

**Why not <code>keepPreviousData</code>?** During URL A→B or actor A→B, displaying A's previous private detail is unacceptable. <code>enabled=false</code> is not a loading state; render no-selection/invalid states explicitly.

### Checklist 11.5 — Create test: <code>src/features/knowledgehub/hooks/collection-query-keys.test.ts</code>

~~~ts
import { describe, expect, it } from "vitest";
import { collectionKeys } from "./collection-query-keys";

describe("KnowledgeHub private query keys", () => {
  it("separates two actors and two collection ids", () => {
    expect(collectionKeys.lists("A")).not.toEqual(collectionKeys.lists("B"));
    expect(collectionKeys.detail("A", "one")).not.toEqual(
      collectionKeys.detail("A", "two")
    );
    expect(collectionKeys.lists("A")[0]).toBe("knowledgehub");
  });
});
~~~

**Additional integration tests to write now:** render the boundary with a test QueryClient; prefill A/B's detail keys; switch mocked <code>useAuth</code> A→B; assert A's keys disappear and B's remain; hold A's GET using a deferred Promise and check its AbortSignal; switch to logout and assert no A rows are rendered. Mutations need the extra session-token guard in Task 14, not merely query key isolation.

**Done Task 11 when:** this test passes and actor A's cached/in-flight read cannot be rendered as actor B's. Record commands and results; do not claim passing coverage without running them.

---

## Task 12 — URL-only selection: complete parser and navigation operations

**Goal:** the ONLY selected collection identity is <code>c</code> in the current React Router URL. No <code>selectedId</code> state, localStorage selection, first-row auto-select or silently “fixing” invalid URLs.

### Checklist 12.1 — Create: <code>src/features/knowledgehub/hooks/useCollectionSelection.ts</code>

This is a complete example, including an imperative “read current location” method used by late mutation callbacks. It uses <code>useLocation</code> and <code>useNavigate</code> so it also works inside a <code>MemoryRouter</code> test.

~~~ts
import { useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export type Selection =
  | { state: "none" }
  | { state: "invalid" }
  | { state: "selected"; id: string };

export function parseSelection(params: URLSearchParams): Selection {
  const values = params.getAll("c");
  if (values.length === 0) return { state: "none" };
  if (
    values.length !== 1 ||
    !UUID.test(values[0]) ||
    values[0].toLowerCase() === ZERO_UUID
  ) {
    return { state: "invalid" };
  }
  return { state: "selected", id: values[0].toLowerCase() };
}

export function useCollectionSelection() {
  const location = useLocation();
  const navigate = useNavigate();
  const latest = useRef(location);
  latest.current = location;

  const getCurrent = useCallback(
    () => parseSelection(new URLSearchParams(latest.current.search)), []
  );

  const select = useCallback((id: string) => {
    if (!UUID.test(id) || id.toLowerCase() === ZERO_UUID) return;
    const now = latest.current;
    if (now.pathname !== "/knowledgehub") return;
    const next = new URLSearchParams(now.search);
    next.set("c", id.toLowerCase());
    navigate({
      pathname: now.pathname,
      search: "?" + next.toString(),
      hash: now.hash,
    }, { replace: false }); // explicit selection PUSHES history
  }, [navigate]);

  const clearIfSelected = useCallback((deletedId: string) => {
    const now = latest.current;
    if (now.pathname !== "/knowledgehub") return;
    const next = new URLSearchParams(now.search);
    const selection = parseSelection(next);
    if (
      selection.state !== "selected" ||
      selection.id !== deletedId.toLowerCase()
    ) return;
    next.delete("c"); // preserve unrelated keys
    navigate({
      pathname: now.pathname,
      search: next.toString() ? "?" + next.toString() : "",
      hash: now.hash,
    }, { replace: true }); // selected delete REPLACES history
  }, [navigate]);

  return {
    selection: parseSelection(new URLSearchParams(location.search)),
    getCurrent,
    select,
    clearIfSelected,
  };
}
~~~

**Review points:** Repeated <code>c</code> is invalid, including <code>?c=a&c=b</code>. A missing <code>c</code> is different from <code>?c=</code>. One valid nonzero UUID makes a detail request even when that collection is not on the currently loaded selector page. A 404 for missing/deleted/foreign IDs gets the **same** unavailable UI (Task 15).

### Checklist 12.2 — Connect to the detail hook

Inside <code>KnowledgeHubPage.tsx</code> when you assemble Task 15, the exact order is:

~~~tsx
const { selection, select, clearIfSelected, getCurrent } =
  useCollectionSelection();
const detail = useCollectionDetail(actorId, canView, selection);
~~~

Do **not** replace <code>selection</code> with another <code>useState</code>. The page passes <code>select</code> to the collection selector and <code>clearIfSelected</code> to the successful delete mutation.

### Checklist 12.3 — Create test: <code>src/features/knowledgehub/hooks/useCollectionSelection.test.tsx</code>

~~~tsx
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { parseSelection, useCollectionSelection } from "./useCollectionSelection";

const ID = "11111111-1111-1111-1111-111111111111";

function Probe() {
  const { selection, select, clearIfSelected } = useCollectionSelection();
  const location = useLocation();
  return (
    <div>
      <p data-testid="state">{selection.state}</p>
      <p data-testid="url">{location.search}</p>
      <button onClick={() => select(ID)}>Chọn</button>
      <button onClick={() => clearIfSelected(ID)}>Xóa đã chọn</button>
    </div>
  );
}

describe("URL-only collection selection", () => {
  it("rejects absent-vs-invalid, repeated, empty and zero c", () => {
    expect(parseSelection(new URLSearchParams()).state).toBe("none");
    expect(parseSelection(new URLSearchParams("c=")).state).toBe("invalid");
    expect(parseSelection(new URLSearchParams("c=x&c=y")).state).toBe("invalid");
    expect(parseSelection(new URLSearchParams(
      "c=00000000-0000-0000-0000-000000000000"
    )).state).toBe("invalid");
  });

  it("preserves unrelated query parameters", () => {
    render(<MemoryRouter initialEntries={["/knowledgehub?view=compact"]}>
      <Probe />
    </MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Chọn" }));
    expect(screen.getByTestId("url").textContent).toContain("view=compact");
    expect(screen.getByTestId("url").textContent).toContain("c=" + ID);
    fireEvent.click(screen.getByRole("button", { name: "Xóa đã chọn" }));
    expect(screen.getByTestId("url").textContent).toBe("?view=compact");
  });
});
~~~

**Additional tests:** Use a memory history stack and Back/Forward to ensure selection pushes, delete replaces; fire a detail response for A **after** selecting B and confirm B remains visible. Test that another ID's delete never clears current <code>c</code>, and that invalid query params trigger no detail API call.

**Done Task 12 when:** URL selection survives refresh/Back/Forward, duplicate invalid keys cause zero detail calls, and deletion clears only a still-matching selected ID.

---

## Task 13 — Build the exact collection header and paginated selector

**Goal:** Match the mockup's header + dropdown hierarchy while showing real collection data and never implying there are actual documents. The existing <code>ui/combobox.tsx</code> cannot be copied verbatim because its <code>CommandItem value</code> uses the visible name, which may be duplicated; compose existing shadcn primitives instead.

### Checklist 13.1 — Create: <code>src/features/knowledgehub/components/CollectionSelector.tsx</code>

Dependencies **already installed**: <code>ui/button.tsx</code>, <code>ui/popover.tsx</code>, <code>ui/command.tsx</code>, Lucide. Do not create new generic Button/Dropdown, import Stitch HTML/CSS/CDN or install another combobox library.

~~~tsx
import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from "@/components/ui/command";
import type { CollectionDto } from "../types/collections.types";

interface Props {
  collections: CollectionDto[];
  selected: CollectionDto | null;
  selectedId: string | null;
  listLoading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  errorMessage: string | null;
  canCreate: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onLoadMore: () => void;
}

export function CollectionSelector({
  collections, selected, selectedId, listLoading, loadingMore,
  hasMore, errorMessage, canCreate, onSelect, onCreate, onLoadMore,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label="Chọn bộ sưu tập"
          aria-expanded={open}
          className="h-auto min-w-0 max-w-full justify-start px-1 text-left text-xl font-semibold"
        >
          <span className="min-w-0 truncate">
            {"Bộ sưu tập: " + (selected?.Name ?? "Chưa chọn")}
          </span>
          <ChevronDown className="size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <Command>
          <CommandInput placeholder="Tìm trong các bộ sưu tập đã tải..." />
          <CommandList>
            {listLoading && collections.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">Đang tải...</p>
            )}
            {errorMessage && (
              <p role="alert" className="p-3 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
            <CommandEmpty>
              Không có kết quả trong các bộ sưu tập đã tải.
            </CommandEmpty>
            <CommandGroup heading="Bộ sưu tập hiện có">
              {collections.map((collection) => (
                <CommandItem
                  key={collection.Id}
                  value={collection.Id}
                  keywords={[collection.Name]}
                  onSelect={() => {
                    onSelect(collection.Id);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {collection.Name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {collection.Id.slice(0, 8)}
                  </span>
                  {selectedId === collection.Id && (
                    <Check className="size-4" aria-hidden="true" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {hasMore && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                className="w-full"
                disabled={loadingMore}
                onClick={onLoadMore}
              >
                {loadingMore ? "Đang tải thêm..." : "Tải thêm bộ sưu tập"}
              </Button>
            </div>
          )}
          {canCreate && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  setOpen(false);
                  onCreate();
                }}
              >
                <Plus className="size-4" />
                Tạo bộ sưu tập mới
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
~~~

**Why UUID + keywords?** The UUID is the React key and <code>CommandItem.value</code>; <code>keywords={[Name]}</code> makes the name searchable without using it as identity. Eight initial UUID characters are shown to distinguish two identically named collections; the full UUID is still the mutation target. Search only examines the **loaded** pages, not all server records. The load-more button is outside the filtered CommandList so searching cannot accidentally hide paging.

### Checklist 13.2 — Create: <code>src/features/knowledgehub/components/CollectionState.tsx</code>

Use this small presentational state component in both tabs, not a fake documents table. No new state store is needed.

~~~tsx
export type CollectionContentState =
  | "none" | "invalid" | "loading" | "unavailable"
  | "denied" | "outage" | "ready";

const copy: Record<Exclude<CollectionContentState, "ready">, string> = {
  none: "Hãy chọn hoặc tạo một bộ sưu tập để bắt đầu.",
  invalid: "Liên kết bộ sưu tập không hợp lệ. Hãy chọn lại từ danh sách.",
  loading: "Đang tải bộ sưu tập...",
  unavailable: "Bộ sưu tập không tồn tại hoặc bạn không có quyền truy cập.",
  denied: "Bạn chưa được cấp quyền xem KnowledgeHub.",
  outage: "Dịch vụ KnowledgeHub đang tạm thời không khả dụng.",
};

export function CollectionState({
  state,
}: { state: Exclude<CollectionContentState, "ready"> }) {
  return (
    <div
      role={state === "loading" ? "status" : "alert"}
      className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
    >
      {copy[state]}
    </div>
  );
}
~~~

Never distinguish “foreign ID” from “deleted ID” in visible copy: both must be indistinguishable 404 states.

### Checklist 13.3 — Connect infinite paging in <code>routes/KnowledgeHubPage.tsx</code> (Task 15)

The Task 11 hook already returns <code>data.pages</code>, <code>fetchNextPage</code>, <code>hasNextPage</code> and <code>isFetchingNextPage</code>. Flatten and deduplicate **by UUID**:

~~~tsx
const list = useCollections(actorId, canView);
const collections = Array.from(
  new Map(
    (list.data?.pages.flatMap((page) => page.Data) ?? [])
      .map((item) => [item.Id, item] as const)
  ).values()
);

// Pass to CollectionSelector:
<CollectionSelector
  collections={collections}
  selected={selectedCollection}
  selectedId={selectedId}
  listLoading={list.isLoading}
  loadingMore={list.isFetchingNextPage}
  hasMore={list.hasNextPage === true}
  errorMessage={list.isError ? "Không thể tải danh sách bộ sưu tập." : null}
  canCreate={canCreate}
  onSelect={select}
  onCreate={() => setDialogMode("create")}
  onLoadMore={() => {
    if (list.hasNextPage && !list.isFetching) {
      void list.fetchNextPage();
    }
  }}
/>
~~~

This is a **fragment** of the final page; the complete page assembly appears in Task 15. Avoid <code>useState(collections)</code> duplicating TanStack Query's server state. The <code>DocumentCount</code> badge comes from the **selected detail DTO** only and equals zero in P02; no sample “4 tài liệu”.

### Checklist 13.4 — Create test: <code>src/features/knowledgehub/components/CollectionSelector.test.tsx</code>

Start with a fixture factory with **two identical names but different UUIDs**, then render the selector with <code>selected=null</code>, <code>onSelect=vi.fn()</code>:

~~~tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CollectionSelector } from "./CollectionSelector";
import type { CollectionDto } from "../types/collections.types";

const make = (id: string): CollectionDto => ({
  Id: id, Name: "Backend Engineering", Description: null,
  CreatedAt: "2026-11-01T00:00:00Z",
  UpdatedAt: "2026-11-01T00:00:00Z",
  DocumentCount: 0,
});

describe("Collection selector", () => {
  it("selects duplicate names by UUID, not display text", () => {
    const a = make("11111111-1111-1111-1111-111111111111");
    const b = make("22222222-2222-2222-2222-222222222222");
    const onSelect = vi.fn();
    render(
      <CollectionSelector
        collections={[a, b]} selected={null} selectedId={null}
        listLoading={false} loadingMore={false} hasMore={false}
        errorMessage={null} canCreate={false}
        onSelect={onSelect} onCreate={vi.fn()} onLoadMore={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Chọn bộ sưu tập" }));
    fireEvent.click(screen.getByText("22222222"));
    expect(onSelect).toHaveBeenCalledWith(b.Id);
  });
});
~~~

Add tests for: 51 fixtures with <code>hasMore</code> and click “Tải thêm”; pending disables double request; create affordance absent when <code>canCreate=false</code>; error text is distinct from empty list; keyboard navigation with Enter and Escape; long name truncation and mobile width.

**Done Task 13 when:** 51st collection is reachable, duplicate names select the correct UUID, off-page direct link works through detail endpoint and there are no made-up document rows/counts.

---

## Task 14 — Create/edit/delete dialogs and actor-safe mutations, file by file

**Goal:** Assemble existing shadcn Dialog/Form components, React Hook Form + Zod 4 and TanStack mutations. Validate Unicode **code points** rather than UTF-16 units. The browser never generates collection IDs or sends ownership/deletion fields.

### Checklist 14.1 — Create: <code>src/features/knowledgehub/components/collection-form.schema.ts</code>

Do normalization in a tiny testable module. Keep form values as strings for <code>react-hook-form</code>; transform to API input only on submit. This avoids resolver input/output type mismatches. Final validation remains on the backend.

~~~ts
import * as z from "zod";
import type { CollectionInput } from "../types/collections.types";

const validCount = (value: string, limit: number) =>
  Array.from(value.trim()).length <= limit;

export const collectionFormSchema = z.object({
  Name: z.string()
    .refine((v) => !v.includes("\0"), "Tên không được chứa NUL")
    .refine((v) => v.trim().length > 0, "Tên bộ sưu tập là bắt buộc")
    .refine((v) => validCount(v, 200), "Tên tối đa 200 ký tự"),
  Description: z.string()
    .refine((v) => !v.includes("\0"), "Mô tả không được chứa NUL")
    .refine((v) => validCount(v, 2000), "Mô tả tối đa 2000 ký tự"),
});
export type CollectionFormValues = z.infer<typeof collectionFormSchema>;

export function toCollectionInput(v: CollectionFormValues): CollectionInput {
  return {
    Name: v.Name.trim(),
    Description: v.Description.trim() || null,
  };
}
~~~

**Note:** JavaScript <code>"😀".length</code> is 2, whereas <code>Array.from("😀").length</code> is 1. Do **not** set an HTML <code>maxLength=200</code> as the sole validator, because it measures UTF-16 units. Compare frontend normalization against real backend behavior on rare Unicode whitespace; backend is authoritative.

### Checklist 14.2 — Create: <code>src/features/knowledgehub/components/CollectionFormDialog.tsx</code>

Reuse local <code>ui/dialog.tsx</code>, <code>ui/form.tsx</code>, <code>ui/input.tsx</code>, <code>ui/textarea.tsx</code>, <code>ui/button.tsx</code>. Do NOT recreate the Dialog or use the Faculty form's browser-generated UUID.

~~~tsx
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import type { CollectionDto, CollectionInput } from "../types/collections.types";
import {
  collectionFormSchema, toCollectionInput, type CollectionFormValues,
} from "./collection-form.schema";

interface Props {
  open: boolean;
  mode: "create" | "edit";
  initial: CollectionDto | null;
  pending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CollectionInput) => Promise<void>;
}

export function CollectionFormDialog({
  open, mode, initial, pending, error, onOpenChange, onSubmit,
}: Props) {
  const form = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: { Name: "", Description: "" },
  });
  const { reset } = form;

  useEffect(() => {
    if (open) {
      reset({
        Name: mode === "edit" ? (initial?.Name ?? "") : "",
        Description: mode === "edit" ? (initial?.Description ?? "") : "",
      });
    }
    // Reset on opening or changing the target, not on an error/refetch.
  }, [open, mode, initial?.Id, reset]);

  const requestOpenChange = (next: boolean) => {
    if (!pending) onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent
        showCloseButton={!pending}
        onInteractOutside={(e) => { if (pending) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (pending) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Tạo bộ sưu tập" : "Đổi tên bộ sưu tập"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await onSubmit(toCollectionInput(values));
              } catch {
                // The parent supplies the real API error through the error prop.
              }
            })}
          >
            <FormField control={form.control} name="Name" render={({ field }) => (
              <FormItem>
                <FormLabel>Tên bộ sưu tập *</FormLabel>
                <FormControl>
                  <Input {...field} aria-label="Tên bộ sưu tập" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="Description" render={({ field }) => (
              <FormItem>
                <FormLabel>Mô tả</FormLabel>
                <FormControl>
                  <Textarea {...field} aria-label="Mô tả" rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {error && (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            )}
            <DialogFooter>
              <Button
                type="button" variant="outline"
                disabled={pending}
                onClick={() => requestOpenChange(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={pending || form.formState.isSubmitting}>
                {pending ? "Đang lưu..." : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
~~~

**Required behavior:** On API 400/403/503 or network uncertainty, keep the dialog, input and URL unchanged. Pending dismiss/escape is blocked; do not show a success toast until API application <code>Success=true</code> (Task 10 adapter throws otherwise). Use only <code>Name</code> and <code>Description</code> in the request body. PUT sends both fields; an empty description becomes null. Duplicate names are legal.

### Checklist 14.3 — Create: <code>src/features/knowledgehub/hooks/useCollectionMutations.ts</code>

This file is the **critical bridge** the earlier companion was missing. Mutation variables capture the stable <code>KnowledgeHubSession</code> object from Task 11. Late A completions are ignored if the boundary now represents B or a new login session. <code>getCurrent()</code> avoids hijacking selection if the user navigated to another collection while create was pending.

~~~ts
import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { collectionsApi } from "../api/collections.api";
import type { CollectionInput } from "../types/collections.types";
import { collectionKeys } from "./collection-query-keys";
import {
  useKnowledgeHubSession, type KnowledgeHubSession,
} from "./KnowledgeHubCacheBoundary";
import type { Selection } from "./useCollectionSelection";

type Navigation = {
  select: (id: string) => void;
  clearIfSelected: (id: string) => void;
  getCurrent: () => Selection;
};
type BaseArgs = { guard: KnowledgeHubSession };
type CreateArgs = BaseArgs & {
  input: CollectionInput; selectionBefore: string;
};
type EditArgs = BaseArgs & { id: string; input: CollectionInput };
type DeleteArgs = BaseArgs & { id: string };

export function useCollectionMutations(
  actorId: string | null,
  navigation: Navigation
) {
  const client = useQueryClient();
  const currentSession = useKnowledgeHubSession();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const isCurrent = (guard: KnowledgeHubSession) =>
    mounted.current && currentSession.current === guard;

  const capture = () => {
    const guard = currentSession.current;
    if (!actorId || guard.actorId !== actorId) {
      throw new Error("Tài khoản đã thay đổi; vui lòng thử lại.");
    }
    return guard;
  };

  const create = useMutation({
    mutationFn: (v: CreateArgs) => collectionsApi.create(v.input),
    onSuccess: (created, v) => {
      if (!isCurrent(v.guard) || !v.guard.actorId) return;
      void client.invalidateQueries({
        queryKey: collectionKeys.lists(v.guard.actorId),
      });
      // A deliberate user selection after submit takes priority.
      if (JSON.stringify(navigation.getCurrent()) === v.selectionBefore) {
        navigation.select(created.Id);
      }
      toast.success("Đã tạo bộ sưu tập");
    },
  });

  const rename = useMutation({
    mutationFn: (v: EditArgs) => collectionsApi.update(v.id, v.input),
    onSuccess: (updated, v) => {
      if (!isCurrent(v.guard) || !v.guard.actorId) return;
      client.setQueryData(
        collectionKeys.detail(v.guard.actorId, v.id), updated
      );
      void client.invalidateQueries({
        queryKey: collectionKeys.lists(v.guard.actorId),
      });
      toast.success("Đã cập nhật bộ sưu tập");
    },
  });

  const remove = useMutation({
    mutationFn: (v: DeleteArgs) => collectionsApi.remove(v.id),
    onSuccess: (_deleted, v) => {
      if (!isCurrent(v.guard) || !v.guard.actorId) return;
      client.removeQueries({
        queryKey: collectionKeys.detail(v.guard.actorId, v.id),
        exact: true,
      });
      void client.invalidateQueries({
        queryKey: collectionKeys.lists(v.guard.actorId),
      });
      navigation.clearIfSelected(v.id);
      toast.success("Đã xóa bộ sưu tập");
    },
  });

  const createCollection = async (input: CollectionInput) => {
    const guard = capture();
    const created = await create.mutateAsync({
      guard, input,
      selectionBefore: JSON.stringify(navigation.getCurrent()),
    });
    return isCurrent(guard) ? created : null;
  };

  const renameCollection = async (id: string, input: CollectionInput) => {
    const guard = capture();
    const updated = await rename.mutateAsync({ guard, id, input });
    return isCurrent(guard) ? updated : null;
  };

  const deleteCollection = async (id: string) => {
    const guard = capture();
    const deleted = await remove.mutateAsync({ guard, id });
    return isCurrent(guard) ? deleted : null;
  };

  return {
    create, rename, remove,
    createCollection, renameCollection, deleteCollection,
  };
}
~~~

**Important race checks:** This example has **no optimistic mutation**, no frontend authority over actor ID, and no retry after uncertain create. In addition to current actor, test route unmount and A→B→A. A pending mutation can still finish on the server; UI ignoring stale effects does not undo committed database writes. The next explicit refetch establishes truth.

### Checklist 14.4 — Create: <code>src/features/knowledgehub/components/CollectionDeleteDialog.tsx</code>

Reuse the repository's existing <code>ConfirmDeleteDialog</code>. It offers <code>stopAutoClose</code>, pending loading and destructive styling. Show a name **and UUID fragment** because duplicate names are allowed.

~~~tsx
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { CollectionDto } from "../types/collections.types";

interface Props {
  target: CollectionDto | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CollectionDeleteDialog({
  target, pending, error, onCancel, onConfirm,
}: Props) {
  return (
    <>
      <ConfirmDeleteDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !pending) onCancel();
        }}
        title="Xác nhận xóa bộ sưu tập"
        description={
          target
            ? "Xóa bộ sưu tập " + target.Name +
              " (ID: " + target.Id.slice(0, 8) +
              ")? Bộ sưu tập sẽ bị ẩn; P02 không hỗ trợ khôi phục."
            : ""
        }
        isLoading={pending}
        stopAutoClose
        confirmVariant="destructive"
        confirmText="Xóa bộ sưu tập"
        onConfirm={() => { if (target && !pending) onConfirm(); }}
      />
      {target && error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}
    </>
  );
}
~~~

**Important UI caution:** This wrapper renders API error text below the dialog portal, which is not ideal for screen readers or visibility. For production quality, either (a) adapt the existing generic dialog to accept an optional error slot without changing its behavior for other callers, or (b) implement a **feature-level** Dialog composed of the already installed <code>ui/dialog</code> primitives so <code>role=alert</code> appears inside <code>DialogContent</code>. Do not rewrite the shadcn Dialog primitive itself. Test error is actually visible inside the modal before marking Task 14 done.

### Checklist 14.5 — Create test: <code>src/features/knowledgehub/components/collection-form.schema.test.ts</code>

~~~ts
import { describe, expect, it } from "vitest";
import { collectionFormSchema, toCollectionInput } from "./collection-form.schema";

describe("collection form normalization", () => {
  it("trims values and converts blank description to null", () => {
    const v = collectionFormSchema.parse({
      Name: "  Kiến thức  ", Description: "   ",
    });
    expect(toCollectionInput(v)).toEqual({
      Name: "Kiến thức", Description: null,
    });
  });

  it("counts supplementary Unicode as one code point", () => {
    expect(collectionFormSchema.safeParse({
      Name: "😀".repeat(200), Description: "",
    }).success).toBe(true);
    expect(collectionFormSchema.safeParse({
      Name: "😀".repeat(201), Description: "",
    }).success).toBe(false);
  });

  it("rejects blank Name and embedded NUL", () => {
    expect(collectionFormSchema.safeParse({
      Name: "   ", Description: "",
    }).success).toBe(false);
    expect(collectionFormSchema.safeParse({
      Name: "valid\0bad", Description: "",
    }).success).toBe(false);
  });
});
~~~

### Checklist 14.6 — Add integration tests beside mutations and dialogs

Create <code>hooks/useCollectionMutations.test.tsx</code>, <code>components/CollectionFormDialog.test.tsx</code> and <code>components/CollectionDeleteDialog.test.tsx</code>. Use the real Task 10 adapter with mocked <code>api</code> or explicitly mocked <code>collectionsApi</code> and a fresh test QueryClient.

Verify all of:
1. POST sends **only** normalized <code>Name</code>, <code>Description</code>; owner/id/deletion fields absent. PUT includes both values even when description cleared.
2. <code>Success=false</code> 403/503 never closes dialog or changes <code>c</code>; input is preserved and <code>role=alert</code> is visible.
3. Consecutive clicks during pending create yield one request; no automatic retry after a timeout.
4. A→B transition while A create/rename/delete is pending: no B navigation/cache/toast from A's completion.
5. Delete confirmation displays the exact target ID fragment; deleting a different ID leaves the selected <code>c</code> intact.
6. Tab/Shift+Tab focus stays in Dialog, Escape/close works when idle, and focus returns after closing. Pending close is prevented.
7. Create success selects the returned server UUID (unless user deliberately selected another collection meanwhile). Rename does not clear <code>c</code>.

**Done Task 14 when:** create/edit/delete use only existing shadcn primitives, strict API envelopes, permissions, actor-safe mutation results and tested accessible dialogs; do not mark done merely because the form opens.

---

## Task 15 — Assemble the two mockup tab frames in React, exact files

**Goal:** Recreate the mockup's **feature hierarchy** inside the existing Blocks MainLayout. The 1280×1024 reference depicts an already-populated fake repository and a dropdown-open state; those data and fake progress bars are **not** P02 behavior. The agreed initial tab is Repository/Import, not the prototype's inconsistent active tab.

### Checklist 15.1 — Create: <code>src/features/knowledgehub/components/RepositoryFrame.tsx</code>

Reuse installed Card, Button and Lucide; no file input, drag event, API call, status filters or uploaded documents. The visual drop-zone is intentionally disabled until P03.

~~~tsx
import { CloudUpload, FolderOpen, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CollectionState, type CollectionContentState,
} from "./CollectionState";

export function RepositoryFrame({
  state,
}: { state: CollectionContentState }) {
  if (state !== "ready") return <CollectionState state={state} />;

  return (
    <div className="grid min-w-0 gap-5">
      <Card className="border-dashed bg-muted/40 py-0 shadow-none">
        <CardContent className="flex flex-col items-center gap-3 p-7 text-center">
          <div className="rounded-xl bg-background p-3">
            <CloudUpload className="size-7 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold">Kho tài liệu & Import</h2>
          <p className="max-w-lg text-sm text-muted-foreground">
            Tính năng tải và xử lý PDF, Markdown, TXT sẽ được phát triển
            ở giai đoạn tiếp theo.
          </p>
          <Button disabled>
            <LockKeyhole className="size-4" />
            Tải tài liệu (chưa khả dụng)
          </Button>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="size-4" />
            Tài liệu trong bộ sưu tập
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Chưa có tài liệu trong bộ sưu tập này.
        </CardContent>
      </Card>
    </div>
  );
}
~~~

**What not to copy from <code>code.html</code>:** <code>fileInput</code>, drop handlers, “PDF 50MB” claim, fake Clean Architecture rows, “Sẵn sàng (2)”, “Đang xử lý 72%”, delete/retry controls and pagination for nonexistent documents.

### Checklist 15.2 — Create: <code>src/features/knowledgehub/components/AskResearchFrame.tsx</code>

Use the same two-tab location as the prototype, but the actual Ask/Research function does not exist in P02. The UI must not contain fake answers, historical conversations, AI model names, citations or a usable composer.

~~~tsx
import { Bot, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CollectionState, type CollectionContentState,
} from "./CollectionState";

export function AskResearchFrame({
  state,
}: { state: CollectionContentState }) {
  if (state !== "ready") return <CollectionState state={state} />;

  return (
    <Card className="min-h-64 justify-center shadow-none">
      <CardContent className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-xl bg-muted p-4">
          <Bot className="size-8 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold">Hỏi đáp & Nghiên cứu</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Hỏi đáp theo tài liệu, tìm kiếm và trích dẫn sẽ khả dụng
          trong các giai đoạn KnowledgeHub tiếp theo.
        </p>
        <Button disabled variant="secondary">
          <LockKeyhole className="size-4" />
          Bắt đầu hỏi đáp (chưa khả dụng)
        </Button>
      </CardContent>
    </Card>
  );
}
~~~

### Checklist 15.3 — Create: <code>src/features/knowledgehub/routes/KnowledgeHubPage.tsx</code>

This is the complete **composition example** showing how earlier Task 11–14 files connect. Permission comes from the existing protected <code>MainLayout</code>'s Outlet context. The outer component is keyed by the current login-session version to reset open forms on actor change. It does not build another sidebar, global header or authentication flow.

~~~tsx
import { useState } from "react";
import { Pencil, Trash2, FolderOpen, Bot } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import type { GetPermissionByUser } from
  "@/features/system/types/role.types";
import type {
  CollectionDto, CollectionInput,
} from "../types/collections.types";
import { useKnowledgeHubSession } from "../hooks/KnowledgeHubCacheBoundary";
import { useCollectionSelection } from "../hooks/useCollectionSelection";
import { useCollections, useCollectionDetail } from "../hooks/useCollections";
import { useCollectionMutations } from "../hooks/useCollectionMutations";
import { CollectionSelector } from "../components/CollectionSelector";
import { CollectionFormDialog } from "../components/CollectionFormDialog";
import { CollectionDeleteDialog } from "../components/CollectionDeleteDialog";
import {
  type CollectionContentState,
} from "../components/CollectionState";
import { RepositoryFrame } from "../components/RepositoryFrame";
import { AskResearchFrame } from "../components/AskResearchFrame";

function KnowledgeHubWorkspace() {
  const { user, loading, isAuthenticated } = useAuth();
  const { permission } = useOutletContext<{
    permission: GetPermissionByUser | null;
  }>();
  const actorId = !loading && isAuthenticated ? (user?.Id ?? null) : null;
  const canView = permission?.IsViewed === true;
  const canCreate = permission?.IsAdded === true;
  const canEdit = permission?.IsUpdated === true;
  const canDelete = permission?.IsDeleted === true;

  const selectionApi = useCollectionSelection();
  const { selection, select } = selectionApi;
  const list = useCollections(actorId, canView);
  const detail = useCollectionDetail(actorId, canView, selection);
  const mutations = useCollectionMutations(actorId, selectionApi);

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<CollectionDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionDto | null>(null);

  const collections = Array.from(
    new Map(
      (list.data?.pages.flatMap((p) => p.Data) ?? [])
        .map((item) => [item.Id, item] as const)
    ).values()
  );

  const selectedId = selection.state === "selected" ? selection.id : null;
  const selected = selection.state === "selected" && detail.isSuccess
    ? (detail.data ?? null) : null;

  let state: CollectionContentState;
  if (!actorId || !canView) state = "denied";
  else if (selection.state === "none") state = "none";
  else if (selection.state === "invalid") state = "invalid";
  else if (detail.isLoading) state = "loading";
  else if (detail.isError) {
    const code = "statusCode" in detail.error
      ? detail.error.statusCode : undefined;
    state = code === 503 ? "outage" : "unavailable";
  } else state = detail.isSuccess ? "ready" : "loading";

  const openCreate = () => {
    if (!canCreate) return;
    mutations.create.reset();
    setEditTarget(null);
    setDialogMode("create");
  };
  const openEdit = () => {
    if (!canEdit || !selected) return;
    mutations.rename.reset();
    setEditTarget(selected);
    setDialogMode("edit");
  };

  const save = async (input: CollectionInput) => {
    if (dialogMode === "create") {
      const result = await mutations.createCollection(input);
      if (result) setDialogMode(null);
    } else if (editTarget) {
      const result = await mutations.renameCollection(editTarget.Id, input);
      if (result) {
        setEditTarget(null);
        setDialogMode(null);
      }
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await mutations.deleteCollection(deleteTarget.Id);
      if (result) setDeleteTarget(null);
    } catch {
      // The mutation.error is shown inside the confirmation dialog.
    }
  };

  const formError = dialogMode === "create"
    ? mutations.create.error?.message ?? null
    : mutations.rename.error?.message ?? null;
  const formPending = dialogMode === "create"
    ? mutations.create.isPending : mutations.rename.isPending;

  return (
    <section className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-5">
      <div className="flex min-w-0 flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-col gap-2">
          <CollectionSelector
            collections={collections}
            selected={selected}
            selectedId={selectedId}
            listLoading={list.isLoading}
            loadingMore={list.isFetchingNextPage}
            hasMore={list.hasNextPage === true}
            errorMessage={list.isError ? "Không thể tải danh sách bộ sưu tập." : null}
            canCreate={canCreate}
            onSelect={select}
            onCreate={openCreate}
            onLoadMore={() => {
              if (list.hasNextPage && !list.isFetching) {
                void list.fetchNextPage();
              }
            }}
          />
          {selected && (
            <Badge variant="secondary">
              {selected.DocumentCount + " tài liệu"}
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canEdit && (
            <Button
              variant="outline" size="sm"
              disabled={!selected || formPending}
              onClick={openEdit}
            >
              <Pencil className="size-4" /> Đổi tên
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline" size="sm"
              disabled={!selected || mutations.remove.isPending}
              onClick={() => {
                if (selected) {
                  mutations.remove.reset();
                  setDeleteTarget(selected);
                }
              }}
            >
              <Trash2 className="size-4" /> Xóa
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="repository" className="w-full min-w-0 gap-4">
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="repository">
            <FolderOpen className="size-4" />
            Kho tài liệu & Import
          </TabsTrigger>
          <TabsTrigger value="research">
            <Bot className="size-4" />
            Hỏi đáp & Nghiên cứu
          </TabsTrigger>
        </TabsList>
        <TabsContent value="repository" className="min-w-0">
          <RepositoryFrame state={state} />
        </TabsContent>
        <TabsContent value="research" className="min-w-0">
          <AskResearchFrame state={state} />
        </TabsContent>
      </Tabs>

      <CollectionFormDialog
        open={dialogMode !== null}
        mode={dialogMode === "edit" ? "edit" : "create"}
        initial={editTarget}
        pending={formPending}
        error={formError}
        onOpenChange={(open) => {
          if (!open && !formPending) {
            setDialogMode(null);
            setEditTarget(null);
          }
        }}
        onSubmit={save}
      />
      <CollectionDeleteDialog
        target={deleteTarget}
        pending={mutations.remove.isPending}
        error={mutations.remove.error?.message ?? null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { void confirmDelete(); }}
      />
    </section>
  );
}

export default function KnowledgeHubPage() {
  const { user } = useAuth(); // subscribe to authentication transitions
  const session = useKnowledgeHubSession();
  void user;
  return <KnowledgeHubWorkspace key={session.current.version} />;
}
~~~

**Review before adopting:** The import list assumes exact names from this companion's Tasks 10–14. The snippet illustrates assembly **after** those files exist; it does not mean the user's repo has them today. TypeScript should be checked locally: if a union error does not safely expose <code>statusCode</code>, narrow with <code>instanceof CollectionApiError</code> instead of assuming every network error is a KnowledgeHub soft error. The implementation must also reconcile confirmed changes on the branch before copying.

**Key rules encoded above:**
- Selected collection stays in URL, not React state.
- Refresh/Back/Forward still render based on <code>c</code>.
- List query is independent of detail query.
- Frontend permission controls fail closed; backend still checks permission and ownership.
- The selected collection's count is real DTO data (zero in P02).
- Create/edit/delete modal targets use actual UUIDs.
- No upload, documents, AI chat, citation or model name is fabricated.
- MainLayout continues to own global shell, breadcrumb, sidebar and scrolling.

### Checklist 15.4 — Test the two frames

Create <code>components/RepositoryFrame.test.tsx</code> and <code>components/AskResearchFrame.test.tsx</code> with real Testing Library render and simple assertions:

~~~tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RepositoryFrame } from "./RepositoryFrame";

describe("P02 repository truthfulness", () => {
  it("has an honest disabled upload placeholder and no fake files", () => {
    render(<RepositoryFrame state="ready" />);
    expect(screen.getByRole("button", {
      name: /Tải tài liệu.*chưa khả dụng/,
    })).toBeDisabled();
    expect(screen.getByText("Chưa có tài liệu trong bộ sưu tập này."))
      .toBeInTheDocument();
    expect(screen.queryByText(/Clean Architecture/)).not.toBeInTheDocument();
  });
});
~~~

Also test default <code>TabsTrigger value="repository"</code> is active, research tab toggles, switching tabs does not change <code>c</code>, and the no-selection/invalid/404/outage states render correct Vietnamese copy.

**Done Task 15 when:** feature hierarchy matches the approved mockup without duplicating MainLayout or presenting false working functionality; keyboard tabs work and all P02 states are truthful.

---

## Task 16 — Write actual behavior/failure/race tests (not just a list of topics)

**Goal:** build a reproducible test harness. These are mock tests with fake DTOs, not substitutes for Task 17 real integration.

### Checklist 16.1 — Create: <code>src/features/knowledgehub/test/renderKnowledgeHub.tsx</code>

Use a new QueryClient **per test** to avoid private cache state leaking between tests. Never use the production singleton or real credentials. Wrap an individual component in MemoryRouter and QueryClientProvider:

~~~tsx
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function renderKnowledgeHub(
  content: ReactNode,
  initialEntries: string[] = ["/knowledgehub"]
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={initialEntries}>
          {content}
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}
~~~

For a page test, additionally render a <code>Route</code> with <code>Outlet context={{permission: fakePermission}}</code>, mock <code>useAuth()</code> to supply actor identity, and mount a <code>KnowledgeHubCacheBoundary</code>. Keep these mocks **only inside tests**.

### Checklist 16.2 — Create an API contract test: <code>api/collections.api.test.ts</code>

Import the exact Task 10 module; spy on the existing <code>api.get/post/put/delete</code> methods. One minimum case:

~~~ts
import { afterEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { collectionsApi, CollectionApiError } from "./collections.api";

afterEach(() => vi.restoreAllMocks());

describe("KnowledgeHub soft HTTP 200 errors", () => {
  it("does not accept application 403 as query success", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      Success: false, StatusCode: 403, Message: "Không có quyền",
    } as never);
    await expect(collectionsApi.list({
      page_index: 1, page_size: 50,
    })).rejects.toBeInstanceOf(CollectionApiError);
  });
});
~~~

Repeat for application 400, 404 and 503; also POST/PUT/DELETE and successful PascalCase payload. For soft-401 refresh, test the **existing Axios client** with its fake transport at the proper integration layer: do not duplicate refresh logic in collections.api.

### Checklist 16.3 — Test navigation with memory history

In <code>hooks/useCollectionSelection.test.tsx</code>, extend Task 12's Probe:
1. Start <code>/knowledgehub?foo=1</code>, select UUID A, then B. Back must show A, Forward B.
2. Delete B: <code>replace</code> removes only <code>c</code>, preserving <code>foo=1</code>.
3. Invalid, repeated, zero <code>c</code> → zero detail requests.
4. An id outside the first 50 list rows still requests its detail by ID.
5. A's delayed detail response after B selection never paints as B.

### Checklist 16.4 — Test pending mutation races using deferred Promises

Create <code>hooks/useCollectionMutations.test.tsx</code> with a controlled unresolved Promise so you can change the authenticated test actor **before** completion:

~~~ts
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
~~~

Then write these test sequences against the mounted boundary + page:
- **A create pending → B login → A response resolves:** B's URL, cache, open dialogs and success toast unchanged.
- **A delete pending → B selects another collection → A response resolves:** no clearing B's <code>c</code>.
- **A→logout→A login during pending create:** old session result has a different <code>version</code> and must not navigate the new session.
- **403 or 503 after submit:** preserve user draft, dialog and URL; no “created successfully”.
- **Create response lost after DB commit:** do not auto-retry create or claim exactly-once semantics.

### Checklist 16.5 — Add dedicated tests per file

| File | Exact assertions |
| --- | --- |
| <code>hooks/collection-query-keys.test.ts</code> | Two actors have different list/detail keys |
| <code>hooks/useCollectionSelection.test.tsx</code> | Parser, push/replace, Back/Forward, query-key preservation |
| <code>components/CollectionSelector.test.tsx</code> | Same name + different UUID, 51st item via paging, keyboard, disabled create |
| <code>components/collection-form.schema.test.ts</code> | Vietnamese and emoji code points, NUL, blank, length 200/2000 |
| <code>components/CollectionFormDialog.test.tsx</code> | Label/error accessibility, pending and failure keep draft, Escape/return focus |
| <code>components/CollectionDeleteDialog.test.tsx</code> | Correct target UUID, visible error, no pending close |
| <code>hooks/useCollectionMutations.test.tsx</code> | Real callbacks, A→B, A→logout→A, soft-error rejection |
| <code>routes/KnowledgeHubPage.test.tsx</code> | Protected Outlet permission, default repository tab, honest frames, unselected/error/unavailable states |
| <code>Router.behavior.test.tsx</code> | Add guarded <code>/knowledgehub</code> case; keep the old route tests intact |

Test production behavior only: placeholders can be marked “not supported”, but do not mount invented fake services in the application.

### Checklist 16.6 — Run focused/full checks from repo root

~~~powershell
npm --prefix src/apps/Blocks.Web test -- src/features/knowledgehub
npm --prefix src/apps/Blocks.Web test
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
git diff --check
~~~

Record **actual** PASS/FAIL/NOT RUN with the command and branch revision. Full tests may have unrelated baseline failures; do not silently weaken or delete them.

**Done Task 16 when:** all critical frontend flows and races above have deterministic tests; compile/build/lint results are recorded honestly.

---

## Task 17 — Real Gateway, roles and persistence: exact owner-run steps

**This task requires explicit authorization** before modifying menu/grants or application data. Do not execute DB or SystemService changes merely because UI tests pass.

### Checklist 17.1 — Confirm target and permission prerequisites

1. Verify current branch, commit, local changes and service targets against P01 outcome.
2. Owner explicitly authorizes enabling the **existing** KnowledgeHub menu and editing **existing** roles via SystemService administration. Do not directly mutate SystemService role/permission tables.
3. Preserve unrelated permissions when an admin form sends an entire permission collection; refresh authentication/session after role changes.
4. Identify two **previously approved** actors and disposable collections. Record only nonsecret actor identifiers, never tokens/passwords/DSNs.

### Checklist 17.2 — Exercise real route through existing Gateway

1. Sign in as actor A through Blocks.
2. Navigate to <code>/knowledgehub</code> (not a direct Python port); verify <code>ProtectedRoute</code> and existing MainLayout.
3. Check GET list route <code>/api/knowledgehub/collections?page_index=1&page_size=50</code>. Inspect both HTTP and <code>{Success, StatusCode, Data, Message}</code>; HTTP 200 may still be application 403 or 503.
4. Create a **disposable** collection with A; record generated UUID, confirm the URL becomes <code>?c=UUID</code>.
5. Refresh; use Back/Forward; rename; inspect server result and latest selected detail. Soft-delete and check <code>c</code> is removed only if still selecting the deleted item.
6. Under approved read-only admin access, verify that <code>deleted_at</code> is set and row persists; UI list/detail must not expose it.

### Checklist 17.3 — Actor/role matrix

| Scenario | Expected |
| --- | --- |
| A with VIEW | List/detail of **A's** active collections |
| A with ADD only for creation | POST permitted only when action granted; cannot infer update/delete |
| A with UPDATE/DELETE | Only authorized owned rows; write must remain owner/active-scoped in SQL |
| B guesses A's UUID | Uniform application 404 (if VIEW action granted); no data leakage |
| Actor lacks action grant | Application 403, permission checked before collection DB access |
| Expired/invalid JWT | Application 401 or existing refresh/redirect behavior; no implicit bypass |
| DB/permission service temporarily unavailable | Safe application 503, never false success |
| Real unexpected server failure | Safe real HTTP 500 response; no fabricated save toast |

**No admin ownership bypass.** Document actual proof for each scenario with redacted network evidence. Do not create users, change shared roles or deliberately disrupt DB connectivity without separate approval.

### Checklist 17.4 — Check persistence/readiness

- With authorization, restart browser/services or reload as appropriate; verify previous collection creation/edit remains persisted.
- Inspect <code>/health</code> (RPC + bounded DB checks) and <code>/alive</code> under ordinary non-disruptive conditions.
- Retain P02's no-document scope: populated-parent deletion/vector cleanup is handed off to later parts, not “tested PASS” here.

**Done Task 17 when:** real permission/action/owner semantics, real Gateway and persistence have recorded evidence. If authorization or runtime is missing, mark **NOT RUN**.

---

## Task 18 — Pixel hierarchy, responsive screenshots and explicit deviation log

**Goal:** compare the implemented feature to the tracked 1280×1024 reference without copying prototype shell/fake data and without treating static screenshot similarity as complete product acceptance.

### Checklist 18.1 — Fix comparison conditions before capture

1. Open <code>docs/knowledgehub/references/stitch_blocks_interface/screen.png</code> and record its intrinsic 1280×1024 size.
2. Capture actual browser viewport 1280×1024 CSS pixels, zoom 100%, DPR 1 unless the owner records/approves a different baseline; then repeat at 1440×900 and 390×844.
3. Record exact route URL shape (redact UUID if necessary), selected tab and popup state, actor **label only**, commit and theme (do not include credentials in screenshots).

### Checklist 18.2 — Capture these distinct scenarios

| Screenshot label | UI state and comparison purpose |
| --- | --- |
| <code>P02-1280-unselected-repository.png</code> | Initial <code>/knowledgehub</code>, dropdown closed, repository active, no auto-selection |
| <code>P02-1280-selected-selector-open.png</code> | Real selected collection, selector dropdown open, badge from actual DTO (=0), header geometry |
| <code>P02-1280-research-unavailable.png</code> | Second tab active, no fabricated answer/conversations |
| <code>P02-1440-dialog-create.png</code> | Create dialog alignment, labels, keyboard focus |
| <code>P02-1440-dialog-delete-error.png</code> | Correct selected target, visible server error and preserved draft |
| <code>P02-390-mobile-long-name.png</code> | Long Unicode name, dropdown/overflow, stacked actions and horizontal tab handling |

Additional cases if useful: 51+ selector fixtures, 403/503 alert, invalid URL, 404 deleted/foreign, loading skeleton.

### Checklist 18.3 — Review regions, not raw screenshot alone

Compare in order:
1. **Structure:** Existing Blocks sidebar/header → feature collection heading → selector + count → tab switch → content frame.
2. **Geometry:** content max-width, horizontal gutters, vertical rhythm, dropdown alignment/width/z-index, tab positioning.
3. **States:** no selection, loading, unavailable, disabled controls, error messages, focus states.
4. **Responsiveness:** no horizontal page overflow at 390px, no clipped confirmation controls, accessible text and focus.
5. **Interaction:** keyboard Tab/Shift+Tab, Enter, Escape, browser Back/Forward, scroll inside popover.

Never copy <code>code.html</code>'s fake documents, progress percentages, AI answer/citation modal, fixed 288px second sidebar or external Material Symbols script. Keep application-wide theme tokens and MainLayout unchanged.

### Checklist 18.4 — Create a visual deviation log (evidence, not production code)

Use a reviewer-maintained table in your working evidence notes; do not create P02 outcome before actual acceptance:

| Region / viewport | Mockup expectation | Actual screenshot | Difference classification | Action |
| --- | --- | --- | --- | --- |
| Header 1280 | Selector left of count badge | TBD | shell / intentional P02 / bug | TBD |
| Popover 1280 | Dropdown below title, visible selected row | TBD | shell / intentional P02 / bug | TBD |
| Repository 1280 | Upload zone then repository area | TBD | intentional disabled functionality | Verify honest message |
| Research 1440 | Second tab placement | TBD | intentional disabled functionality | Verify no fake AI |
| Mobile 390 | Readable stacked layout | TBD | bug if overflow/clipping | Fix local classes |

**Done Task 18 when:** screenshots and classifications exist for all required viewports/states, keyboard accessibility is checked, and any unacceptable visual defects are corrected and re-captured. Screenshot similarity does not replace Task 17 live evidence.

---

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
