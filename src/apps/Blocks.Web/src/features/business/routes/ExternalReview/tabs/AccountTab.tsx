import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import type { ExternalReviewAccount } from "@/features/business/types/externalReview.types";
import { useExternalReviewAccountList } from "../hooks/useExternalReviewAccountList";
import { getAccountColumns } from "./accountColumns";
import { EditAccountDialog } from "./EditAccountDialog";
import {
  getSelectedAccountIds,
  summarizeBulkDelete,
} from "./accountTab.utils";
import { toast } from "sonner";

interface AccountTabProps {
  externalReviewId?: string;
  isSubmitting: boolean;
  isReadOnly: boolean;
  onCreateAndLinkAccount: (payload: {
    fullname: string;
    username: string;
    email: string;
    password: string;
  }) => Promise<void>;
  onRemoveAccount: (accountId: string) => Promise<void>;
  onUpdateAccount: (payload: {
    accountId: string;
    fullname: string;
    username: string;
    email: string;
    isActived: boolean;
    password?: string;
  }) => Promise<void>;
  onAccountCountChange?: (count: number) => void;
}

const EMPTY_FORM = {
  fullname: "",
  username: "",
  email: "",
  password: "",
};

export function AccountTab({
  externalReviewId,
  isSubmitting,
  isReadOnly,
  onCreateAndLinkAccount,
  onRemoveAccount,
  onUpdateAccount,
  onAccountCountChange,
}: AccountTabProps) {
  const accountList = useExternalReviewAccountList(externalReviewId);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingAccount, setEditingAccount] =
    useState<ExternalReviewAccount | null>(null);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const columns = useMemo(
    () => getAccountColumns(isReadOnly, setEditingAccount),
    [isReadOnly],
  );

  const selectedCount = Object.keys(accountList.rowSelection).length;

  const handleCloseCreateDialog = () => {
    setShowCreateDialog(false);
    setCreateForm(EMPTY_FORM);
    setCreateError(null);
  };

  const handleCreateAccount = async () => {
    if (
      !createForm.fullname.trim() ||
      !createForm.username.trim() ||
      !createForm.email.trim() ||
      !createForm.password.trim()
    ) {
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      await onCreateAndLinkAccount({
        fullname: createForm.fullname.trim(),
        username: createForm.username.trim(),
        email: createForm.email.trim(),
        password: createForm.password.trim(),
      });

      const refreshed = await accountList.refetch();
      onAccountCountChange?.(refreshed.data?.TotalRow ?? accountList.data.TotalRow);
      handleCloseCreateDialog();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể tạo tài khoản.";
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleBulkDelete = async () => {
    const selectedIds = getSelectedAccountIds(
      accountList.data.Data,
      accountList.rowSelection,
    );

    if (selectedIds.length === 0) {
      return;
    }

    setShowDeleteConfirm(false);

    const results = await Promise.allSettled(
      selectedIds.map((accountId) => onRemoveAccount(accountId)),
    );
    const summary = summarizeBulkDelete(results);
    const failedIds = selectedIds.filter(
      (_, index) => results[index].status === "rejected",
    );

    const refreshed = await accountList.refetch();
    const nextData = refreshed.data?.Data ?? accountList.data.Data;
    onAccountCountChange?.(refreshed.data?.TotalRow ?? accountList.data.TotalRow);

    if (failedIds.length > 0) {
      const nextSelection: Record<string, boolean> = {};
      nextData.forEach((item, index) => {
        if (failedIds.includes(item.Id)) {
          nextSelection[String(index)] = true;
        }
      });
      accountList.setRowSelection(nextSelection);
    } else {
      accountList.setRowSelection({});
    }

    if (summary.failedCount === 0) {
      toast.success(`Đã xoá ${summary.successCount} tài khoản.`);
      return;
    }

    toast.error(
      `Đã xoá ${summary.successCount} tài khoản, thất bại ${summary.failedCount}.`,
    );
  };

  const handleUpdateAccount = async (payload: {
    accountId: string;
    fullname: string;
    username: string;
    email: string;
    isActived: boolean;
    password?: string;
  }) => {
    await onUpdateAccount(payload);
    setEditingAccount(null);
    const refreshed = await accountList.refetch();
    onAccountCountChange?.(refreshed.data?.TotalRow ?? accountList.data.TotalRow);
  };

  return (
    <div className="space-y-4">
      <ListPageLayout
        columns={columns}
        data={accountList.data.Data}
        totalRow={accountList.data.TotalRow}
        rowSelection={accountList.rowSelection}
        setRowSelection={accountList.setRowSelection}
        pageRequest={accountList.pageRequest}
        setPageRequest={accountList.setPageRequest}
        onRefresh={() => {
          void accountList.refetch();
        }}
        isLoading={accountList.isFetching}
        searchTerm={accountList.searchTerm}
        onSearchTermChange={accountList.setSearchTerm}
        onResetFilters={accountList.handleResetFilters}
        compactToolbar
        hideAdd={isReadOnly || !externalReviewId}
        onAddClick={
          isReadOnly || !externalReviewId
            ? undefined
            : () => setShowCreateDialog(true)
        }
        onDeleteClick={
          isReadOnly || !externalReviewId
            ? undefined
            : () => setShowDeleteConfirm(true)
        }
        deleteDisabled={isReadOnly || selectedCount === 0}
        showDeleteConfirm={showDeleteConfirm}
        onDeleteConfirmChange={setShowDeleteConfirm}
        onDeleteConfirm={() => void handleBulkDelete()}
        deleteItemCount={selectedCount}
        isDeleteLoading={isSubmitting}
        tableContainerClassName="max-h-[420px] overflow-auto w-full relative"
      />

      {editingAccount ? (
        <EditAccountDialog
          open={!!editingAccount}
          account={editingAccount}
          isSubmitting={isSubmitting}
          onOpenChange={(open) => {
            if (!open) {
              setEditingAccount(null);
            }
          }}
          onSubmit={handleUpdateAccount}
        />
      ) : null}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogTitle>Thêm tài khoản Chuyên gia</DialogTitle>

          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">
                Họ tên
              </label>
              <Input
                value={createForm.fullname}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    fullname: e.target.value,
                  }))
                }
                disabled={isCreating}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">
                Tài khoản
              </label>
              <Input
                value={createForm.username}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    username: e.target.value,
                  }))
                }
                disabled={isCreating}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">
                Email
              </label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                disabled={isCreating}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">
                Mật khẩu
              </label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                disabled={isCreating}
              />
            </div>

            {createError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
                {createError}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handleCloseCreateDialog}
                disabled={isCreating}
              >
                Hủy
              </Button>
              <Button
                onClick={() => void handleCreateAccount()}
                disabled={isCreating}
              >
                {isCreating ? "Đang tạo..." : "Tạo tài khoản"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
