import { useContext } from "react";
import { AuthContext } from "@/contexts/auth-context-definition";
import type { AuthContextType } from "@/features/system/types/auth.types";

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};
