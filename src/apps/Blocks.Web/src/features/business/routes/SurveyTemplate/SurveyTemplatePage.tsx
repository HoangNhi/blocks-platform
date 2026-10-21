import { useMemo } from "react";
import { useSurveyTemplate } from "../../hooks/useSurveyTemplate";
import { getColumns } from "./columns";
import PopupSurveyTemplate from "./PopupSurveyTemplate";
import { Combobox } from "@/components/ui/combobox";
import { STAKEHOLDER_TYPES } from "@/constants/catalog.constants";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";

const SurveyTemplatePage = () => {
  const {
    data,
    surveyTemplate,
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
  } = useSurveyTemplate();

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
    defaultPageRequest: { StakeholderType: undefined },
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
      searchInputClassName="col-span-1 bg-background"
      filterContent={
        <Combobox
          options={STAKEHOLDER_TYPES}
          value={pageRequest.StakeholderType?.toString()}
          onValueChange={(val) => {
            setPageRequest((prev: any) => ({
              ...prev,
              StakeholderType: val ? Number(val) : undefined,
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
        <PopupSurveyTemplate
          key={surveyTemplate?.Id || "new"}
          surveyTemplate={surveyTemplate}
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          saveChange={saveChange}
          isLoading={isLoading}
        />
      )}
    </ListPageLayout>
  );
};

export default SurveyTemplatePage;
