import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  itemCount?: number;
  isLoading?: boolean;
  stopAutoClose?: boolean;
  confirmText?: string;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Xác nhận xóa",
  description,
  itemCount = 1,
  isLoading = false,
  stopAutoClose = false,
  confirmText = "Xóa",
  confirmVariant = "destructive",
}: ConfirmDeleteDialogProps) {
  const defaultDescription =
    itemCount > 1
      ? `Bạn có chắc chắn muốn xóa ${itemCount} mục đã chọn không? Hành động này không thể hoàn tác.`
      : "Bạn có chắc chắn muốn xóa bản ghi này không? Hành động này không thể hoàn tác.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || defaultDescription}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isLoading}>
              Hủy
            </Button>
          </DialogClose>
          <Button
            variant={confirmVariant}
            disabled={isLoading}
            onClick={() => {
              onConfirm();
              if (!stopAutoClose) {
                onOpenChange(false);
              }
            }}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

