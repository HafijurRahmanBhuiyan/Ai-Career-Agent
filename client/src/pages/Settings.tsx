import { useEffect, useState, FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";

interface SourceStatus {
  id: string;
  name: string;
  configured: boolean;
}

interface JobSearchPreferences {
  roles: string[];
  locations: string[];
  remote: string;
  experienceLevel: string;
  salaryMinimum?: number | null;
}

interface Notifications {
  gmailNotifyEnabled: boolean;
  notificationEmail: string | null;
}

interface SettingsResponse {
  sources: SourceStatus[];
  jobSearchPreferences: JobSearchPreferences;
  notifications: Notifications;
}

const REMOTE_OPTIONS = ["any", "remote", "hybrid", "onsite"];
const EXPERIENCE_OPTIONS = ["", "entry", "junior", "mid", "senior", "lead", "manager"];

function Settings() {
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [roles, setRoles] = useState("");
  const [locations, setLocations] = useState("");
  const [remote, setRemote] = useState("any");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [salaryMinimum, setSalaryMinimum] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [gmailNotifyEnabled, setGmailNotifyEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<SettingsResponse>("/settings");
        setSources(res.data.sources);
        setRoles(res.data.jobSearchPreferences.roles.join(", "));
        setLocations(res.data.jobSearchPreferences.locations.join(", "));
        setRemote(res.data.jobSearchPreferences.remote || "any");
        setExperienceLevel(res.data.jobSearchPreferences.experienceLevel || "");
        setSalaryMinimum(
          res.data.jobSearchPreferences.salaryMinimum != null
            ? String(res.data.jobSearchPreferences.salaryMinimum)
            : ""
        );
        setNotificationEmail(res.data.notifications.notificationEmail || "");
        setGmailNotifyEnabled(res.data.notifications.gmailNotifyEnabled);
      } catch (err: unknown) {
        const msg =
          axios.isAxiosError(err) && err.response?.data?.error
            ? err.response.data.error
            : "Failed to load settings";
        setError(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const rolesArr = roles
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    const locationsArr = locations
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    const salaryNum =
      salaryMinimum.trim() === "" ? undefined : Number(salaryMinimum);
    try {
      await api.patch("/profile", {
        jobSearchPreferences: {
          roles: rolesArr,
          locations: locationsArr,
          remote,
          experienceLevel,
          salaryMinimum: salaryNum,
        },
        notificationEmail,
        gmailNotifyEnabled,
      });
      setSuccess("Settings saved.");
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : "Could not save settings";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout active="Settings">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500 mt-1">
            Job source status, search preferences and notifications
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 ml-4">
              Dismiss
            </button>
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-500 ml-4">
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-500 text-sm">Loading settings...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                Job Sources
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Sources with a key are configured. Missing keys disable the
                source (its jobs are skipped silently).
              </p>
              <ul className="divide-y divide-slate-100">
                {sources.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between py-3"
                  >
                    <span className="text-sm text-slate-800">{s.name}</span>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        s.configured
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {s.configured ? "Configured" : "Not configured"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                Job Search Preferences
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Roles
                  </label>
                  <input
                    type="text"
                    value={roles}
                    onChange={(e) => setRoles(e.target.value)}
                    placeholder="e.g. Full Stack Developer, Frontend Engineer"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Comma-separated
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Locations
                  </label>
                  <input
                    type="text"
                    value={locations}
                    onChange={(e) => setLocations(e.target.value)}
                    placeholder="e.g. London, Berlin, Remote"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Comma-separated
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Work Preference
                  </label>
                  <select
                    value={remote}
                    onChange={(e) => setRemote(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {REMOTE_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o.charAt(0).toUpperCase() + o.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Experience Level
                  </label>
                  <select
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {EXPERIENCE_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o === "" ? "Any" : o.charAt(0).toUpperCase() + o.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Minimum Salary
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={salaryMinimum}
                    onChange={(e) => setSalaryMinimum(e.target.value)}
                    placeholder="e.g. 60000"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                Notifications
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Notification Email
                  </label>
                  <input
                    type="email"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Used as the self-notification "To" address. Leave blank to
                    use the signed-in account.
                  </p>
                </div>
                <div className="md:col-span-2 flex items-center gap-3">
                  <input
                    id="gmailNotifyEnabled"
                    type="checkbox"
                    checked={gmailNotifyEnabled}
                    onChange={(e) => setGmailNotifyEnabled(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <label
                    htmlFor="gmailNotifyEnabled"
                    className="text-sm text-slate-700"
                  >
                    Send me an email when a shortlisted interview or upswing is
                    detected
                  </label>
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}

export default Settings;
