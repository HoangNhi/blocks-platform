import type { BaseRequest } from "@/types/base/base.types";

export interface User extends BaseRequest {
  Id: string;
  Username: string;
  Fullname: string;
  RoleId: string;
  RoleName?: string;
  Email: string;
  Avatar?: string;
  Password?: string;
}

export interface UserGetList extends User {
  Role: string;
}

export interface EditProfileRequest extends BaseRequest {
  Fullname: string;
  Email: string;
  Avatar?: string;
}

export interface ChangePasswordRequest {
  OldPassword: string;
  NewPassword: string;
  ConfirmNewPassword: string;
}
