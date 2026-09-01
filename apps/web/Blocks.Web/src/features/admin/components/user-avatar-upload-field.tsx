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
    if (!selectedFile) return null
    return URL.createObjectURL(selectedFile)
  }, [selectedFile])

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  const displaySource = previewUrl ?? currentAvatar ?? null
  const description = selectedFile
    ? `Tệp mới: ${selectedFile.name}`
    : currentAvatar
      ? "Đang dùng ảnh hiện tại."
      : "Chưa có ảnh đại diện."

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-muted/20 p-4">
      <Avatar className="size-20 border border-border bg-background">
        <AvatarImage src={displaySource ?? undefined} alt="Ảnh đại diện" />
        <AvatarFallback>AV</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Ảnh đại diện</p>
        <p className="mt-1 truncate text-sm text-muted-foreground">{description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
            Chọn ảnh
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onFileChange(null)}
            disabled={!selectedFile}
          >
            Xóa ảnh đã chọn
          </Button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
    </div>
  )
}
