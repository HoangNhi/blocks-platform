import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ACTIVE_STATUS_OPTIONS } from "@/constants/catalog.constants";
import type { FileType } from "@/features/catalog/types/filetype.types";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  id: z.string(),
  code: z.string().min(1, "Mã loại file là bắt buộc"),
  name: z.string().min(2, "Tên phải từ 2-200 ký tự").max(200, "Tên phải từ 2-200 ký tự"),
  description: z.string().optional(),
  isActived: z.boolean(),
});

const PopupFileType = ({
  fileType,
  isOpen,
  onOpenChange,
  saveChange,
  isLoading,
}: {
  fileType: FileType | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (
    fileType: FileType & { IsEdit: boolean },
    isAddMore: boolean,
  ) => void;
  isLoading?: boolean;
}) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: fileType?.Id || uuidv4(),
      code: fileType?.Code || "",
      name: fileType?.Name || "",
      description: fileType?.Description || "",
      isActived: fileType?.IsActived ?? true,
    },
  });

  useEffect(() => {
    if (fileType) {
      form.reset({
        id: fileType.Id || uuidv4(),
        code: fileType.Code || "",
        name: fileType.Name || "",
        description: fileType.Description || "",
        isActived: fileType.IsActived ?? true,
      });
    } else {
      form.reset({
        id: uuidv4(),
        code: "",
        name: "",
        description: "",
        isActived: true,
      });
    }
  }, [fileType, form]);

  const onSubmit = (values: z.infer<typeof formSchema>, isAddMore: boolean) => {
    const payload = {
      Id: values.id,
      Code: values.code.trim(),
      Name: values.name.trim(),
      Description: values.description?.trim() || "",
      IsActived: values.isActived,
      IsEdit: fileType?.IsEdit || false,
      FolderUpload: "",
    };
    saveChange(payload as FileType & { IsEdit: boolean }, isAddMore);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <Form {...form}>
          <form
            id="fileType-form"
            onSubmit={form.handleSubmit((data) => onSubmit(data, false))}
            noValidate
          >
            <DialogHeader>
              <DialogTitle>
                {fileType?.IsEdit ? "Cập nhật Loại File" : "Thêm mới Loại File"}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                      Mã loại file
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nhập mã loại file" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                      Tên loại file
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nhập tên loại file" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mô tả</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Nhập mô tả loại file"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActived"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trạng thái</FormLabel>
                    <FormControl>
                      <Combobox
                        options={ACTIVE_STATUS_OPTIONS}
                        value={field.value.toString()}
                        onValueChange={(val) => field.onChange(val === "true")}
                        placeholder="Chọn trạng thái"
                        searchPlaceholder="Tìm kiếm trạng thái..."
                        emptyText="Không tìm thấy trạng thái."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" type="button">Hủy</Button>
              </DialogClose>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lưu
              </Button>
              {!fileType?.IsEdit && (
                <Button
                  type="button"
                  onClick={form.handleSubmit((data) => onSubmit(data, true))}
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Lưu và thêm tiếp
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PopupFileType;
