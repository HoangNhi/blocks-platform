import type { MenuGetListPaging } from "./menu.types";
import type { GetPermissionByUser } from "./role.types";
import type { SystemGroup } from "./systemGroup.types";
import type { User } from "./user.types";

export interface LoginRequest {
  Username: string;
  Password: string;
}

import { type ApiResponse } from "@/lib/api";

export interface LoginResponse extends User {
  AccessToken: string;
  RefreshToken: string;
}

export interface RefreshTokenRequest {
  RefreshToken: string;
}

export interface RefreshTokenResponse {
  AccessToken: string;
  RefreshToken: string;
}

export interface AuthContextType {
  user: User | null;
  systemGroup: SystemGroup[] | null;
  menu: MenuGetListPaging[] | null;
  permissions: GetPermissionByUser[] | null;
  roleName: string | null;
  isExternalReviewer: boolean;
  loading: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<ApiResponse<LoginResponse>>;
  logout: () => Promise<void>;
  getPermission: (pathname: string) => Promise<GetPermissionByUser | undefined>;
  refreshProfile: () => Promise<void>;
}
