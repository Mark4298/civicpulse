import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { UserRole } from "@civicpulse/shared";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({
  children,
  role,
}: {
  children: ReactNode;
  role?: UserRole;
}) {
  const { user, role: currentRole, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="route-loading" role="status">
        Checking your session…
      </main>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (role && currentRole !== role) {
    return (
      <Navigate
        to="/"
        state={{ toast: `This page is only available to ${role === "admin" ? "admins" : "citizens"}.` }}
        replace
      />
    );
  }
  return children;
}