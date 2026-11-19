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
        { page_index: pageParam, page_size: PAGE_SIZE },
        signal
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
  selection: Selection
) {
  const id = selection.state === "selected" ? selection.id : null;
  return useQuery({
    queryKey: collectionKeys.detail(
      actorId ?? "signed-out",
      id ?? "no-selection"
    ),
    enabled: Boolean(actorId && canView && id),
    queryFn: ({ signal }) => {
      if (!id) throw new Error("Chưa chọn bộ sưu tập");
      return collectionsApi.detail(id, signal);
    },
    retry: false,
  });
}
