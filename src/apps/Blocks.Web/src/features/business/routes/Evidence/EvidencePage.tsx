import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";
import { useAuth } from "@/hooks/useAuth";
import { EVIDENCE_STATUS_OPTIONS } from "@/constants/business.constants";
import { useFileTypeOptions } from "@/features/catalog/hooks/useFileTypeOptions";
import { useEvidence } from "@/features/business/hooks/useEvidence";
import { getColumns } from "./columns";
import PopupEvidence from "./PopupEvidence";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EvidencePage = () => {
  const { isExternalReviewer } = useAuth();
  const {
    data,
    evidence,
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
    onApprove,
    isLoading,
    isSubmitting,
    isApproving,
    isFetching,
  } = useEvidence();

  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const selectedIds = data.Data.filter((_, idx) => rowSelection[idx]).map(
    (item) => item.Id,
  );

  const columns = useMemo(
    () => getColumns(showPopupDetail, deleteList, isExternalReviewer),
    [deleteList, isExternalReviewer, showPopupDetail],
  );

  const listPage = useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList,
    setRowSelection,
    defaultPageRequest: { FileTypeId: undefined, Status: undefined },
  });

  const { options: fileTypeOptions, isLoading: isFileTypeLoading } = useFileTypeOptions();

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
      searchInputClassName="col-span-1 bg-background md:col-span-2"
      filterContent={
        <>
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
            value={pageRequest.Status?.toString()}
            onValueChange={(val) => {
              setPageRequest((prev) => ({
                ...prev,
                Status: val ? Number(val) : undefined,
                PageIndex: 1,
              }));
            }}
            placeholder="Tất cả trạng thái"
            searchPlaceholder="Tìm kiếm trạng thái..."
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
      deleteDisabled={selectedIds.length === 0}
      showDeleteConfirm={listPage.showDeleteConfirm}
      onDeleteConfirmChange={listPage.setShowDeleteConfirm}
      onDeleteConfirm={listPage.handleDelete}
      deleteItemCount={selectedIds.length}
      isDeleteLoading={isLoading}
      extraActions={
        isExternalReviewer ? null : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowSubmitConfirm(true)}
            disabled={selectedIds.length === 0 || isSubmitting}
          >
            Gửi duyệt
          </Button>
        )
      }
    >
      {isOpen && !isExternalReviewer && (
        <PopupEvidence
          key={evidence?.Id || "new"}
          evidence={evidence}
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          saveChange={saveChange}
          isLoading={isLoading}
          onApprove={onApprove}
          isApproving={isApproving}
        />
      )}

      <Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận gửi duyệt</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn gửi duyệt {selectedIds.length} mục đã chọn không?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button
              variant="secondary"
              disabled={isSubmitting}
              onClick={async () => {
                await submitToApprove(selectedIds);
                setShowSubmitConfirm(false);
                setRowSelection({});
              }}
            >
              Gửi duyệt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
};

export default EvidencePage;

