import type { RefObject } from "react";
import type { UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { useFileTypeOptions } from "@/features/catalog/hooks/useFileTypeOptions";
import UploadFile, { type UploadFileRef } from "@/components/ui/upload-file";
import type { Attachment } from "@/features/file/types/uploadfile.types";
import { cn } from "@/lib/utils";

interface EvidenceFormFieldsProps {
  form: UseFormReturn<any>;
  isPending: boolean;
  uploadRef: RefObject<UploadFileRef | null>;
  listAttachment: Attachment[];
  folderUpload: string;
  handleAttachmentChange: (attachments: Attachment[]) => void;
  attachmentError: string;
  status: string;
  onFileTypeChange?: (val: string, text?: string) => void;
  viewerMode?: "internal" | "external";
  allowAttachmentDownload?: boolean;
}

export function EvidenceFormFields({
  form,
  isPending,
  uploadRef,
  listAttachment,
  folderUpload,
  handleAttachmentChange,
  attachmentError,
  status,
  onFileTypeChange,
  viewerMode = "internal",
  allowAttachmentDownload = true,
}: EvidenceFormFieldsProps) {
  const { options: fileTypeOptions, isLoading: isFileTypeLoading } =
    useFileTypeOptions();

  return (
    <>
      {status === "4" && (
        <FormField
          control={form.control}
          name="rejectionReason"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                Lý do không duyệt
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value || ""}
                  placeholder="Lý do không duyệt"
                  readOnly={true}
                  className="bg-muted cursor-not-allowed"
                  rows={4}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
              Tên minh chứng
            </FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value || ""}
                placeholder="Ví dụ: Quy định về đào tạo năm 2024"
                readOnly={isPending}
                className={cn(isPending && "bg-muted cursor-not-allowed")}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                Mã minh chứng
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value || ""}
                  placeholder="HC.01.02"
                  readOnly={isPending}
                  className={cn(isPending && "bg-muted cursor-not-allowed")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fileTypeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                Loại tài liệu
              </FormLabel>
              <FormControl>
                <Combobox
                  options={fileTypeOptions}
                  loading={isFileTypeLoading}
                  value={field.value}
                  onValueChange={(val, text) => {
                    field.onChange(val || "");
                    if (onFileTypeChange) {
                      onFileTypeChange(val || "", text || "");
                    }
                  }}
                  placeholder="Chọn loại tài liệu"
                  searchPlaceholder="Tìm kiếm loại tài liệu..."
                  emptyText="Không tìm thấy loại tài liệu."
                  readonly={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormItem>
        <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
          Tệp đính kèm
        </FormLabel>
        <FormControl>
          <UploadFile
            ref={uploadRef}
            listAttachment={listAttachment}
            folderUpload={folderUpload}
            setListAttachment={handleAttachmentChange}
            fileValidate={[
              ".jpg",
              ".png",
              ".pdf",
              ".doc",
              ".docx",
              ".xls",
              ".xlsx",
              ".mp4",
            ]}
            fileValidateText=".jpg, .png, .pdf, .doc, .docx, .xls, .xlsx, .mp4"
            fileSizeLimit={100}
            readonly={isPending}
            hasError={!!attachmentError}
            viewerMode={viewerMode}
            allowDownload={allowAttachmentDownload}
          />
        </FormControl>
        {attachmentError && (
          <p className="text-[0.8rem] font-medium text-destructive">
            {attachmentError}
          </p>
        )}
      </FormItem>

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Mô tả tóm tắt</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={field.value || ""}
                placeholder="Nội dung chính..."
                rows={3}
                readOnly={isPending}
                className={cn(
                  isPending && "bg-muted cursor-not-allowed resize-none",
                )}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="issueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ngày ban hành</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  {...field}
                  value={field.value || ""}
                  readOnly={isPending}
                  className={cn(isPending && "bg-muted cursor-not-allowed")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="expiryDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ngày hết hạn</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  {...field}
                  value={field.value || ""}
                  readOnly={isPending}
                  className={cn(isPending && "bg-muted cursor-not-allowed")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="issuingAuthority"
          render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel>Cơ quan ban hành</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value || ""}
                  placeholder="Tên cơ quan"
                  readOnly={isPending}
                  className={cn(isPending && "bg-muted cursor-not-allowed")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}
