import { useEffect, useState } from "react";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";

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
        const res = await api.get<HealthStatus>("/health");
        setApiStatus(res.data);
      } catch {
        setApiError("Backend not reachable");
      }
    };
    checkHealth();
  }, []);

  return (
    <DashboardLayout active="Dashboard">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Welcome to AI Career Agent</p>
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
    </DashboardLayout>
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
