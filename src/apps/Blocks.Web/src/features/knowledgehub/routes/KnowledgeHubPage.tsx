import { useState } from "react";
import { Pencil, Trash2, FolderOpen, Bot } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { CollectionApiError } from "../api/collections.api";
import type { GetPermissionByUser } from "@/features/system/types/role.types";
import type {
  CollectionDto,
  CollectionInput,
} from "../types/collections.types";
import { useCollectionSelection } from "../hooks/useCollectionSelection";
import { useCollections, useCollectionDetail } from "../hooks/useCollections";
import { useCollectionMutations } from "../hooks/useCollectionMutations";
import { CollectionSelector } from "../components/CollectionSelector";
import { CollectionFormDialog } from "../components/CollectionFormDialog";
import { CollectionDeleteDialog } from "../components/CollectionDeleteDialog";
import { type CollectionContentState } from "../components/CollectionState";
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
  const mutations = useCollectionMutations(actorId, {
    ...selectionApi,
    getCurrent: () =>
      (() => {
        const current = selectionApi.getCurrent();
        return current.state === "selected" ? current.id : null;
      })(),
  });

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<CollectionDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionDto | null>(null);

  const collections = Array.from(
    new Map(
      (list.data?.pages.flatMap((p) => p.Data) ?? []).map(
        (item) => [item.Id, item] as const,
      ),
    ).values(),
  );

  const selectedId = selection.state === "selected" ? selection.id : null;
  const selected =
    selection.state === "selected" && detail.isSuccess
      ? (detail.data ?? null)
      : null;

  let state: CollectionContentState;
  if (!actorId || !canView) state = "denied";
  else if (selection.state === "none") state = "none";
  else if (selection.state === "invalid") state = "invalid";
  else if (detail.isLoading) state = "loading";
  else if (detail.isError) {
    const code =
      detail.error instanceof CollectionApiError
        ? detail.error.statusCode
        : undefined;
    state = code === 403 ? "denied" : code === 404 ? "unavailable" : "outage";
  } else state = detail.isSuccess ? "ready" : "loading";

  const listErrorMessage = !list.isError
    ? null
    : list.error instanceof CollectionApiError && list.error.statusCode === 403
      ? "Bạn không có quyền xem danh sách bộ sưu tập."
      : list.error instanceof CollectionApiError &&
          list.error.statusCode === 503
        ? "Dịch vụ tạm thời không khả dụng."
        : "Không thể tải danh sách bộ sưu tập.";

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

  const formError =
    dialogMode === "create"
      ? (mutations.create.error?.message ?? null)
      : (mutations.rename.error?.message ?? null);
  const formPending =
    dialogMode === "create"
      ? mutations.create.isPending
      : mutations.rename.isPending;

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
            errorMessage={listErrorMessage}
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
              variant="outline"
              size="sm"
              disabled={!selected || formPending}
              onClick={openEdit}
            >
              <Pencil className="size-4" /> Đổi tên
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
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
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </section>
  );
}

export default function KnowledgeHubPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const actorKey =
    !loading && isAuthenticated ? (user?.Id ?? "signed-out") : "signed-out";
  return <KnowledgeHubWorkspace key={actorKey} />;
}
