import type { FC } from "react";
import { useOutletContext } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import type { GetPermissionByUser } from "@/features/system/types/role.types";
import { CollectionApiError } from "../api/collections.api";
import { useCollectionSelection } from "../hooks/useCollectionSelection";
import { useCollectionDetail, useCollections } from "../hooks/useCollections";
import { CollectionSelector } from "../components/CollectionSelector";
import { CollectionState } from "../components/CollectionState";

interface KnowledgeHubOutletContext {
  permission?: GetPermissionByUser | null;
}

function getDetailErrorState(error: unknown) {
  if (error instanceof CollectionApiError) {
    if (error.statusCode === 403) return "denied" as const;
    if (error.statusCode === 404) return "unavailable" as const;
  }
  return "outage" as const;
}

const KnowledgeHubPage: FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { permission } = useOutletContext<KnowledgeHubOutletContext>();
  const actorId = isAuthenticated && user ? user.Id : null;
  const canView = Boolean(actorId && permission?.IsViewed);
  const canCreate = Boolean(canView && permission?.IsAdded);

  const { selection, select } = useCollectionSelection();
  const detail = useCollectionDetail(actorId, canView, selection);
  const selectedId = selection.state === "selected" ? selection.id : null;
  const selectedCollection = detail.data ?? null;

  const list = useCollections(actorId, canView);
  const collections = Array.from(
    new Map(
      (list.data?.pages.flatMap((page) => page.Data) ?? []).map(
        (item) => [item.Id, item] as const
      )
    ).values()
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <CollectionSelector
          collections={collections}
          selected={selectedCollection}
          selectedId={selectedId}
          listLoading={list.isLoading}
          loadingMore={list.isFetching}
          hasMore={list.hasNextPage === true}
          errorMessage={
            list.isError ? "Không thể tải danh sách bộ sưu tập." : null
          }
          canCreate={canCreate}
          onSelect={select}
          onCreate={() => {}}
          onLoadMore={() => {
            if (list.hasNextPage && !list.isFetching) {
              void list.fetchNextPage();
            }
          }}
        />
        {selectedCollection && (
          <Badge variant="secondary">
            {selectedCollection.DocumentCount} tài liệu
          </Badge>
        )}
      </div>

      {!canView && <CollectionState state="denied" />}
      {canView && selection.state === "none" && (
        <CollectionState state="none" />
      )}
      {canView && selection.state === "invalid" && (
        <CollectionState state="invalid" />
      )}
      {canView &&
        selection.state === "selected" &&
        detail.isLoading && <CollectionState state="loading" />}
      {canView &&
        selection.state === "selected" &&
        detail.isError && (
          <CollectionState state={getDetailErrorState(detail.error)} />
        )}
      {canView && selection.state === "selected" && detail.isSuccess && (
        <div className="rounded-lg border p-4">
          <h2 className="text-lg font-semibold">{detail.data.Name}</h2>
          {detail.data.Description && (
            <p className="text-sm text-muted-foreground">
              {detail.data.Description}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default KnowledgeHubPage;
