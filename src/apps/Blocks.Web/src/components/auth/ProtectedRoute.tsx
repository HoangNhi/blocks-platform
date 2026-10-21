import {
  useEffect,
  useState,
  type FC,
  type ReactNode,
  isValidElement,
  cloneElement,
} from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import type { GetPermissionByUser } from "@/features/system/types/role.types";

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute: FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, loading, getPermission } = useAuth();
  const [permission, setPermission] = useState<GetPermissionByUser | null>(
    null
  );
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);
  const pathname = useLocation().pathname.split("/")[1];

  useEffect(() => {
    const getPermissionByPathname = async () => {
      try {
        const permission = await getPermission(pathname);
        if (permission) {
          setPermission(permission);
        }
      } finally {
        setIsCheckingPermission(false);
      }
    };
    getPermissionByPathname();
  }, [pathname, getPermission]);

  if (loading || isCheckingPermission) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!permission?.IsViewed) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (isValidElement(children)) {
    return cloneElement(
      children as React.ReactElement<{
        permission: GetPermissionByUser | null;
      }>,
      {
        permission,
      }
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
