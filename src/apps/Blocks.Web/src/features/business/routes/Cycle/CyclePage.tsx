import { useMemo } from "react";
import { useCycle } from "@/features/business/hooks/useCycle";
import { getColumns } from "./columns";
import PopupCycle from "./PopupCycle";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  CYCLE_STATUS_OPTIONS,
  CYCLE_SCOPE_OPTIONS,
} from "@/constants/catalog.constants";
import { useStandardSetOptions } from "@/features/catalog/hooks/useStandardSetOptions";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";

const CyclePage = () => {
  const {
    data,
    cycle,
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
    changeStatus,
    isLoading,
    isFetching,
  } = useCycle();

  const columns = useMemo(
    () => getColumns(showPopupDetail, deleteList, changeStatus),
    [showPopupDetail, deleteList, changeStatus],
  );

  const listPage = useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList,
    setRowSelection,
    defaultPageRequest: {
      Status: undefined,
      Scope: undefined,
      Year: undefined,
      StandardSetId: undefined,
    },
  });

  const { options: standardSetOptions, isLoading: isStandardSetLoading } = useStandardSetOptions();
  const cycleDisplayData = useMemo(() => {
    const standardSetNameById = new Map<string, string>(
      standardSetOptions.map((opt) => [String(opt.Value ?? ""), String(opt.Text ?? "")]),
    );

    return data.Data.map((item) => ({
      ...item,
      StandardSet: item.StandardSet || standardSetNameById.get(String(item.StandardSetId)) || "",
    }));
  }, [data.Data, standardSetOptions]);

  return (
    <ListPageLayout
      columns={columns}
      data={cycleDisplayData}
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
      searchInputClassName="col-span-1 lg:col-span-1 bg-background"
      filterContent={
        <>
          <Combobox
            options={CYCLE_STATUS_OPTIONS}
            value={pageRequest.Status}
            onValueChange={(val) => {
              setPageRequest((prev) => ({
                ...prev,
                Status: val || undefined,
                PageIndex: 1,
              }));
            }}
            placeholder="Tất cả trạng thái"
            searchPlaceholder="Tìm kiếm trạng thái..."
            emptyText="Không tìm thấy trạng thái."
          />
          <Combobox
            options={standardSetOptions}
            loading={isStandardSetLoading}
            value={pageRequest.StandardSetId}
            onValueChange={(val) => {
              setPageRequest((prev) => ({
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
            options={CYCLE_SCOPE_OPTIONS}
            value={pageRequest.Scope}
            onValueChange={(val) => {
              setPageRequest((prev: any) => ({
                ...prev,
                Scope: val || undefined,
                PageIndex: 1,
              }));
            }}
            placeholder="Tất cả phạm vi"
            searchPlaceholder="Tìm kiếm phạm vi..."
            emptyText="Không tìm thấy phạm vi."
          />
          <Input
            type="number"
            placeholder="Năm"
            value={pageRequest.Year || ""}
            onChange={(e) => {
              const val = e.target.value;
              setPageRequest((prev: any) => ({
                ...prev,
                Year: val ? Number(val) : undefined,
                PageIndex: 1,
              }));
            }}
            className="bg-background"
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
        <PopupCycle
          key={cycle?.Id || "new"}
          cycle={cycle}
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          saveChange={saveChange}
          isLoading={isLoading}
        />
      )}
    </ListPageLayout>
  );
};

export default CyclePage;
