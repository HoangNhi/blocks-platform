import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const {
    min,
    max,
    value,
    onChange,
    onBlur,
    onKeyDown,
    "aria-invalid": ariaInvalid,
    ...restProps
  } = props

  const [touched, setTouched] = React.useState(false)

  const hasMinMax = type === "number" && (min !== undefined || max !== undefined)

  let isOutOfRange = false
  if (hasMinMax && touched && value !== undefined && value !== "") {
    const num = Number(value)
    if (!isNaN(num)) {
      if (min !== undefined && num < Number(min)) isOutOfRange = true
      if (max !== undefined && num > Number(max)) isOutOfRange = true
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (hasMinMax && e.target.value !== "") {
      const num = Number(e.target.value)
      if (!isNaN(num)) {
        const numMin = min !== undefined ? Number(min) : -Infinity
        const numMax = max !== undefined ? Number(max) : Infinity
        const clamped = Math.min(numMax, Math.max(numMin, num))
        if (clamped !== num) {
          e.target.value = String(clamped)
          onChange?.(e as unknown as React.ChangeEvent<HTMLInputElement>)
        }
      }
    }
    setTouched(true)
    onBlur?.(e)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { key, ctrlKey, metaKey } = e

    if (ctrlKey || metaKey) { onKeyDown?.(e); return }

    if (
      /^\d$/.test(key) ||
      ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Home", "End", "Enter"].includes(key)
    ) { onKeyDown?.(e); return }

    if (key === "-" && e.currentTarget.selectionStart === 0 && !e.currentTarget.value.includes("-")) {
      onKeyDown?.(e); return
    }

    if (key === "." && !e.currentTarget.value.includes(".")) {
      onKeyDown?.(e); return
    }

    e.preventDefault()
  }

  return (
    <input
      type={type}
      data-slot="input"
      min={min}
      max={max}
      value={value}
      onChange={onChange}
      onBlur={hasMinMax ? handleBlur : onBlur}
      onKeyDown={type === "number" ? handleKeyDown : onKeyDown}
      aria-invalid={isOutOfRange || ariaInvalid || undefined}
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...restProps}
    />
  )
}

export { Input }
