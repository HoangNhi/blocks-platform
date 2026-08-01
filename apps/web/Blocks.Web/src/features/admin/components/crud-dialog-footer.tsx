import { Button } from "@/components/ui/button"

import type { EntityDialogMode, EntityDialogSubmitIntent } from "../entity-dialog-state"

type CrudDialogFooterProps = {
  mode: EntityDialogMode | null
  isSubmitting?: boolean
  onCancel: () => void
  onSaveAndAddMore?: () => void
  submitIntent?: EntityDialogSubmitIntent | null
}

export function CrudDialogFooter({
  mode,
  isSubmitting = false,
  onCancel,
  onSaveAndAddMore,
  submitIntent,
}: CrudDialogFooterProps) {
  const showSaveAndAddMore = mode === "create" && Boolean(onSaveAndAddMore)

  return (
    <div className="flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
        Hủy
      </Button>
      {showSaveAndAddMore ? (
        <Button
          type="button"
          variant="secondary"
          onClick={onSaveAndAddMore}
          disabled={isSubmitting}
        >
          Lưu và thêm tiếp
        </Button>
      ) : null}
      <Button
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting && submitIntent === "save" ? "Đang lưu..." : "Lưu"}
      </Button>
    </div>
  )
}
