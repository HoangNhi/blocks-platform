import { useMemo, useState } from "react";
import { useEvidenceCycleMap } from "../../hooks/useEvidenceCycleMap";
import { getColumns } from "./columns";
import PopupEvidenceCycleMap from "./PopupEvidenceCycleMap";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Combobox } from "@/components/ui/combobox";
import { EVIDENCE_STATUS_OPTIONS } from "@/constants/business.constants";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useCycleOptions } from "@/features/business/hooks/useCycleOptions";
import { useFileTypeOptions } from "@/features/catalog/hooks/useFileTypeOptions";
import { useListPage } from "@/hooks/useListPage";
import { useAuth } from "@/hooks/useAuth";

const EvidenceCycleMapPage = () => {
  const { isExternalReviewer } = useAuth();
  const {
    data,
    evidenceCycleMap,
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
    submitToApprove,
    approve,
    isFetching,
    isLoading,
    isApproving,
  } = useEvidenceCycleMap();

  const { options: cycleOptions, isLoading: isCycleLoading } =
    useCycleOptions();
  const { options: fileTypeOptions, isLoading: isFileTypeLoading } =
    useFileTypeOptions();

  const fileTypeMap = useMemo<Record<string, string>>(() => {
    return Object.fromEntries(
      fileTypeOptions.map((t) => [t.Value ?? "", t.Text ?? ""]),
    );
  }, [fileTypeOptions]);

  const columns = useMemo(
    () =>
      getColumns(showPopupDetail, deleteList, fileTypeMap, isExternalReviewer),
    [showPopupDetail, deleteList, fileTypeMap, isExternalReviewer],
  );

  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const listPage = useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList,
    setRowSelection,
    defaultPageRequest: {
      CycleId: undefined,
      FileTypeId: undefined,
      EvidenceStatus: undefined,
    },
  });

  const handleSubmitToApprove = () => {
    const ids = data.Data.filter((_, idx) => rowSelection[idx]).map(
      (item) => item.Id,
    );
    submitToApprove(ids);
    setShowSubmitConfirm(false);
    setRowSelection({});
  };

  const selectedCount = Object.keys(rowSelection).length;

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
      searchInputClassName="col-span-1 bg-background"
      filterContent={
        <>
          {!isExternalReviewer && (
            <Combobox
              options={cycleOptions}
              loading={isCycleLoading}
              value={pageRequest.CycleId}
              onValueChange={(val) => {
                setPageRequest((prev) => ({
                  ...prev,
                  CycleId: val ? val : undefined,
                  PageIndex: 1,
                }));
              }}
              placeholder="Tất cả chu kỳ"
              searchPlaceholder="Tìm kiếm chu kỳ..."
              emptyText="Không tìm thấy chu kỳ."
            />
          )}

          <Combobox
            options={fileTypeOptions}
            loading={isFileTypeLoading}
            value={pageRequest.FileTypeId}
            onValueChange={(val) => {
              setPageRequest((prev) => ({
                ...prev,
                FileTypeId: val ? val : undefined,
                PageIndex: 1,
              }));
            }}
            placeholder="Tất cả loại tài liệu"
            searchPlaceholder="Tìm kiếm loại tài liệu..."
            emptyText="Không tìm thấy loại tài liệu."
          />

          <Combobox
            options={EVIDENCE_STATUS_OPTIONS}
            value={pageRequest.EvidenceStatus?.toString()}
            onValueChange={(val) => {
              setPageRequest((prev) => ({
                ...prev,
                EvidenceStatus: val ? Number(val) : undefined,
                PageIndex: 1,
              }));
            }}
            placeholder="Tất cả trạng thái minh chứng"
            searchPlaceholder="Tìm kiếm trạng thái minh chứng..."
            emptyText="Không tìm thấy trạng thái."
          />
        </>
      }
      hideAdd={isExternalReviewer}
      onAddClick={
        isExternalReviewer
          ? undefined
          : () => {
              showPopupDetail("", false);
            }
      }
      onDeleteClick={
        isExternalReviewer
          ? undefined
          : () => {
              listPage.setShowDeleteConfirm(true);
            }
      }
      deleteDisabled={selectedCount === 0}
      showDeleteConfirm={listPage.showDeleteConfirm}
      onDeleteConfirmChange={listPage.setShowDeleteConfirm}
      onDeleteConfirm={listPage.handleDelete}
      deleteItemCount={selectedCount}
      isDeleteLoading={isLoading}
      extraActions={
        isExternalReviewer ? null : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowSubmitConfirm(true)}
            disabled={selectedCount === 0}
          >
            Gửi duyệt
          </Button>
        )
      }
    >
      {isOpen && (
        <PopupEvidenceCycleMap
          key={evidenceCycleMap?.Id || "new"}
          evidenceCycleMap={evidenceCycleMap}
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          saveChange={saveChange}
          isLoading={isLoading}
          onApprove={approve}
          isApproving={isApproving}
          readOnly={isExternalReviewer}
          isExternalViewer={isExternalReviewer}
        />
      )}

      {!isExternalReviewer && (
        <ConfirmDeleteDialog
          open={showSubmitConfirm}
          onOpenChange={setShowSubmitConfirm}
          onConfirm={handleSubmitToApprove}
          itemCount={selectedCount}
          title="Xác nhận gửi duyệt"
          description={`Bạn có chắc chắn muốn gửi ${selectedCount} mục đã chọn để duyệt không?`}
          confirmText="Gửi duyệt"
          confirmVariant="default"
        />
      )}
    </ListPageLayout>
  );
};

export default EvidenceCycleMapPage;
