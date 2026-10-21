import { fileService } from "@/features/file/api/uploadfile.api";
import type { Attachment } from "@/features/file/types/uploadfile.types";
import { getFileUrl } from "@/lib/utils";
import FileViewerDialog from "@/components/ui/file-viewer-dialog";
import {
  Paperclip,
  Trash,
  UploadCloud,
  X,
  FileIcon,
  Eye,
  Download,
} from "lucide-react";
import { toast } from "sonner";

import React, {
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";

export interface UploadFileProps {
  noUpload?: boolean;
  readonly?: boolean;
  allowDownload?: boolean;
  listAttachment?: Attachment[];
  setListAttachment?: (attachments: Attachment[]) => void;
  multiFile?: boolean;
  fileValidate?: string[];
  fileValidateText?: string;
  fileSizeLimit?: number;
  folderUpload?: string;
  onSuccess?: () => void;
  hasError?: boolean;
  viewerMode?: "internal" | "external";
  previewContext?: "evidence" | "taskAttachment" | "ActionPlan";
}

export interface UploadFileRef {
  upload: () => Promise<boolean>;
  getPendingFiles: () => File[];
}

const UploadFile = forwardRef<UploadFileRef, UploadFileProps>(
  (
    {
      noUpload = false,
      readonly = false,
      allowDownload = true,
      listAttachment = [],
      setListAttachment,
      multiFile = true,
      fileValidate = [".jpg", ".png", ".pdf", ".doc", ".docx", ".xls", ".xlsx"],
      fileValidateText = ".jpg, .png, .pdf, .doc, .docx, .xls, .xlsx",
      fileSizeLimit = 10,
      folderUpload = "DefaultFolder",
      onSuccess,
      hasError = false,
      viewerMode = "internal",
      previewContext = "evidence",
    },
    ref,
  ) => {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [viewerFile, setViewerFile] = useState<Attachment | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      getPendingFiles: () => selectedFiles,
      upload: async () => {
        if (selectedFiles.length === 0) return true; // Nothing to upload is technically success
        return await performUpload();
      },
    }));

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const validFiles: File[] = [];
      const errors: string[] = [];

      Array.from(files).forEach((file) => {
        const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
        if (!fileValidate.includes(fileExt)) {
          errors.push(
            `Tệp "${file.name}" không hợp lệ (chỉ chấp nhận: ${fileValidateText}).`,
          );
          return;
        }
        if (file.size > fileSizeLimit * 1024 * 1024) {
          errors.push(
            `Tệp "${file.name}" quá lớn (tối đa ${fileSizeLimit}MB).`,
          );
          return;
        }
        validFiles.push(file);
      });

      if (errors.length > 0) {
        toast.error(errors.join(" "));
      }

      setSelectedFiles((prev) =>
        multiFile ? [...prev, ...validFiles] : validFiles,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const performUpload = async (): Promise<boolean> => {
      try {
        const response = await fileService.uploadFile({
          files: selectedFiles,
          folderUpload: folderUpload,
        });

        if (response.Success) {
          onSuccess?.();
          return true;
        } else {
          throw new Error(response.Message);
        }
      } catch (error) {
        return false; // Crucial: Stop the process here
      }
    };

    const handleDeleteAttachment = (id: string) => {
      if (window.confirm("Xóa tệp này?") && setListAttachment) {
        const newList = listAttachment.filter((a) => a.Id !== id);
        setListAttachment(newList);
      }
    };

    const handlePreview = (file: Attachment) => {
      setViewerFile(file);
    };

    const handleDownload = async (file: Attachment) => {
      const url = getFileUrl(file.FileUrl);
      if (!url) return;
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download =
          file.FullFileName || file.FileUrl.split("/").pop() || "download";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      } catch (error) {
        window.open(url, "_blank");
      }
    };

    return (
      <div className="w-full text-sm overflow-x-hidden">
        {/* Attachment Table */}
        {listAttachment.length > 0 && (
          <div className="mb-3 border rounded-lg bg-white overflow-hidden shadow-sm">
            <div className="bg-gray-50 px-3 py-2 border-b flex items-center gap-2 font-semibold text-gray-700">
              <Paperclip size={14} className="text-blue-500" /> TỆP ĐÃ TẢI LÊN
            </div>
            <div className="divide-y">
              {listAttachment.map((file) => (
                <div
                  key={file.Id}
                  className="flex w-full min-w-0 items-center hover:bg-gray-50"
                >
                  <span
                    className="block flex-1 min-w-0 px-3 py-2 text-blue-600 truncate"
                    title={file.FullFileName}
                  >
                    {file.FullFileName}
                  </span>
                  <div className="shrink-0 px-3 py-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePreview(file)}
                      className="text-gray-400 hover:text-blue-500"
                      title="Xem trước"
                    >
                      <Eye size={16} />
                    </button>
                    {allowDownload && (
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        className="text-gray-400 hover:text-green-500"
                        title="Tải xuống"
                      >
                        <Download size={16} />
                      </button>
                    )}
                    {!readonly && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(file.Id)}
                        className="text-gray-400 hover:text-red-500"
                        title="Xóa"
                      >
                        <Trash size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dropzone Area */}
        {!noUpload && !readonly && (
          <div
            className={`border-2 border-dashed rounded-lg p-4 transition-colors ${hasError ? "border-red-400 bg-red-50 hover:border-red-500" : "bg-gray-50 hover:border-blue-400"}`}
          >
            <input
              type="file"
              ref={fileInputRef}
              multiple={multiFile}
              onChange={handleFileSelect}
              className="hidden"
              id="file-up"
              accept={fileValidate.join(",")}
            />
            <label
              htmlFor="file-up"
              className="flex flex-col items-center cursor-pointer"
            >
              <UploadCloud className="mb-2 text-blue-500" />
              <span className="font-medium">Chọn tệp tin...</span>
              <span className="text-xs text-gray-400">
                ({fileValidateText})
              </span>
            </label>

            {/* Staging List */}
            {selectedFiles.length > 0 && (
              <div className="mt-4 space-y-1">
                {selectedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-white p-2 border rounded gap-2"
                  >
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <FileIcon
                        size={14}
                        className="shrink-0 text-orange-400"
                      />
                      <span
                        className="block flex-1 min-w-0 truncate italic text-xs"
                        title={f.name}
                      >
                        {f.name}
                      </span>
                    </div>
                    <X
                      size={14}
                      className="shrink-0 cursor-pointer text-gray-400 hover:text-red-500"
                      onClick={() =>
                        setSelectedFiles((s) => s.filter((_, idx) => idx !== i))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <FileViewerDialog
          isOpen={!!viewerFile}
          onClose={() => setViewerFile(null)}
          file={viewerFile}
          mode={viewerMode}
          allowDownload={allowDownload}
          previewContext={previewContext}
        />
      </div>
    );
  },
);

export default UploadFile;
