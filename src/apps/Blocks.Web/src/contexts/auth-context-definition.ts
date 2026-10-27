import { createContext } from "react";
import type { AuthContextType } from "@/features/system/types/auth.types";

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
