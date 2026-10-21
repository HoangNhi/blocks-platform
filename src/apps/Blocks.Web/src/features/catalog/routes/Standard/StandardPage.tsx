import { useMemo } from "react";
import { useStandard } from "@/features/catalog/hooks/useStandard";
import { getColumns } from "./columns";
import PopupStandard from "./PopupStandard";
import { Combobox } from "@/components/ui/combobox";
import { ACTIVE_STATUS_OPTIONS } from "@/constants/catalog.constants";
import { useQuery } from "@tanstack/react-query";
import { standardSetService } from "@/features/catalog/api/standardset.api";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";

const StandardPage = () => {
  const {
    data,
    standard,
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
  } = useStandard();

  const columns = useMemo(
    () => getColumns(showPopupDetail, deleteList),
    [showPopupDetail, deleteList],
  );

  // Fetch StandardSet options for filter
  const { data: standardSetResponse } = useQuery({
    queryKey: ["standardSets", "combobox"],
    queryFn: () => standardSetService.getAllCombobox(),
  });

  const standardSetOptions = standardSetResponse?.Data || [];

  const listPage = useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList,
    setRowSelection,
    defaultPageRequest: { IsActived: undefined, StandardSetId: undefined },
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
      searchInputClassName="col-span-1 md:col-span-2 bg-background"
      filterContent={
        <>
          <Combobox
            options={standardSetOptions}
            value={pageRequest.StandardSetId}
            onValueChange={(val) => {
              setPageRequest((prev: any) => ({
                ...prev,
                StandardSetId: val || undefined,
                PageIndex: 1,
              }));
            }}
            placeholder="Tất cả bộ tiêu chuẩn"
            searchPlaceholder="Tìm kiếm bộ tiêu chuẩn..."
            emptyText="Không tìm thấy bộ tiêu chuẩn."
          />
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
        </>
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
        <PopupStandard
          key={standard?.Id || "new"}
          standard={standard}
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          saveChange={saveChange}
          isLoading={isLoading}
        />
      )}
    </ListPageLayout>
  );
};

export default StandardPage;
