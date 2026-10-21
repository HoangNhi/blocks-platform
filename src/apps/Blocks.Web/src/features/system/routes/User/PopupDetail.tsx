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
import { roleService } from "@/features/system/api/role.api";
import type { ModelCombobox } from "@/types/base/base.types";
import type { User } from "@/features/system/types/user.types";
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import UploadAvatar, {
  type UploadAvatarRef,
} from "@/components/ui/upload-avatar";
import { getFileUrl } from "@/lib/utils";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  username: z.string().min(1, "Vui lòng nhập tên đăng nhập"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
  fullName: z.string().min(1, "Vui lòng nhập họ và tên"),
  email: z.string().email("Email không hợp lệ").or(z.literal("")),
  roleId: z.string().min(1, "Vui lòng chọn vai trò"),
  isActived: z.boolean(),
});

const PopupDetail = ({
  user,
  isOpen,
  onOpenChange,
  saveChange,
}: {
  user: User | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (user: User, isAddMore: boolean) => void;
}) => {
  const [id] = useState<string | null>(user?.Id || uuidv4());
  const [roles, setRoles] = useState<ModelCombobox[]>([]);
  const [folderUpload] = useState<string>(user?.FolderUpload || uuidv4());

  const avatarRef = useRef<UploadAvatarRef>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: user?.Username || "",
      password: user?.Password || "",
      fullName: user?.Fullname || "",
      email: user?.Email || "",
      roleId: user?.RoleId || "",
      isActived: user?.IsActived ?? true,
    },
  });

  const onSubmit = async (
    values: z.infer<typeof formSchema>,
    isAddMore: boolean
  ) => {
    const avatarUrl = await avatarRef.current?.upload();

    saveChange(
      {
        Id: id ?? uuidv4(),
        Username: values.username,
        Password: values.password,
        Fullname: values.fullName,
        RoleId: values.roleId,
        IsEdit: user?.IsEdit || false,
        IsActived: values.isActived,
        Email: values.email,
        Avatar: avatarUrl === null ? user?.Avatar : avatarUrl,
        FolderUpload: folderUpload,
      },
      isAddMore
    );
  };

  useEffect(() => {
    const fetchRoles = async () => {
      const res = await roleService.getAllCombobox();
      if (res?.Success && res.Data) {
        setRoles(res.Data || []);
      }
    };
    fetchRoles();
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((data) => onSubmit(data, false))}
          >
            <DialogHeader>
              <DialogTitle>
                {user?.IsEdit ? "Cập nhật Tài khoản" : "Thêm mới Tài khoản"}
              </DialogTitle>
            </DialogHeader>

            <div className="flex justify-center mb-4">
              <UploadAvatar
                ref={avatarRef}
                defaultImage={getFileUrl(user?.Avatar)}
                folderUpload={folderUpload}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên đăng nhập</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mật khẩu</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Họ và tên</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vai trò</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Chọn vai trò" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          {roles.map((item) => (
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
                          <SelectItem value="false">
                            Không hoạt động
                          </SelectItem>
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
              {!user?.IsEdit && (
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

export default PopupDetail;

