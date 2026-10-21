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
import { Label } from "@/components/ui/label";
import type { User } from "@/features/system/types/user.types";
import { v4 as uuidv4 } from "uuid";
import { useState, useRef } from "react";
import UploadAvatar, {
  type UploadAvatarRef,
} from "@/components/ui/upload-avatar";
import { getFileUrl } from "@/lib/utils";

const PopupEditProfile = ({
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
  const [fullName, setFullName] = useState(user?.Fullname || "");
  const [email, setEmail] = useState(user?.Email || "");
  const [folderUpload] = useState<string>(user?.FolderUpload || uuidv4());

  const avatarRef = useRef<UploadAvatarRef>(null);

  const onSubmit = async (isAddMore: boolean) => {
    const avatarUrl = await avatarRef.current?.upload();

    saveChange(
      {
        ...user,
        Id: id ?? uuidv4(),
        Fullname: fullName,
        Email: email,
        Avatar: avatarUrl === null ? user?.Avatar : avatarUrl,
        FolderUpload: folderUpload,
      } as User,
      isAddMore
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {user?.IsEdit ? "Cập nhật Tài khoán" : "Thêm mới Tài khoản"}
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
            <div className="grid gap-3">
              <Label>Họ và tên</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="grid gap-3">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button type="submit">Lưu</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PopupEditProfile;

