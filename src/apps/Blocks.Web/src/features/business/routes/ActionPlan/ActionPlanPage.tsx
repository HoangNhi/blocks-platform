import { useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Combobox } from "@/components/ui/combobox";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";
import { useCycleOptions } from "@/features/business/hooks/useCycleOptions";
import { useActionPlanList } from "./hooks/useActionPlanList";
import { useActionPlan } from "./hooks/useActionPlan";
import { getActionPlanColumns } from "./columns";
import PopupActionPlan from "./PopupActionPlan";
import type { ActionPlanListItem } from "@/features/business/types/actionPlan.types";
import { ACTION_PLAN_STATUS_OPTIONS } from "./actionPlan.utils";

export default function ActionPlanPage() {
  const {
    data,
    rowSelection,
    setRowSelection,
    pageRequest,
    setPageRequest,
    isFetching,
    refreshList,
    isOpen,
    selectedItem,
    openPopup,
    openNew,
    onOpenChange,
  } = useActionPlanList();
  const cycleOptions = useCycleOptions();
  const { deleteList, isMutating } = useActionPlan();

  const handleDeleteOne = useCallback(
    async (item: ActionPlanListItem) => {
      await deleteList({ Ids: [item.Id] });
      refreshList();
    },
    [deleteList, refreshList],
  );

  const columns = useMemo<ColumnDef<ActionPlanListItem>[]>(
    () => getActionPlanColumns(openPopup, handleDeleteOne),
    [handleDeleteOne, openPopup],
  );

  const listPage = useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList: async (ids: string[]) => {
      await deleteList({ Ids: ids });
      refreshList();
    },
    setRowSelection,
    defaultPageRequest: { CycleId: undefined, Status: undefined },
  });

  return (
    <ListPageLayout
      columns={columns}
      data={data.Data}
      totalRow={data.TotalRow}
      rowSelection={rowSelection}
      setRowSelection={setRowSelection}
      pageRequest={pageRequest}
      setPageRequest={setPageRequest}
      onRefresh={refreshList}
      isLoading={isFetching}
      searchTerm={listPage.searchTerm}
      onSearchTermChange={listPage.setSearchTerm}
      onResetFilters={listPage.handleResetFilters}
      filterGridCols="md:grid-cols-3"
      searchInputClassName="col-span-1 bg-background"
      filterContent={
        <>
          <Combobox
            options={cycleOptions.options ?? []}
            loading={cycleOptions.isLoading}
            value={pageRequest.CycleId ?? undefined}
            onValueChange={(value) =>
              setPageRequest((prev) => ({
                ...prev,
                CycleId: value || undefined,
                PageIndex: 1,
              }))
            }
            placeholder="Tất cả chu kỳ"
            searchPlaceholder="Tìm chu kỳ..."
            emptyText="Không tìm thấy chu kỳ."
          />
          <Combobox
            options={ACTION_PLAN_STATUS_OPTIONS.map((option) => ({
              Value: String(option.value),
              Text: option.label,
            }))}
            value={pageRequest.Status?.toString()}
            onValueChange={(value) =>
              setPageRequest((prev) => ({
                ...prev,
                Status: value ? Number(value) : undefined,
                PageIndex: 1,
              }))
            }
            placeholder="Tất cả trạng thái"
            emptyText="Không tìm thấy trạng thái."
          />
        </>
      }
      onAddClick={openNew}
      onDeleteClick={() => listPage.setShowDeleteConfirm(true)}
      deleteDisabled={listPage.selectedIds.length === 0}
      showDeleteConfirm={listPage.showDeleteConfirm}
      onDeleteConfirmChange={listPage.setShowDeleteConfirm}
      onDeleteConfirm={listPage.handleDelete}
      deleteItemCount={listPage.selectedIds.length}
      isDeleteLoading={isMutating}
    >
      {isOpen && selectedItem ? (
        <PopupActionPlan
          open={isOpen}
          item={selectedItem}
          onOpenChange={onOpenChange}
          onChanged={refreshList}
        />
      ) : null}
    </ListPageLayout>
  );
}
