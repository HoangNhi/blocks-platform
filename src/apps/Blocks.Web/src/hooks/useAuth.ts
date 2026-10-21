import { useContext } from "react";
import { AuthContext } from "@/contexts/auth-context-definition";
import type { AuthContextType } from "@/features/system/types/auth.types";
import { EXT_ROLE_ID } from "@/constants/roles";

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return {
    ...context,
    isExternalReviewer: context.user?.RoleId === EXT_ROLE_ID,
  };
};

