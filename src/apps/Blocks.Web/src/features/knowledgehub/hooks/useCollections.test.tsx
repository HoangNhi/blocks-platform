import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { collectionsApi } from "../api/collections.api";
import type { CollectionDto } from "../types/collections.types";
import { useCollectionDetail } from "./useCollections";
import { parseSelection } from "./useCollectionSelection";

vi.mock("../api/collections.api", () => ({
  collectionsApi: {
    detail: vi.fn(),
  },
}));

const detailApi = vi.mocked(collectionsApi.detail);
const actor = "actor-a";
const idA = "11111111-1111-1111-1111-111111111111";
const idB = "22222222-2222-2222-2222-222222222222";

const dto = (id: string, name: string): CollectionDto => ({
  Id: id,
  Name: name,
  Description: null,
  CreatedAt: "2026-11-20T00:00:00Z",
  UpdatedAt: "2026-11-20T00:00:00Z",
  DocumentCount: 0,
});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("KnowledgeHub collection detail queries", () => {
  it.each(["", "c=", "c=x&c=y", `c=00000000-0000-0000-0000-000000000000`])(
    "does not request detail for invalid selection %s",
    async (search) => {
      const selection = parseSelection(new URLSearchParams(search));
      renderHook(
        () => useCollectionDetail(actor, true, selection),
        { wrapper },
      );

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(detailApi).not.toHaveBeenCalled();
    },
  );

  it("requests a valid off-page UUID directly by id", async () => {
    detailApi.mockResolvedValueOnce(dto(idA, "Off-page"));
    const { result } = renderHook(
      () =>
        useCollectionDetail(actor, true, {
          state: "selected",
          id: idA,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data?.Name).toBe("Off-page"));
    expect(detailApi).toHaveBeenCalledWith(idA, expect.anything());
  });

  it("does not paint A after selection changes to B", async () => {
    let resolveA!: (value: CollectionDto) => void;
    const delayedA = new Promise<CollectionDto>((resolve) => {
      resolveA = resolve;
    });
    detailApi.mockReturnValueOnce(delayedA);
    detailApi.mockResolvedValueOnce(dto(idB, "Collection B"));

    const hook = renderHook(
      ({ selection }: { selection: ReturnType<typeof parseSelection> }) =>
        useCollectionDetail(actor, true, selection),
      {
        initialProps: {
          selection: { state: "selected", id: idA },
        },
        wrapper,
      },
    );

    hook.rerender({
      selection: { state: "selected", id: idB },
    });
    await waitFor(() => expect(hook.result.current.data?.Id).toBe(idB));

    await act(async () => {
      resolveA(dto(idA, "Collection A"));
    });
    expect(hook.result.current.data?.Id).toBe(idB);
  });
});
