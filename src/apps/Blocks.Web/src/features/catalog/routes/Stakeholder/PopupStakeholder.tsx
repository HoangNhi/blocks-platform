import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Stakeholder } from "@/features/catalog/types/stakeholder.types";
import { useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Loader2 } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { STAKEHOLDER_TYPES } from "@/constants/catalog.constants";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  id: z.string(),
  fullName: z.string().min(1, "Họ và tên không được để trống"),
  email: z.string().email("Email không hợp lệ").min(1, "Email không được để trống"),
  type: z.string().min(1, "Loại đối tượng không được để trống"),
  description: z.string().optional(),
});

const PopupStakeholder = ({
  stakeholder,
  isOpen,
  onOpenChange,
  saveChange,
  isLoading,
}: {
  stakeholder: Stakeholder | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (stakeholder: Stakeholder, isAddMore: boolean) => void;
  isLoading?: boolean;
}) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: stakeholder?.Id || uuidv4(),
      fullName: stakeholder?.FullName || "",
      email: stakeholder?.Email || "",
      type: stakeholder?.Type?.toString() || "",
      description: stakeholder?.Description || "",
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>, isAddMore: boolean) => {
    saveChange(
      {
        Id: values.id,
        FullName: values.fullName.trim(),
        Email: values.email.trim(),
        Type: parseInt(values.type),
        Description: values.description?.trim() || "",
        IsEdit: stakeholder?.IsEdit || false,
        IsActived: stakeholder?.IsActived ?? true,
        FolderUpload: stakeholder?.FolderUpload || "",
        CreatedBy: stakeholder?.CreatedBy || "",
        CreatedAt: stakeholder?.CreatedAt || "",
      },
      isAddMore,
    );
  };

  useEffect(() => {
    if (stakeholder) {
      form.reset({
        id: stakeholder.Id || uuidv4(),
        fullName: stakeholder.FullName || "",
        email: stakeholder.Email || "",
        type: stakeholder.Type?.toString() || "",
        description: stakeholder.Description || "",
      });
    } else {
      form.reset({
        id: uuidv4(),
        fullName: "",
        email: "",
        type: "",
        description: "",
      });
    }
  }, [stakeholder, form]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <Form {...form}>
          <form
            id="stakeholder-form"
            className="grid gap-4"
            onSubmit={form.handleSubmit((data) => onSubmit(data, false))}
          >
            <DialogHeader className="border-b pb-2">
              <DialogTitle>
                {stakeholder?.IsEdit
                  ? "Cập nhật đối tượng khảo sát"
                  : "Thêm mới đối tượng khảo sát"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                      Họ và tên
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nhập họ và tên" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="Nhập email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                      Loại đối tượng
                    </FormLabel>
                    <FormControl>
                      <Combobox
                        options={STAKEHOLDER_TYPES}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Chọn loại đối tượng"
                        searchPlaceholder="Tìm kiếm..."
                        emptyText="Không tìm thấy."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel>Mô tả</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Nhập mô tả" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="border-t pt-4">
              <DialogClose asChild>
                <Button variant="outline" type="button">Hủy</Button>
              </DialogClose>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lưu
              </Button>
              {!stakeholder?.IsEdit && (
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

export default PopupStakeholder;
