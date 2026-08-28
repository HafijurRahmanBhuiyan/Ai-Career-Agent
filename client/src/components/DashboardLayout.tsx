import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS: { label: string; to: string }[] = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "GitHub Projects", to: "/dashboard/integrations" },
  { label: "Professional Content", to: "/dashboard/professional-content" },
  { label: "Jobs", to: "/dashboard/jobs" },
  { label: "My Applications", to: "/dashboard/applications" },
  { label: "Follow-ups", to: "/dashboard/follow-ups" },
  { label: "My Job Matches", to: "/dashboard/job-matches" },
  { label: "Career Emails", to: "/dashboard/emails" },
  { label: "Analytics", to: "/dashboard/analytics" },
];

export default function DashboardLayout({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-slate-200">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            AC
          </div>
          <span className="text-lg font-bold text-slate-900">Career Agent</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`block px-3 py-2 text-sm rounded-lg transition-colors ${
                active === item.label
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-slate-200">
          <div className="flex items-center gap-2 px-2 py-2 mb-2">
            <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user?.name || "User"}
              </p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="ml-64 p-8">{children}</main>
    </div>
  );
}
