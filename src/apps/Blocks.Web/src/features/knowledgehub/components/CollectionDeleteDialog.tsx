import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CollectionDto } from "../types/collections.types";

interface Props {
  target: CollectionDto | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CollectionDeleteDialog({
  target,
  pending,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        onOpenAutoFocus={() => {
          const activeElement = document.activeElement;
          returnFocusRef.current =
            activeElement instanceof HTMLElement ? activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
          returnFocusRef.current = null;
        }}
        onInteractOutside={(event) => {
          if (pending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Xác nhận xóa bộ sưu tập</DialogTitle>
          <DialogDescription>
            {target
              ? "Xóa " +
                target.Name +
                " (ID: " +
                target.Id.slice(0, 8) +
                ")? P02 chưa hỗ trợ khôi phục bộ sưu tập."
              : ""}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            Hủy
          </Button>
          <Button
            variant="destructive"
            disabled={pending || !target}
            onClick={() => {
              if (target && !pending) onConfirm();
            }}
          >
            {pending ? "Đang xóa..." : "Xóa bộ sưu tập"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
