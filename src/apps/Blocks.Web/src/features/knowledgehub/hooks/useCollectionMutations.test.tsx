import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeHubCacheBoundary } from "./KnowledgeHubCacheBoundary";
import { useCollectionMutations } from "./useCollectionMutations";
import { collectionKeys } from "./collection-query-keys";
import { collectionsApi } from "../api/collections.api";
import type { CollectionDto, CollectionInput } from "../types/collections.types";
import { toast } from "sonner";

const authState: {
  user: { Id: string } | null;
  isAuthenticated: boolean;
  loading: boolean;
} = {
  user: { Id: "actor-a" },
  isAuthenticated: true,
  loading: false,
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("../api/collections.api", () => ({
  collectionsApi: {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

const createApi = vi.mocked(collectionsApi.create);
const updateApi = vi.mocked(collectionsApi.update);
const removeApi = vi.mocked(collectionsApi.remove);

const dto = (id: string, name = "Collection"): CollectionDto => ({
  Id: id,
  Name: name,
  Description: null,
  CreatedAt: "2026-11-20T00:00:00Z",
  UpdatedAt: "2026-11-20T00:00:00Z",
  DocumentCount: 0,
});

const input: CollectionInput = {
  Name: "Collection",
  Description: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderMutation(
  queryClient: QueryClient,
  navigation: {
    select: (id: string) => void;
    clearIfSelected: (id: string) => void;
    getCurrent: () => string | null;
  },
  actor = "actor-a",
) {
  authState.user = { Id: actor };
  authState.isAuthenticated = true;
  const result = renderHook(
    ({ currentActor }: { currentActor: string | null }) =>
      useCollectionMutations(currentActor, navigation),
    {
      initialProps: { currentActor: actor as string | null },
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <KnowledgeHubCacheBoundary>{children}</KnowledgeHubCacheBoundary>
        </QueryClientProvider>
      ),
    },
  );
  return {
    ...result,
    rerenderActor(nextActor: string | null) {
      authState.user = nextActor ? { Id: nextActor } : null;
      authState.isAuthenticated = Boolean(nextActor);
      result.rerender({ currentActor: nextActor ?? null });
    },
  };
}

describe("useCollectionMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { Id: "actor-a" };
    authState.isAuthenticated = true;
    createApi.mockResolvedValue(dto("cccccccc-cccc-cccc-cccc-cccccccccccc"));
    updateApi.mockResolvedValue(dto("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Renamed"));
    removeApi.mockResolvedValue({
      Id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    });
  });

  it("sends normalized create and update bodies without client-owned fields", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const navigation = {
      select: vi.fn(),
      clearIfSelected: vi.fn(),
      getCurrent: () => null,
    };
    const { result } = renderMutation(client, navigation);

    await act(async () => {
      await result.current.createCollection(input);
      await result.current.renameCollection(
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        { Name: "Renamed", Description: null },
      );
    });

    expect(createApi).toHaveBeenCalledWith(input);
    expect(updateApi).toHaveBeenCalledWith(
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      { Name: "Renamed", Description: null },
    );
    expect(Object.keys(createApi.mock.calls[0]?.[0] ?? {})).toEqual([
      "Name",
      "Description",
    ]);
  });

  it("selects the server UUID and does not hijack a deliberate selection", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    let current: string | null = null;
    const navigation = {
      select: vi.fn((id: string) => {
        current = id;
      }),
      clearIfSelected: vi.fn(),
      getCurrent: () => current,
    };
    const { result } = renderMutation(client, navigation);

    await act(async () => {
      await result.current.createCollection(input);
    });
    expect(navigation.select).toHaveBeenCalledWith(
      "cccccccc-cccc-cccc-cccc-cccccccccccc",
    );

    navigation.select.mockClear();
    const pending = deferred<CollectionDto>();
    createApi.mockReturnValueOnce(pending.promise);
    let createPromise!: Promise<unknown>;
    act(() => {
      createPromise = result.current.createCollection(input);
    });
    current = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    pending.resolve(dto("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", "Another"));
    await act(async () => {
      await createPromise;
    });

    expect(navigation.select).not.toHaveBeenCalled();
  });

  it("ignores late A completion after A to B actor transition", async () => {
    const pending = deferred<CollectionDto>();
    createApi.mockReturnValueOnce(pending.promise);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const navigation = {
      select: vi.fn(),
      clearIfSelected: vi.fn(),
      getCurrent: () => null,
    };
    const hook = renderMutation(client, navigation);

    let createPromise!: Promise<unknown>;
    act(() => {
      createPromise = hook.result.current.createCollection(input);
    });
    hook.rerenderActor("actor-b");
    pending.resolve(dto("ffffffff-ffff-ffff-ffff-ffffffffffff"));
    await act(async () => {
      await createPromise;
    });

    expect(navigation.select).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: collectionKeys.lists("actor-b") }),
    );
  });

  it("ignores late A rename completion after switching to actor B", async () => {
    const pending = deferred<CollectionDto>();
    updateApi.mockReturnValueOnce(pending.promise);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const navigation = {
      select: vi.fn(),
      clearIfSelected: vi.fn(),
      getCurrent: () => "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    };
    const hook = renderMutation(client, navigation);

    let renamePromise!: Promise<unknown>;
    act(() => {
      renamePromise = hook.result.current.renameCollection(
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        { Name: "Renamed", Description: null },
      );
    });
    hook.rerenderActor("actor-b");
    pending.resolve(dto("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Renamed"));
    await act(async () => {
      await renamePromise;
    });

    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: collectionKeys.lists("actor-a") }),
    );
    expect(navigation.select).not.toHaveBeenCalled();
    expect(navigation.clearIfSelected).not.toHaveBeenCalled();
  });

  it("ignores late A delete completion after switching to actor B", async () => {
    const pending = deferred<{ Id: string }>();
    removeApi.mockReturnValueOnce(pending.promise);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const navigation = {
      select: vi.fn(),
      clearIfSelected: vi.fn(),
      getCurrent: () => "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    };
    const hook = renderMutation(client, navigation);

    let deletePromise!: Promise<unknown>;
    act(() => {
      deletePromise = hook.result.current.deleteCollection(
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      );
    });
    hook.rerenderActor("actor-b");
    pending.resolve({ Id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
    await act(async () => {
      await deletePromise;
    });

    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: collectionKeys.lists("actor-a") }),
    );
    expect(navigation.clearIfSelected).not.toHaveBeenCalled();
  });

  it("does not clear the selected collection when rename completes", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const navigation = {
      select: vi.fn(),
      clearIfSelected: vi.fn(),
      getCurrent: () => "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    };
    const { result } = renderMutation(client, navigation);

    await act(async () => {
      await result.current.renameCollection(
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbb",
        { Name: "Renamed", Description: null },
      );
    });

    expect(navigation.clearIfSelected).not.toHaveBeenCalled();
  });

  it("does not let an old session navigate after logout and relogin", async () => {
    const pending = deferred<CollectionDto>();
    createApi.mockReturnValueOnce(pending.promise);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const navigation = {
      select: vi.fn(),
      clearIfSelected: vi.fn(),
      getCurrent: () => null,
    };
    const hook = renderMutation(client, navigation);

    let createPromise!: Promise<unknown>;
    act(() => {
      createPromise = hook.result.current.createCollection(input);
    });
    hook.rerenderActor(null);
    hook.rerenderActor("actor-a");
    pending.resolve(dto("ffffffff-ffff-ffff-ffff-ffffffffffff"));
    await act(async () => {
      await createPromise;
    });

    expect(navigation.select).not.toHaveBeenCalled();
  });

  it("keeps a different selected collection when an old delete completes", async () => {
    const pending = deferred<{ Id: string }>();
    removeApi.mockReturnValueOnce(pending.promise);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    let current = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const navigation = {
      select: vi.fn(),
      clearIfSelected: vi.fn(),
      getCurrent: () => current,
    };
    const hook = renderMutation(client, navigation);

    let deletePromise!: Promise<unknown>;
    act(() => {
      deletePromise = hook.result.current.deleteCollection(
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      );
    });
    current = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    pending.resolve({ Id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
    await act(async () => {
      await deletePromise;
    });

    expect(navigation.clearIfSelected).toHaveBeenCalledWith(
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    );
    expect(current).toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");
  });

  it("does not retry a failed create or issue a second request for a duplicate pending click", async () => {
    const pending = deferred<CollectionDto>();
    createApi.mockReturnValueOnce(pending.promise);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const navigation = {
      select: vi.fn(),
      clearIfSelected: vi.fn(),
      getCurrent: () => null,
    };
    const hook = renderMutation(client, navigation);

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = hook.result.current.createCollection(input);
    });
    await waitFor(() => expect(createApi).toHaveBeenCalledTimes(1));
    act(() => {
      second = hook.result.current.createCollection(input);
    });
    expect(createApi).toHaveBeenCalledTimes(1);

    pending.reject(new Error("timeout"));
    await expect(first).rejects.toThrow("timeout");
    await expect(second).rejects.toThrow("timeout");
    await waitFor(() => expect(createApi).toHaveBeenCalledTimes(1));
  });

  it("rejects soft API errors without announcing a successful create", async () => {
    createApi.mockRejectedValueOnce(
      Object.assign(new Error("Unavailable"), { statusCode: 503 }),
    );
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const navigation = {
      select: vi.fn(),
      clearIfSelected: vi.fn(),
      getCurrent: () => null,
    };
    const { result } = renderMutation(client, navigation);

    await expect(result.current.createCollection(input)).rejects.toMatchObject({
      statusCode: 503,
      message: "Unavailable",
    });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
