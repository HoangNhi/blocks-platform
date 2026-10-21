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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { systemGroupService } from "@/features/system/api/systemGroup.api";
import type { ModelCombobox } from "@/types/base/base.types";
import type { SystemGroup } from "@/features/system/types/systemGroup.types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên gọi"),
  parentId: z.string().nullable(),
  sort: z.number().int(),
  isActived: z.boolean(),
});

const PopupDetail = ({
  data,
  isOpen,
  onOpenChange,
  saveChange,
}: {
  data: SystemGroup | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (data: SystemGroup, isAddMore: boolean) => void;
}) => {
  const [id] = useState<string | null>(data?.Id || uuidv4());
  const [comboboxSystemGroup, setComboboxSystemGroup] = useState<
    ModelCombobox[]
  >([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: data?.Name || "",
      parentId: data?.ParentId || null,
      sort: data?.Sort || 0,
      isActived: data?.IsActived ?? true,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>, isAddMore: boolean) => {
    saveChange(
      {
        Id: id || uuidv4(),
        Name: values.name,
        Sort: values.sort,
        ParentId: values.parentId || undefined,
        IsEdit: data?.IsEdit || false,
        IsActived: values.isActived,
      },
      isAddMore
    );
  };

  useEffect(() => {
    const fetchComboboxSystemGroup = async () => {
      const response = await systemGroupService.getAllNotParentCombobox();
      if (response.Success) {
        setComboboxSystemGroup(response.Data || []);
      } else {
        toast.error(response.Message);
      }
    };

    fetchComboboxSystemGroup();
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((values) => onSubmit(values, false))}
          >
            <DialogHeader>
              <DialogTitle>
                {data?.IsEdit ? "Cập nhật Nhóm quyền" : "Thêm mới Nhóm quyền"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="grid gap-3 flex-col items-start space-y-0 relative">
                    <FormLabel>Tên gọi</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <FormItem className="grid gap-3 flex-col items-start space-y-0 relative">
                    <FormLabel>Nhóm quyền</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(val === "no-parent" ? null : val)}
                      defaultValue={field.value || "no-parent"}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Chọn nhóm quyền" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="no-parent">Chọn nhóm quyền</SelectItem>
                          {comboboxSystemGroup.map((item) => (
                            <SelectItem key={item.Value} value={item.Value || ""}>
                              {item.Text}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sort"
                render={({ field }) => (
                  <FormItem className="grid gap-3 flex-col items-start space-y-0 relative">
                    <FormLabel>Sắp xếp</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
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
                  <FormItem className="grid gap-3 flex-col items-start space-y-0 relative">
                    <FormLabel>Trạng thái</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(val === "true")}
                      defaultValue={field.value ? "true" : "false"}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Chọn trạng thái" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="true">Hoạt động</SelectItem>
                          <SelectItem value="false">Không hoạt động</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Hủy</Button>
              </DialogClose>
              <Button type="submit">Lưu</Button>
              {!data?.IsEdit && (
                <Button
                  type="button"
                  onClick={form.handleSubmit((values) => onSubmit(values, true))}
                >
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

export default PopupDetail;

