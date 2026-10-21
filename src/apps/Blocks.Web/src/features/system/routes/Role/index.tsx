import { useMemo } from "react";
import { getColumns } from "./columns";
import PopupDetail from "./PopupDetail";
import PopupPermission from "./PopupPermission";
import { useRole } from "@/features/system/hooks/useRole";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";

const RolePage = () => {
  const {
    data,
    selectedItem,
    isOpen,
    isOpenPermission,
    permissionData,
    pageRequest,
    rowSelection,
    setPageRequest,
    setRowSelection,
    getList,
    showPopupDetail,
    showPopupPermission,
    onOpenChange,
    onOpenPermissionChange,
    saveChange,
    savePermission,
    deleteList,
    isFetching,
  } = useRole();

  const columns = useMemo(
    () => getColumns(showPopupDetail, deleteList, showPopupPermission),
    [showPopupDetail, deleteList, showPopupPermission],
  );

  const listPage = useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList,
    setRowSelection,
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
      onAddClick={() => showPopupDetail("", false)}
      onDeleteClick={() => listPage.setShowDeleteConfirm(true)}
      deleteDisabled={Object.keys(rowSelection).length === 0}
      showDeleteConfirm={listPage.showDeleteConfirm}
      onDeleteConfirmChange={listPage.setShowDeleteConfirm}
      onDeleteConfirm={listPage.handleDelete}
      deleteItemCount={Object.keys(rowSelection).length}
    >
      {isOpen && (
        <PopupDetail
          key={selectedItem?.Id || "new"}
          data={selectedItem}
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          saveChange={saveChange}
        />
      )}
      {isOpenPermission && (
        <PopupPermission
          data={permissionData}
          isOpen={isOpenPermission}
          onOpenChange={onOpenPermissionChange}
          saveChange={savePermission}
        />
      )}
    </ListPageLayout>
  );
};

export default RolePage;
