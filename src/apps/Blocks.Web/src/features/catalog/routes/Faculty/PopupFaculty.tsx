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
import type { Faculty } from "@/features/catalog/types/faculty.types";
import { useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Tên khoa không được để trống"),
  isActived: z.boolean(),
});

const PopupFaculty = ({
  faculty,
  isOpen,
  onOpenChange,
  saveChange,
}: {
  faculty: Faculty | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (faculty: Faculty, isAddMore: boolean) => void;
}) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: faculty?.Id || uuidv4(),
      name: faculty?.Name || "",
      isActived: faculty?.IsActived ?? true,
    },
  });

  useEffect(() => {
    if (faculty) {
      form.reset({
        id: faculty.Id || uuidv4(),
        name: faculty.Name || "",
        isActived: faculty.IsActived ?? true,
      });
    } else {
      form.reset({
        id: uuidv4(),
        name: "",
        isActived: true,
      });
    }
  }, [faculty, form]);

  const onSubmit = (values: z.infer<typeof formSchema>, isAddMore: boolean) => {
    saveChange(
      {
        Id: values.id,
        Name: values.name,
        IsEdit: faculty?.IsEdit || false,
        IsActived: values.isActived,
      },
      isAddMore
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((data) => onSubmit(data, false))}
          >
            <DialogHeader>
              <DialogTitle>
                {faculty?.IsEdit ? "Cập nhật Khoa" : "Thêm mới Khoa"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="grid gap-3 space-y-0">
                    <FormLabel>Tên khoa <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActived"
                render={({ field }) => (
                  <FormItem className="grid gap-3 space-y-0">
                    <FormLabel>Trạng thái</FormLabel>
                    <Select
                      value={field.value ? "true" : "false"}
                      onValueChange={(value) =>
                        field.onChange(value === "true")
                      }
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
                <Button variant="outline" type="button">Hủy</Button>
              </DialogClose>
              <Button type="submit">Lưu</Button>
              {!faculty?.IsEdit && (
                <Button
                  type="button"
                  onClick={form.handleSubmit((data) => onSubmit(data, true))}
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

export default PopupFaculty;

