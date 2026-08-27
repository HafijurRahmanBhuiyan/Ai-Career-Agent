import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

interface HealthStatus {
  status: string;
  service: string;
}

function Dashboard() {
  const [apiStatus, setApiStatus] = useState<HealthStatus | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await axios.get<HealthStatus>("/api/health");
        setApiStatus(res.data);
      } catch {
        setApiError("Backend not reachable");
      }
    };
    checkHealth();
  }, []);

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
          <NavItem label="Dashboard" active />
          <NavItem label="GitHub Projects" />
          <NavItem label="LinkedIn Posts" />
          <NavItem label="Jobs" />
          <NavItem label="Applications" />
          <NavItem label="Emails" />
          <NavItem label="Settings" />
        </nav>
        <div className="px-3 py-4 border-t border-slate-200">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </aside>

      <main className="ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500 mt-1">
              Welcome to AI Career Agent
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard title="GitHub Projects" value="—" />
            <MetricCard title="LinkedIn Drafts" value="—" />
            <MetricCard title="Jobs Found" value="—" />
            <MetricCard title="Applications" value="—" />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              System Status
            </h2>
            {apiStatus && (
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 bg-green-500 rounded-full"></span>
                <span className="text-slate-700">
                  API: {apiStatus.service} — {apiStatus.status}
                </span>
              </div>
            )}
            {apiError && (
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full"></span>
                <span className="text-red-600">{apiError}</span>
              </div>
            )}
            {!apiStatus && !apiError && (
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse"></span>
                <span className="text-slate-500">Checking API status...</span>
              </div>
            )}
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Recent Projects" emptyText="No projects analyzed yet." />
            <SectionCard title="Recommended Jobs" emptyText="No jobs discovered yet." />
            <SectionCard title="LinkedIn Drafts" emptyText="No drafts generated yet." />
            <SectionCard title="Recent Applications" emptyText="No applications submitted yet." />
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-sm text-slate-500 mb-1">{title}</p>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function NavItem({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
        active
          ? "bg-blue-50 text-blue-700 font-medium"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );
}

function SectionCard({ title, emptyText }: { title: string; emptyText: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-base font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="text-center py-8">
        <p className="text-sm text-slate-400">{emptyText}</p>
      </div>
    </div>
  );
}

export default Dashboard;
