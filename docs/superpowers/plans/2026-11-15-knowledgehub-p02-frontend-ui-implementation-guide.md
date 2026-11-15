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
