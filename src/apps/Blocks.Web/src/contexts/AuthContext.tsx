import {
  type FC,
  type ReactNode,
  useState,
  useCallback,
  useEffect,
} from "react";
import {
  saveTokens,
  getAccessToken,
  clearTokens,
  getRefreshToken,
} from "@/lib/cookies";
import { authService } from "@/features/system/api/auth.api";
import { jwtDecode, type JwtPayload } from "jwt-decode";
import type { User } from "@/features/system/types/user.types";
import type {
  AuthContextType,
  LoginResponse,
} from "@/features/system/types/auth.types";
import { toast } from "sonner";
import type { ApiResponse } from "@/lib/api";
import type { SystemGroup } from "@/features/system/types/systemGroup.types";
import type { GetPermissionByUser } from "@/features/system/types/role.types";
import { systemGroupService } from "@/features/system/api/systemGroup.api";
import { menuService } from "@/features/system/api/menu.api";
import { roleService } from "@/features/system/api/role.api";
import { userService } from "@/features/system/api/user.api";
import type { MenuGetListPaging } from "@/features/system/types/menu.types";
// import { useLocation } from "react-router-dom";

import { AuthContext } from "./auth-context-definition";

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [systemGroup, setSystemGroup] = useState<SystemGroup[]>([]);
  const [menu, setMenu] = useState<MenuGetListPaging[]>([]);
  const [permissions, setPermissions] = useState<GetPermissionByUser[]>([]);
  const [roleName, setRoleName] = useState<string | null>(null);

  const syncRoleName = useCallback((currentUser?: User | null) => {
    const role = currentUser?.RoleName?.trim();
    setRoleName(role ? role : null);
  }, []);

  const performLogout = async () => {
    setUser(null);
    setSystemGroup([]);
    setMenu([]);
    setPermissions([]);
    setRoleName(null);
    clearTokens();
    localStorage.removeItem("user");
    localStorage.removeItem("systemGroup");
    localStorage.removeItem("menu");
    localStorage.removeItem("permissions");
  };

  const fetchUserData = useCallback(async (currentUser: User) => {
    let currentSystemGroup: SystemGroup[] = [];
    let currentMenu: MenuGetListPaging[] = [];
    let currentPermissions: GetPermissionByUser[] = [];

    // 1. Ensure System Group is available
    const systemGroupJson = localStorage.getItem("systemGroup");
    if (systemGroupJson) {
      try {
        currentSystemGroup = JSON.parse(systemGroupJson);
      } catch (e) { }
    }

    if (!currentSystemGroup || currentSystemGroup.length === 0) {
      const response = await systemGroupService.getAll();
      if (response.Success) {
        currentSystemGroup = response.Data || [];
        localStorage.setItem("systemGroup", JSON.stringify(currentSystemGroup));
      }
    }
    setSystemGroup(currentSystemGroup || []);

    // 2. Ensure Menu is available
    const menuJson = localStorage.getItem("menu");
    if (menuJson) {
      try {
        currentMenu = JSON.parse(menuJson);
      } catch (e) { }
    }

    if (!currentMenu || currentMenu.length === 0) {
      const response = await menuService.getListByUser(currentUser.Id);
      if (response.Success) {
        currentMenu = response.Data || [];
        localStorage.setItem("menu", JSON.stringify(currentMenu));
      }
    }
    setMenu(currentMenu || []);

    // 3. Ensure Permissions are available
    const permissionsJson = localStorage.getItem("permissions");
    if (permissionsJson) {
      try {
        currentPermissions = JSON.parse(permissionsJson);
      } catch (e) { }
    }

    if (!currentPermissions || currentPermissions.length === 0) {
      const response = await roleService.getPermissionsByUser(currentUser.Id);
      if (response.Success) {
        currentPermissions = response.Data || [];
        localStorage.setItem("permissions", JSON.stringify(currentPermissions));
      }
    }
    setPermissions(currentPermissions || []);

    // 4. Sync Role Name from current user profile
    if (currentUser.RoleName?.trim()) {
      syncRoleName(currentUser);
    } else {
      const profileResponse = await userService.getCurrentUser();
      if (profileResponse.Success && profileResponse.Data) {
        setUser(profileResponse.Data);
        localStorage.setItem("user", JSON.stringify(profileResponse.Data));
        syncRoleName(profileResponse.Data);
      } else {
        setRoleName(null);
      }
    }
  }, [syncRoleName]);

  const initAuth = useCallback(async () => {
    try {
      setLoading(true);
      const token = getAccessToken();
      if (token) {
        try {
          const decoded = jwtDecode<JwtPayload>(token);
          const userJson = localStorage.getItem("user");
          let currentUser: User | null = null;
          if (decoded.exp && decoded.exp * 1000 > Date.now()) {
            if (userJson) {
              const userData = JSON.parse(userJson);
              setUser(userData);
              currentUser = userData;
            } else {
              const response = await userService.getCurrentUser();
              if (response.Success) {
                setUser(response.Data || null);
                localStorage.setItem("user", JSON.stringify(response.Data));
                currentUser = response.Data || null;
              }
            }

            if (currentUser) {
              await fetchUserData(currentUser);
            }
          } else {
            const refreshToken = getRefreshToken();
            if (refreshToken) {
              const response = await authService.refreshToken({
                RefreshToken: refreshToken,
              });
              if (response.Success && response.Data) {
                const accessToken = response.Data?.AccessToken || "";
                const refreshToken = response.Data?.RefreshToken || "";
                saveTokens(accessToken, refreshToken);

                if (userJson) {
                  const userData = JSON.parse(userJson);
                  setUser(userData);
                  await fetchUserData(userData);
                } else {
                  const userResponse = await userService.getCurrentUser();
                  if (userResponse.Success && userResponse.Data) {
                    setUser(userResponse.Data);
                    localStorage.setItem(
                      "user",
                      JSON.stringify(userResponse.Data)
                    );
                    await fetchUserData(userResponse.Data);
                  }
                }
              } else {
                await performLogout();
              }
            } else {
              await performLogout();
            }
          }
        } catch (e) {
          await performLogout();
        }
      } else {
        // Access token missing, check for refresh token
        const refreshToken = getRefreshToken();
        if (refreshToken) {
          try {
            const response = await authService.refreshToken({
              RefreshToken: refreshToken,
            });
            if (response.Success && response.Data) {
              const accessToken = response.Data.AccessToken || "";
              const newRefreshToken = response.Data.RefreshToken || "";
              saveTokens(accessToken, newRefreshToken);

              // After refresh, we need to set the user
              // We can rely on the fact that we have a valid token now
              const userJson = localStorage.getItem("user");

              if (userJson) {
                setUser(JSON.parse(userJson));
                await fetchUserData(JSON.parse(userJson));
              } else {
                const userResponse = await userService.getCurrentUser();
                if (userResponse.Success && userResponse.Data) {
                  setUser(userResponse.Data);
                  localStorage.setItem(
                    "user",
                    JSON.stringify(userResponse.Data)
                  );
                  await fetchUserData(userResponse.Data);
                }
              }
            } else {
              await performLogout();
            }
          } catch (e) {
            await performLogout();
          }
        } else {
          await performLogout();
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đăng nhập thất bại");
      await performLogout();
    } finally {
      setLoading(false);
    }
  }, [fetchUserData]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const login = useCallback(
    async (
      username: string,
      password: string
    ): Promise<ApiResponse<LoginResponse>> => {
      try {
        setLoading(true);
        const response = await authService.login({
          Username: username,
          Password: password,
        });

        if (!response.Success) {
          // We still return response so the caller can check Success/Message
          return response;
        }

        const AccessToken = response.Data?.AccessToken || "";
        const RefreshToken = response.Data?.RefreshToken || "";

        if (!AccessToken) {
          return {
            ...response,
            Success: false,
            Message: "Phản hồi từ server không chứa AccessToken",
          };
        }

        saveTokens(AccessToken, RefreshToken);
        const Id = response.Data?.Id;
        const Fullname = response.Data?.Fullname;
        const Username = response.Data?.Username;
        const RoleId = response.Data?.RoleId;
        const userData: User = {
          Id: Id || "",
          Fullname: Fullname || "",
          Username: Username || "",
          RoleId: RoleId || "",
          Avatar: response.Data?.Avatar || "",
          Email: response.Data?.Email || "",
          IsEdit: false,
          IsActived: true,
          FolderUpload: "",
        };
        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);

        // Fetch user data immediately after login
        await fetchUserData(userData);

        return response;
      } catch (err: unknown) {
        return {
          Success: false,
          Message: err instanceof Error ? err.message : "Đăng nhập thất bại",
          StatusCode: 500,
        };
      } finally {
        setLoading(false);
      }
    },
    [fetchUserData]
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      await authService.logout();
      await performLogout();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đăng xuất thất bại");
    } finally {
      setLoading(false);
    }
  }, []);

  const getPermission = async (
    pathname: string
  ): Promise<GetPermissionByUser | undefined> => {
    if (pathname === "") {
      return {
        Controller: "Home",
        IsViewed: true,
        IsAdded: true,
        IsUpdated: true,
        IsDeleted: true,
        IsApproved: true,
        IsAnalyzed: true,
      };
    }

    let currentSystemGroup = systemGroup;
    let currentMenu = menu;
    let currentPermissions = permissions;

    // 1. Ensure System Group is available
    if (!currentSystemGroup || currentSystemGroup.length === 0) {
      const systemGroupJson = localStorage.getItem("systemGroup");
      if (systemGroupJson) {
        try {
          currentSystemGroup = JSON.parse(systemGroupJson);
          setSystemGroup(currentSystemGroup || []);
        } catch (e) { }
      }

      // If still empty (e.g. not in method storage), try API
      if (!currentSystemGroup || currentSystemGroup.length === 0) {
        const response = await systemGroupService.getAll();
        if (response.Success) {
          currentSystemGroup = response.Data || [];
          setSystemGroup(currentSystemGroup);
          localStorage.setItem(
            "systemGroup",
            JSON.stringify(currentSystemGroup)
          );
        }
      }
    }

    // 2. Ensure Menu is available
    if (!currentMenu || currentMenu.length === 0) {
      const menuJson = localStorage.getItem("menu");
      if (menuJson) {
        try {
          currentMenu = JSON.parse(menuJson);
          setMenu(currentMenu || []);
        } catch (e) { }
      }

      if (!currentMenu || currentMenu.length === 0) {
        const response = await menuService.getListByUser(user?.Id || "");
        if (response.Success) {
          currentMenu = response.Data || [];
          setMenu(currentMenu);
          localStorage.setItem("menu", JSON.stringify(currentMenu));
        }
      }
    }

    // 3. Ensure Permissions are available
    if (!currentPermissions || currentPermissions.length === 0) {
      const permissionsJson = localStorage.getItem("permissions");
      if (permissionsJson) {
        try {
          currentPermissions = JSON.parse(permissionsJson);
          setPermissions(currentPermissions || []);
        } catch (e) { }
      }

      if (!currentPermissions || currentPermissions.length === 0) {
        // Fallback to API. user.Id might be undefined if initAuth hasn't finished user load
        // But we rely on localStorage primarily for reload persistence.
        const response = await roleService.getPermissionsByUser(user?.Id || "");
        if (response.Success) {
          currentPermissions = response.Data || [];
          setPermissions(currentPermissions);
          localStorage.setItem(
            "permissions",
            JSON.stringify(currentPermissions)
          );
        }
      }
    }

    const result = currentPermissions?.find(
      (item) => item.Controller === pathname
    );
    return result;
  };

  const value: AuthContextType = {
    user,
    systemGroup,
    menu,
    permissions,
    roleName,
    isAuthenticated: !!user,
    loading,
    login,
    logout,
    getPermission,
    refreshProfile: async () => {
      const response = await userService.getCurrentUser();
      if (response.Success && response.Data) {
        setUser(response.Data);
        localStorage.setItem("user", JSON.stringify(response.Data));
        syncRoleName(response.Data);
      } else {
        setRoleName(null);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
