import { useMemo } from "react";
import { Combobox } from "@/components/ui/combobox";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";
import { useAuth } from "@/hooks/useAuth";
import { useCycleOptions } from "@/features/business/hooks/useCycleOptions";
import { useSar } from "@/features/business/hooks/useSar";
import type { SarStatus } from "@/features/business/types/sar.types";
import { getColumns } from "./columns";
import PopupSarEditor from "./PopupSarEditor";

const SAR_STATUS_OPTIONS = [
  { Text: "Nháp", Value: "1" },
  { Text: "Đã nộp", Value: "2" },
  { Text: "Yêu cầu chỉnh sửa", Value: "3" },
  { Text: "Đã phê duyệt", Value: "4" },
];

function parseSarStatus(value?: string): SarStatus | undefined {
  if (!value) {
    return undefined;
  }

  switch (value) {
    case "1":
      return 1;
    case "2":
      return 2;
    case "3":
      return 3;
    case "4":
      return 4;
    default:
      return undefined;
  }
}

export default function SarPage() {
  const { isExternalReviewer } = useAuth();
  const {
    data,
    rowSelection,
    setRowSelection,
    pageRequest,
    setPageRequest,
    getList,
    isFetching,
    isOpen,
    selectedSar,
    showPopupDetail,
    onOpenChange,
    draft,
    isDraftFetching,
    refetchDraft,
    saveDraft,
    submitSar,
    isSubmitting,
  } = useSar();

  const cycleOptions = useCycleOptions();
  const columns = useMemo(
    () =>
      getColumns(
        showPopupDetail,
        true,
        true,
        !isExternalReviewer,
      ),
    [isExternalReviewer, showPopupDetail],
  );

  const listPage = useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList: () => {
      // SAR scope does not include delete action.
    },
    setRowSelection,
    defaultPageRequest: {
      Status: undefined,
      CycleId: undefined,
    },
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
      hideAdd
      searchInputClassName="col-span-1 bg-background"
      filterGridCols={isExternalReviewer ? "md:grid-cols-2" : "md:grid-cols-3"}
      filterContent={
        <>
          <Combobox
            options={SAR_STATUS_OPTIONS}
            value={pageRequest.Status ? String(pageRequest.Status) : undefined}
            onValueChange={(val) => {
              setPageRequest((prev) => ({
                ...prev,
                Status: parseSarStatus(val),
                PageIndex: 1,
              }));
            }}
            placeholder="Tất cả trạng thái SAR"
            searchPlaceholder="Tìm trạng thái..."
            emptyText="Không tìm thấy trạng thái."
          />
          {!isExternalReviewer && (
            <Combobox
              options={cycleOptions.options ?? []}
              value={pageRequest.CycleId ?? undefined}
              onValueChange={(val) => {
                setPageRequest((prev) => ({
                  ...prev,
                  CycleId: val || undefined,
                  PageIndex: 1,
                }));
              }}
              placeholder="Tất cả chu kỳ"
              searchPlaceholder="Tìm chu kỳ..."
              emptyText="Không tìm thấy chu kỳ."
            />
          )}
        </>
      }
    >
      {isOpen && selectedSar && (
        <PopupSarEditor
          open={isOpen}
          onOpenChange={onOpenChange}
          cycle={selectedSar}
          draft={draft}
          isDraftLoading={isDraftFetching}
          onRefreshDraft={() => {
            void refetchDraft();
          }}
          onSaveDraft={saveDraft}
          onSubmitSar={submitSar}
          isSubmitting={isSubmitting}
          canSubmitByRole={isExternalReviewer ? false : (draft?.CanSubmitByRole ?? false)}
          canEditByRole={isExternalReviewer ? false : (draft?.CanEditByRole ?? false)}
        />
      )}
    </ListPageLayout>
  );
}
