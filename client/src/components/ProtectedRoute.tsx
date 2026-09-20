import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-app-mesh flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-5 w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-glow-primary">
            AC
          </div>
          <div className="spinner h-8 w-8 mb-4"></div>
          <p className="text-slate-500 text-sm">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}