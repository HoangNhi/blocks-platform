import { Trash2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

type ConfirmActionProps = {
  label: string
  confirmLabel: string
  disabled?: boolean
  onConfirm: () => Promise<void> | void
}

export function ConfirmAction({
  label,
  confirmLabel,
  disabled,
  onConfirm,
}: ConfirmActionProps) {
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleConfirm() {
    if (isSubmitting) return

    setIsSubmitting(true)

    try {
      await onConfirm()
      setIsConfirming(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isConfirming) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="destructive"
          disabled={isSubmitting}
          onClick={() => void handleConfirm()}
        >
          {confirmLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => setIsConfirming(false)}
        >
          Hủy
        </Button>
      </div>
    )
  }

  return (
    <Button
      type="button"
      variant="destructive"
      disabled={disabled}
      onClick={() => setIsConfirming(true)}
    >
      <Trash2 className="size-4" aria-hidden="true" />
      {label}
    </Button>
  )
}
