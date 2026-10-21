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
import { Checkbox } from "@/components/ui/checkbox";
import type { Menu } from "@/features/system/types/menu.types";
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
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { systemGroupService } from "@/features/system/api/systemGroup.api";
import type { ModelCombobox } from "@/types/base/base.types";

const formSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên Menu"),
  controller: z.string().min(1, "Vui lòng nhập Controller"),
  sort: z.number().int(),
  systemGroupId: z.string().min(1, "Vui lòng chọn nhóm quyền"),
  isActived: z.boolean(),
  isShowMenu: z.boolean(),
  canView: z.boolean(),
  canAdd: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
  canApprove: z.boolean(),
  canAnalyze: z.boolean(),
});

const PopupDetail = ({
  data,
  isOpen,
  onOpenChange,
  saveChange,
}: {
  data: Menu | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (data: Menu, isAddMore: boolean) => void;
}) => {
  const [id] = useState<string | null>(data?.Id || uuidv4());
  const [systemGroups, setSystemGroups] = useState<ModelCombobox[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: data?.Name || "",
      controller: data?.Controller || "",
      sort: data?.Sort || 0,
      systemGroupId: data?.SystemGroupId || "",
      isActived: data?.IsActived ?? true,
      isShowMenu: data?.IsShowMenu ?? true,
      canView: data?.CanView || false,
      canAdd: data?.CanAdd || false,
      canUpdate: data?.CanUpdate || false,
      canDelete: data?.CanDelete || false,
      canApprove: data?.CanApprove || false,
      canAnalyze: data?.CanAnalyze || false,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>, isAddMore: boolean) => {
    saveChange(
      {
        Id: id || uuidv4(),
        Name: values.name,
        Controller: values.controller,
        Sort: values.sort,
        SystemGroupId: values.systemGroupId,
        CanView: values.canView,
        CanAdd: values.canAdd,
        CanUpdate: values.canUpdate,
        CanDelete: values.canDelete,
        CanApprove: values.canApprove,
        CanAnalyze: values.canAnalyze,
        IsEdit: data?.IsEdit || false,
        IsActived: values.isActived,
        IsShowMenu: values.isShowMenu,
      },
      isAddMore
    );
  };

  useEffect(() => {
    const fetchSystemGroups = async () => {
      const res = await systemGroupService.getAllCombobox();
      if (res?.Success && res.Data) {
        setSystemGroups(res.Data);
      }
    };
    fetchSystemGroups();
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[700px]"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((values) => onSubmit(values, false))}
          >
            <DialogHeader>
              <DialogTitle>
                {data?.IsEdit ? "Cập nhật Menu" : "Thêm mới Menu"}
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên Menu</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="controller"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Controller</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="systemGroupId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nhóm quyền</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Chọn nhóm quyền" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          {systemGroups.map((item) => (
                            <SelectItem
                              key={item.Value}
                              value={item.Value || ""}
                            >
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
                  <FormItem>
                    <FormLabel>Thứ tự</FormLabel>
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
                  <FormItem>
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

              <FormField
                control={form.control}
                name="isShowMenu"
                render={({ field }) => (
                  <FormItem className="flex flex-col justify-end space-y-3 pt-2">
                    <div className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">
                        Hiển thị Menu
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <FormLabel>Phân quyền</FormLabel>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="canView"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal mt-0">Xem</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="canAdd"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal mt-0">Thêm</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="canUpdate"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal mt-0">Sửa</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="canDelete"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal mt-0">Xóa</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="canApprove"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal mt-0">Duyệt</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="canAnalyze"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal mt-0">Thống kê</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
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

