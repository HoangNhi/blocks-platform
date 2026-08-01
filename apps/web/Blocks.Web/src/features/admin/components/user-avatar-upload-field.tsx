import { useEffect, useMemo, useRef } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

type UserAvatarUploadFieldProps = {
  currentAvatar: string | null
  selectedFile: File | null
  onFileChange: (file: File | null) => void
}

export function UserAvatarUploadField({
  currentAvatar,
  selectedFile,
  onFileChange,
}: UserAvatarUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const previewUrl = useMemo(() => {
    if (!selectedFile) {
      return null
    }

    return URL.createObjectURL(selectedFile)
  }, [selectedFile])

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    },
    [previewUrl],
  )

  const displaySource = previewUrl ?? currentAvatar ?? null
  const isClearable = Boolean(selectedFile)

  const description = useMemo(() => {
    if (selectedFile) {
      return `Tệp mới: ${selectedFile.name}`
    }

    if (currentAvatar) {
      return "Đang dùng ảnh hiện tại."
    }

    return "Chưa có ảnh đại diện."
  }, [currentAvatar, selectedFile])

  return (
    <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center gap-3">
        <Avatar size="lg" className="border border-border bg-background">
          <AvatarImage src={displaySource ?? undefined} alt="Ảnh đại diện" />
          <AvatarFallback>AV</AvatarFallback>
        </Avatar>
        <div className="grid gap-1">
          <p className="text-sm font-medium text-foreground">Ảnh đại diện</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
        >
          Chọn ảnh
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onFileChange(null)}
          disabled={!isClearable}
        >
          Xóa tệp đã chọn
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  )
}
