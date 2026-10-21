import { useMemo } from "react";
import { useFileType } from "@/features/catalog/hooks/useFileType";
import { getColumns } from "./columns";
import PopupFileType from "./PopupFileType";
import { Combobox } from "@/components/ui/combobox";
import { ACTIVE_STATUS_OPTIONS } from "@/constants/catalog.constants";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";

const FileTypePage = () => {
  const {
    data,
    fileType,
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
    isLoading,
    isFetching,
  } = useFileType();

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
    defaultPageRequest: { IsActived: undefined },
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
          options={ACTIVE_STATUS_OPTIONS}
          value={pageRequest.IsActived?.toString()}
          onValueChange={(val) => {
            setPageRequest((prev: any) => ({
              ...prev,
              IsActived: val ? val === "true" : undefined,
              PageIndex: 1,
            }));
          }}
          placeholder="Tất cả trạng thái"
          searchPlaceholder="Tìm kiếm trạng thái..."
          emptyText="Không tìm thấy trạng thái."
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
        <PopupFileType
          key={fileType?.Id || "new"}
          fileType={fileType}
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          saveChange={saveChange}
          isLoading={isLoading}
        />
      )}
    </ListPageLayout>
  );
};

export default FileTypePage;
