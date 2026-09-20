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
  gmailAutoStatusEnabled: boolean;
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
  const [gmailAutoStatusEnabled, setGmailAutoStatusEnabled] = useState(false);
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
        setGmailAutoStatusEnabled(
          res.data.notifications.gmailAutoStatusEnabled === true
        );
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
        gmailAutoStatusEnabled,
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
        <div className="page-header">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">
              Job source status, search preferences and notifications
            </p>
          </div>
        </div>

        {error && (
          <div className="alert-error mb-6">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="btn-ghost btn-sm shrink-0 text-red-500 hover:text-red-700 hover:bg-red-100"
            >
              Dismiss
            </button>
          </div>
        )}
        {success && (
          <div className="alert-success mb-6">
            <span>{success}</span>
            <button
              onClick={() => setSuccess(null)}
              className="btn-ghost btn-sm shrink-0 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="card text-center py-16">
            <span className="spinner h-8 w-8 mb-4"></span>
            <p className="text-slate-500 text-sm">Loading settings...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <section className="card p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7M4 7l8 5 8-5M4 7V5a1 1 0 011-1h14a1 1 0 011 1v2"
                    />
                  </svg>
                </span>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Job Sources
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Sources with a key are configured. Missing keys disable the
                    source (its jobs are skipped silently).
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50 px-1">
                {sources.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <span className="text-sm font-medium text-slate-800">
                      {s.name}
                    </span>
                    <span
                      className={`badge ${
                        s.configured
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {s.configured ? "Configured" : "Not configured"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </span>
                <h2 className="text-base font-semibold text-slate-900">
                  Job Search Preferences
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="field-label">Roles</label>
                  <input
                    type="text"
                    value={roles}
                    onChange={(e) => setRoles(e.target.value)}
                    placeholder="e.g. Full Stack Developer, Frontend Engineer"
                    className="input"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">
                    Comma-separated
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="field-label">Locations</label>
                  <input
                    type="text"
                    value={locations}
                    onChange={(e) => setLocations(e.target.value)}
                    placeholder="e.g. London, Berlin, Remote"
                    className="input"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">
                    Comma-separated
                  </p>
                </div>
                <div>
                  <label className="field-label">Work Preference</label>
                  <select
                    value={remote}
                    onChange={(e) => setRemote(e.target.value)}
                    className="select"
                  >
                    {REMOTE_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o.charAt(0).toUpperCase() + o.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Experience Level</label>
                  <select
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    className="select"
                  >
                    {EXPERIENCE_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o === "" ? "Any" : o.charAt(0).toUpperCase() + o.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Minimum Salary</label>
                  <input
                    type="number"
                    min="0"
                    value={salaryMinimum}
                    onChange={(e) => setSalaryMinimum(e.target.value)}
                    placeholder="e.g. 60000"
                    className="input"
                  />
                </div>
              </div>
            </section>

            <section className="card p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 17h5l-1.4-1.4a2 2 0 00-1.4-.6h-4.2M9 17H4l1.4-1.4A2 2 0 016.8 15h4.2M12 3v3m-5-.5a7 7 0 1110 0M5 13a7 7 0 013-5.9"
                    />
                  </svg>
                </span>
                <h2 className="text-base font-semibold text-slate-900">
                  Notifications
                </h2>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="field-label">Notification Email</label>
                  <input
                    type="email"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">
                    Used as the self-notification "To" address. Leave blank to
                    use the signed-in account.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 flex items-start gap-3">
                  <input
                    id="gmailNotifyEnabled"
                    type="checkbox"
                    checked={gmailNotifyEnabled}
                    onChange={(e) => setGmailNotifyEnabled(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 accent-brand-600 focus:ring-brand-500"
                  />
                  <label
                    htmlFor="gmailNotifyEnabled"
                    className="text-sm font-medium text-slate-700"
                  >
                    Send me an email when a shortlisted interview or upswing is
                    detected
                  </label>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 flex items-start gap-3">
                  <input
                    id="gmailAutoStatusEnabled"
                    type="checkbox"
                    checked={gmailAutoStatusEnabled}
                    onChange={(e) => setGmailAutoStatusEnabled(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 accent-brand-600 focus:ring-brand-500"
                  />
                  <label
                    htmlFor="gmailAutoStatusEnabled"
                    className="text-sm font-medium text-slate-700"
                  >
                    Automatically update my application status when a
                    high-confidence hiring stage (shortlist, interview, offer,
                    rejection) is detected in Gmail
                  </label>
                </div>
                <p className="rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-xs text-slate-500">
                  Automatic updates apply only to high-confidence detections on
                  the correct application and never set "applied" or revert a
                  withdrawn application.
                </p>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary px-6 py-2.5"
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
