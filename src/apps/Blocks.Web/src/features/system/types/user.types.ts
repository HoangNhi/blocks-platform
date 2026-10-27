import type { BaseRequest } from "@/types/base/base.types";
import type { AvatarAction } from "@/features/file/types/avatar.types";

export interface User extends BaseRequest {
  Id: string;
  Username: string;
  Fullname: string;
  RoleId: string;
  RoleName?: string;
  Email: string;
  Avatar?: string;
  AvatarAction?: AvatarAction;
  Password?: string;
}

export interface UserGetList extends User {
  Role: string;
}

export interface EditProfileRequest extends BaseRequest {
  Fullname: string;
  Email: string;
  Avatar?: string;
  AvatarAction?: AvatarAction;
}

export interface ChangePasswordRequest {
  OldPassword: string;
  NewPassword: string;
  ConfirmNewPassword: string;
}
