import { fileService } from "@/features/file/api/uploadfile.api";
import type { AvatarUploadResult } from "@/features/file/types/avatar.types";
import { useAvatarUrl } from "@/features/file/hooks/useAvatarUrl";
import { Camera, User as UserIcon, X } from "lucide-react";
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";

export interface UploadAvatarProps {
  defaultImage?: string;
  className?: string;
  onChange?: (file: File | null) => void;
}

export interface UploadAvatarRef {
  upload: () => Promise<AvatarUploadResult>;
  reset: () => void;
}

const UploadAvatar = forwardRef<UploadAvatarRef, UploadAvatarProps>(
  ({ defaultImage, className, onChange }, ref) => {
    const serverAvatarUrl = useAvatarUrl(defaultImage);
    const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isRemoved, setIsRemoved] = useState<boolean>(false);

    const stagedSessionRef = useRef<{
      file: File;
      folderUpload: string;
    } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const activeBlobUrlRef = useRef<string | null>(null);

    const preview = selectedPreview ?? (isRemoved ? null : serverAvatarUrl);

    useEffect(() => {
      return () => {
        if (activeBlobUrlRef.current) {
          URL.revokeObjectURL(activeBlobUrlRef.current);
        }
      };
    }, []);

    useImperativeHandle(ref, () => ({
      upload: async (): Promise<AvatarUploadResult> => {
        if (selectedFile) {
          if (
            stagedSessionRef.current &&
            stagedSessionRef.current.file === selectedFile
          ) {
            return {
              kind: "staged",
              folderUpload: stagedSessionRef.current.folderUpload,
            };
          }

          const folderUpload = uuidv4();
          await fileService.uploadFile({
            files: [selectedFile],
            folderUpload,
          });

          stagedSessionRef.current = { file: selectedFile, folderUpload };
          return { kind: "staged", folderUpload };
        }

        if (isRemoved) {
          return { kind: "remove" };
        }

        return { kind: "unchanged" };
      },
      reset: () => {
        if (activeBlobUrlRef.current) {
          URL.revokeObjectURL(activeBlobUrlRef.current);
          activeBlobUrlRef.current = null;
        }
        setSelectedPreview(null);
        setSelectedFile(null);
        setIsRemoved(false);
        stagedSessionRef.current = null;
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    }));

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
      if (!validTypes.includes(file.type.toLowerCase())) {
        alert("Vui lòng chọn tệp hình ảnh PNG, JPEG hoặc WebP.");
        return;
      }

      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }

      const objectUrl = URL.createObjectURL(file);
      activeBlobUrlRef.current = objectUrl;
      setSelectedPreview(objectUrl);
      setSelectedFile(file);
      setIsRemoved(false);
      stagedSessionRef.current = null;
      onChange?.(file);
    };

    const handleRemove = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
      setSelectedPreview(null);
      setSelectedFile(null);
      setIsRemoved(true);
      stagedSessionRef.current = null;
      onChange?.(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const triggerSelect = () => {
      fileInputRef.current?.click();
    };

    return (
      <div className={cn("relative flex flex-col items-center gap-2", className)}>
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

          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="text-white" size={24} />
            <span className="text-xs text-white p-1">Thay đổi</span>
          </div>

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
          accept="image/png, image/jpeg, image/webp"
        />
      </div>
    );
  }
);

UploadAvatar.displayName = "UploadAvatar";

export default UploadAvatar;
