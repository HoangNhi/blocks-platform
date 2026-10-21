import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

interface ApprovalActionsProps {
    status: string;
    isEdit: boolean;
    isLoading?: boolean;
    isApproving?: boolean;
    onApprove: (status: number, reason?: string) => void;
    onSubmit: (status: number) => void;
}

export function ApprovalActions({
    status,
    isEdit,
    isLoading,
    isApproving,
    onApprove,
    onSubmit,
}: ApprovalActionsProps) {
    const [showApproveConfirm, setShowApproveConfirm] = useState(false);
    const [showRejectDialog, setShowRejectDialog] = useState(false);
    const [rejectionReason, setRejectionReason] = useState("");
    const [rejectionError, setRejectionError] = useState("");

    return (
        <>
            <div className="flex justify-end gap-2 w-full">
                <DialogClose asChild>
                    <Button variant="outline" disabled={isLoading}>
                        Hủy bỏ
                    </Button>
                </DialogClose>

                {status === "2" ? (
                    <>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                                setRejectionReason("");
                                setRejectionError("");
                                setShowRejectDialog(true);
                            }}
                            disabled={isLoading || isApproving}
                        >
                            Không duyệt
                        </Button>
                        <Button
                            type="button"
                            variant="default"
                            onClick={() => setShowApproveConfirm(true)}
                            disabled={isLoading || isApproving}
                        >
                            Duyệt
                        </Button>
                    </>
                ) : (
                    <>
                        {status !== "3" && (
                            <Button
                                type="button"
                                onClick={() => onSubmit(1)}
                                disabled={isLoading}
                            >
                                {isLoading && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Lưu
                            </Button>
                        )}
                        {!isEdit && (
                            <Button
                                type="button"
                                onClick={() => onSubmit(2)}
                                disabled={isLoading}
                            >
                                {isLoading && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Lưu và gửi
                            </Button>
                        )}
                    </>
                )}
            </div>

            <ConfirmDeleteDialog
                open={showApproveConfirm}
                onOpenChange={setShowApproveConfirm}
                onConfirm={() => {
                    onApprove(3);
                    setShowApproveConfirm(false);
                }}
                title="Xác nhận duyệt"
                description="Bạn có chắc chắn muốn duyệt minh chứng này không?"
                confirmText="Duyệt"
                confirmVariant="default"
                isLoading={isApproving}
                stopAutoClose={true}
            />

            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <DialogContent
                    className="sm:max-w-md"
                    onPointerDownOutside={(e) => e.preventDefault()}
                >
                    <DialogHeader>
                        <DialogTitle>Lý do không duyệt</DialogTitle>
                    </DialogHeader>
                    <div className="py-2">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none">
                                Lý do <span className="text-red-500">*</span>
                            </label>
                            <Textarea
                                value={rejectionReason}
                                onChange={(e) => {
                                    setRejectionReason(e.target.value);
                                    if (e.target.value.trim()) setRejectionError("");
                                }}
                                placeholder="Nhập lý do không duyệt..."
                                rows={4}
                            />
                            {rejectionError && (
                                <p className="text-[0.8rem] font-medium text-destructive">
                                    {rejectionError}
                                </p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline" disabled={isApproving}>
                                Hủy bỏ
                            </Button>
                        </DialogClose>
                        <Button
                            variant="destructive"
                            disabled={isApproving}
                            onClick={() => {
                                if (!rejectionReason.trim()) {
                                    setRejectionError("Vui lòng nhập lý do không duyệt");
                                    return;
                                }
                                onApprove(4, rejectionReason.trim());
                                setShowRejectDialog(false);
                            }}
                        >
                            {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Xác nhận
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

