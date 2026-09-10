import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";

import { useAuthStore } from "../store/authStore";

export default function RequireAuth({ children }: PropsWithChildren) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
