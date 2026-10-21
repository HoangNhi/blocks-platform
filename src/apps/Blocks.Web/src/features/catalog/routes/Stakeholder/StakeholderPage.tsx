import { useMemo } from "react";
import { useStakeholder } from "@/features/catalog/hooks/useStakeholder";
import { getColumns } from "./columns";
import PopupStakeholder from "./PopupStakeholder";
import { Combobox } from "@/components/ui/combobox";
import { STAKEHOLDER_TYPES } from "@/constants/catalog.constants";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";

const StakeholderPage = () => {
  const {
    data,
    stakeholder,
    isOpen,
    pageRequest,
    rowSelection,
    setPageRequest,
    setRowSelection,
    getList,
    showPopupDetail,
    onOpenChange,
    saveChange,
    deleteList,
    isFetching,
    isLoading,
  } = useStakeholder();

  const columns = useMemo(
    () => getColumns(showPopupDetail, deleteList),
    [showPopupDetail, deleteList],
  );

  const listPage = useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList,
    setRowSelection,
    defaultPageRequest: { Type: undefined },
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
      onRefresh={getList}
      isLoading={isFetching}
      searchTerm={listPage.searchTerm}
      onSearchTermChange={listPage.setSearchTerm}
      onResetFilters={listPage.handleResetFilters}
      searchInputClassName="col-span-1 md:col-span-3 bg-background"
      filterContent={
        <Combobox
          options={STAKEHOLDER_TYPES}
          value={pageRequest.Type?.toString()}
          onValueChange={(val) => {
            setPageRequest((prev: any) => ({
              ...prev,
              Type: val ? Number(val) : undefined,
              PageIndex: 1,
            }));
          }}
          placeholder="Tất cả loại đối tượng"
          searchPlaceholder="Tìm kiếm loại đối tượng..."
          emptyText="Không tìm thấy loại đối tượng."
        />
      }
      onAddClick={() => showPopupDetail("", false)}
      onDeleteClick={() => listPage.setShowDeleteConfirm(true)}
      deleteDisabled={Object.keys(rowSelection).length === 0}
      showDeleteConfirm={listPage.showDeleteConfirm}
      onDeleteConfirmChange={listPage.setShowDeleteConfirm}
      onDeleteConfirm={listPage.handleDelete}
      deleteItemCount={Object.keys(rowSelection).length}
      isDeleteLoading={isLoading}
    >
      {isOpen && (
        <PopupStakeholder
          key={stakeholder?.Id || "new"}
          stakeholder={stakeholder}
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          saveChange={saveChange}
          isLoading={isLoading}
        />
      )}
    </ListPageLayout>
  );
};

export default StakeholderPage;
