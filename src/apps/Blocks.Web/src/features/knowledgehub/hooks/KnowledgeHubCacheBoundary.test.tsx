import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useState, type RefObject } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  KnowledgeHubCacheBoundary,
  useKnowledgeHubSession,
  type KnowledgeHubSession,
} from "./KnowledgeHubCacheBoundary";
import { collectionKeys } from "./collection-query-keys";
import type { User } from "@/features/system/types/user.types";

let mockAuthUser: { Id: string } | null = null;
let mockIsAuthenticated = false;
let mockLoading = false;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockAuthUser as User | null,
    isAuthenticated: mockIsAuthenticated,
    loading: mockLoading,
    systemGroup: null,
    menu: null,
    permissions: null,
    roleName: null,
    login: vi.fn(),
    logout: vi.fn(),
    getPermission: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

describe("KnowledgeHubCacheBoundary integration", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    mockAuthUser = null;
    mockIsAuthenticated = false;
    mockLoading = false;
  });

  let latestSession: RefObject<KnowledgeHubSession> | null = null;

  function TestConsumer() {
    const sessionRef = useKnowledgeHubSession();
    latestSession = sessionRef;
    return <div data-testid="actor-id">{sessionRef.current.actorId ?? "none"}</div>;
  }

  it("throws error when useKnowledgeHubSession is used outside KnowledgeHubCacheBoundary", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const renderOutside = () => render(<TestConsumer />);
    expect(renderOutside).toThrow("KnowledgeHubCacheBoundary is required");
    consoleSpy.mockRestore();
  });

  it("evicts actor A cache and preserves actor B cache when switching actor A -> B", async () => {
    mockAuthUser = { Id: "actor-A" };
    mockIsAuthenticated = true;
    mockLoading = false;

    // Prefill cache for actor A and actor B
    queryClient.setQueryData(collectionKeys.actor("actor-A"), ["data-a-actor"]);
    queryClient.setQueryData(collectionKeys.detail("actor-A", "doc-1"), { id: "doc-1", title: "Doc A" });
    queryClient.setQueryData(collectionKeys.actor("actor-B"), ["data-b-actor"]);
    queryClient.setQueryData(collectionKeys.detail("actor-B", "doc-2"), { id: "doc-2", title: "Doc B" });

    let triggerSwitch: (newActor: string) => void = () => {};

    function Harness() {
      const [, setActor] = useState("actor-A");
      triggerSwitch = (newActor: string) => {
        mockAuthUser = { Id: newActor };
        setActor(newActor);
      };

      return (
        <QueryClientProvider client={queryClient}>
          <KnowledgeHubCacheBoundary>
            <TestConsumer />
          </KnowledgeHubCacheBoundary>
        </QueryClientProvider>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId("actor-id").textContent).toBe("actor-A");

    // Verify actor A and actor B data exist initially
    expect(queryClient.getQueryData(collectionKeys.actor("actor-A"))).toEqual(["data-a-actor"]);
    expect(queryClient.getQueryData(collectionKeys.detail("actor-A", "doc-1"))).toEqual({ id: "doc-1", title: "Doc A" });
    expect(queryClient.getQueryData(collectionKeys.actor("actor-B"))).toEqual(["data-b-actor"]);
    expect(queryClient.getQueryData(collectionKeys.detail("actor-B", "doc-2"))).toEqual({ id: "doc-2", title: "Doc B" });

    // Switch from Actor A to Actor B
    act(() => {
      triggerSwitch("actor-B");
    });

    expect(latestSession?.current.actorId).toBe("actor-B");

    // Assert actor A's cache is evicted
    expect(queryClient.getQueryData(collectionKeys.actor("actor-A"))).toBeUndefined();
    expect(queryClient.getQueryData(collectionKeys.detail("actor-A", "doc-1"))).toBeUndefined();

    // Assert actor B's cache remains intact
    expect(queryClient.getQueryData(collectionKeys.actor("actor-B"))).toEqual(["data-b-actor"]);
    expect(queryClient.getQueryData(collectionKeys.detail("actor-B", "doc-2"))).toEqual({ id: "doc-2", title: "Doc B" });
  });

  it("evicts actor cache when switching to logout", async () => {
    mockAuthUser = { Id: "actor-A" };
    mockIsAuthenticated = true;
    mockLoading = false;

    queryClient.setQueryData(collectionKeys.actor("actor-A"), ["data-a-actor"]);
    queryClient.setQueryData(collectionKeys.detail("actor-A", "doc-1"), { id: "doc-1" });

    let triggerLogout: () => void = () => {};

    function Harness() {
      const [, setLoggedIn] = useState(true);
      triggerLogout = () => {
        mockAuthUser = null;
        mockIsAuthenticated = false;
        setLoggedIn(false);
      };

      return (
        <QueryClientProvider client={queryClient}>
          <KnowledgeHubCacheBoundary>
            <TestConsumer />
          </KnowledgeHubCacheBoundary>
        </QueryClientProvider>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId("actor-id").textContent).toBe("actor-A");

    act(() => {
      triggerLogout();
    });

    expect(latestSession?.current.actorId).toBeNull();
    expect(queryClient.getQueryData(collectionKeys.actor("actor-A"))).toBeUndefined();
    expect(queryClient.getQueryData(collectionKeys.detail("actor-A", "doc-1"))).toBeUndefined();
  });

  it("aborts in-flight request when actor switches", async () => {
    mockAuthUser = { Id: "actor-A" };
    mockIsAuthenticated = true;
    mockLoading = false;

    let aborted = false;
    let triggerSwitch: (newActor: string) => void = () => {};

    function InFlightConsumer() {
      useQuery({
        queryKey: collectionKeys.detail("actor-A", "deferred-doc"),
        queryFn: ({ signal }) => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
          return new Promise(() => {
            // never resolves
          });
        },
      });
      return <div>In flight</div>;
    }

    function Harness() {
      const [, setActor] = useState("actor-A");
      triggerSwitch = (newActor: string) => {
        mockAuthUser = { Id: newActor };
        setActor(newActor);
      };

      return (
        <QueryClientProvider client={queryClient}>
          <KnowledgeHubCacheBoundary>
            <InFlightConsumer />
          </KnowledgeHubCacheBoundary>
        </QueryClientProvider>
      );
    }

    render(<Harness />);
    expect(aborted).toBe(false);

    act(() => {
      triggerSwitch("actor-B");
    });

    expect(aborted).toBe(true);
  });
});
