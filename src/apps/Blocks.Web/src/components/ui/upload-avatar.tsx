import { fileService } from "@/features/file/api/uploadfile.api";
import { Camera, User as UserIcon, X } from "lucide-react";
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn, getFileUrl } from "@/lib/utils";

export interface UploadAvatarProps {
  defaultImage?: string;
  folderUpload?: string;
  className?: string;
  onChange?: (file: File | null) => void;
}

export interface UploadAvatarRef {
  upload: () => Promise<string | null>;
  reset: () => void;
}

const UploadAvatar = forwardRef<UploadAvatarRef, UploadAvatarProps>(
  (
    {
      defaultImage = getFileUrl("Files/Commons/NoPicture.png"),
      folderUpload = "Avatars",
      className,
      onChange,
    },
    ref
  ) => {
    const [preview, setPreview] = useState<string | null>(defaultImage || null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      upload: async () => {
        // Case 1: New file selected -> Upload
        if (selectedFile) {
          try {
            const response = await fileService.uploadFile({
              files: [selectedFile],
              folderUpload: folderUpload,
            });

            if (response.Success && response.Data && response.Data.length > 0) {
              return response.Data[0].FileUrl;
            }
            return null; // Upload failed
          } catch (error) {
            return null;
          }
        }

        // Case 2: Image removed (preview is null, but we had a default or just cleared it)
        // If preview is null, it means user removed it.
        // But we need to distinguish between "initially null" and "manually removed".
        // Actually, if preview is null, we should probably set Avatar to empty.
        // However, if defaultImage was null, and preview is null, it's "no change".
        // If defaultImage was "url", and preview is null, it's "removed".
        if (preview === null) {
          return defaultImage ? "" : null;
        }

        // Case 3: No change (preview exists and equals defaultImage - or just no selectedFile)
        return null;
      },
      reset: () => {
        setPreview(defaultImage || null);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    }));

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      // Basic validation
      if (!file.type.startsWith("image/")) {
        alert("Vui lòng chọn tệp hình ảnh.");
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      setSelectedFile(file);
      onChange?.(file);

      // Cleanup old object URL to avoid memory leaks (optional, but good practice if we were tracking history)
    };

    const handleRemove = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setPreview(null);
      setSelectedFile(null);
      onChange?.(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const triggerSelect = () => {
      fileInputRef.current?.click();
    };

    return (
      <div
        className={cn("relative flex flex-col items-center gap-2", className)}
      >
        <div
          onClick={triggerSelect}
          className="group relative h-32 w-32 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-gray-300 bg-gray-50 hover:border-blue-500 hover:bg-gray-100 transition-colors"
        >
          {preview ? (
            <img
              src={preview}
              alt="Avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-gray-400">
              <UserIcon size={48} strokeWidth={1} />
            </div>
          )}

          {/* Overlay on Hover */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="text-white" size={24} />
            <span className="text-xs text-white p-1">Thay đổi</span>
          </div>

          {/* Remove Button (Only if has image) */}
          {preview && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute right-1 top-1 z-10 rounded-full bg-white p-1 text-gray-500 shadow-sm hover:text-red-500 hidden group-hover:block"
              title="Xóa ảnh"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="image/png, image/jpeg, image/jpg, image/gif"
        />
      </div>
    );
  }
);

UploadAvatar.displayName = "UploadAvatar";

export default UploadAvatar;
