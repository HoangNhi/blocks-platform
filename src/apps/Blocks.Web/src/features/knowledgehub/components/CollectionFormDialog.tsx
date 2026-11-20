import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type {
  CollectionDto,
  CollectionInput,
} from "../types/collections.types";
import {
  collectionFormSchema,
  toCollectionInput,
  type CollectionFormValues,
} from "./collection-form.schema";

interface Props {
  open: boolean;
  mode: "create" | "edit";
  initial: CollectionDto | null;
  pending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CollectionInput) => Promise<void>;
}

export function CollectionFormDialog({
  open,
  mode,
  initial,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: Props) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const form = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: {
      Name: "",
      Description: "",
    },
  });
  const { reset } = form;
  const previousInitialRef = useRef<string | null>(null);

  useEffect(() => {
    const targetKey = !open
      ? null
      : mode === "edit"
        ? "edit:" + (initial?.Id ?? "")
        : "create";

    if (targetKey === previousInitialRef.current) return;

    previousInitialRef.current = targetKey;
    if (open) {
      reset({
        Name: mode === "edit" ? (initial?.Name ?? "") : "",
        Description: mode === "edit" ? (initial?.Description ?? "") : "",
      });
    }
  }, [open, mode, initial, reset]);

  const requestOpenChange = (next: boolean) => {
    if (!pending) onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
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
        onInteractOutside={(e) => {
          if (pending) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Tạo bộ sưu tập" : "Đổi tên bộ sưu tập"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await onSubmit(toCollectionInput(values));
              } catch {
                // The parent supplies the real API error through the error prop.
              }
            })}
          >
            <FormField
              control={form.control}
              name="Name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên bộ sưu tập *</FormLabel>
                  <FormControl>
                    <Input {...field} aria-label="Tên bộ sưu tập" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="Description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mô tả</FormLabel>
                  <FormControl>
                    <Textarea {...field} aria-label="Mô tả" rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => requestOpenChange(false)}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={pending || form.formState.isSubmitting}
              >
                {pending ? "Đang lưu..." : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
