import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import { getErrorMessage } from "../utils/apiError";
import {
  ImportedRepo,
  ProfessionalEvidence,
  LinkedInSuggestion,
  LinkedInDraft,
  LinkedInConnection,
} from "../types/professionalContent";

const API_BASE = "";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  approved: "Approved — Ready to Publish",
  publishing: "Publishing…",
  published: "Published",
  publish_failed: "Publish Failed",
  archived: "Archived",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  reviewed: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  publishing: "bg-amber-50 text-amber-700",
  published: "bg-violet-50 text-violet-700",
  publish_failed: "bg-red-50 text-red-700",
  archived: "bg-slate-100 text-slate-400",
};

function ProfessionalContent() {
  const [repos, setRepos] = useState<ImportedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ImportedRepo | null>(null);
  const [evidence, setEvidence] = useState<ProfessionalEvidence | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceUpdating, setEvidenceUpdating] = useState(false);

  const [suggestions, setSuggestions] = useState<LinkedInSuggestion[]>([]);
  const [assistLoading, setAssistLoading] = useState(false);

  const [drafts, setDrafts] = useState<LinkedInDraft[]>([]);
  const [editing, setEditing] = useState<LinkedInDraft | null>(null);
  const [hook, setHook] = useState("");
  const [body, setBody] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  const [linkedIn, setLinkedIn] = useState<LinkedInConnection | null>(null);
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [publishTarget, setPublishTarget] = useState<LinkedInDraft | null>(null);
  const [publishing, setPublishing] = useState(false);

  const fetchRepos = useCallback(async () => {
    try {
      const res = await api.get<{ repositories: ImportedRepo[] }>(
        `${API_BASE}/github/repositories/imported`
      );
      setRepos(res.data.repositories);
    } catch {
      setError("Failed to load imported repositories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await api.get<{ drafts: LinkedInDraft[] }>(
        `${API_BASE}/projects/linkedin-drafts?limit=100`
      );
      setDrafts(res.data.drafts);
    } catch {
      setDrafts([]);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const fetchLinkedInStatus = useCallback(async () => {
    setLinkedInLoading(true);
    try {
      const res = await api.get<LinkedInConnection>(
        `${API_BASE}/linkedin/status`
      );
      setLinkedIn(res.data);
    } catch {
      setLinkedIn(null);
    } finally {
      setLinkedInLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinkedInStatus();
  }, [fetchLinkedInStatus]);

  const connectLinkedIn = async () => {
    clearError();
    setConnectLoading(true);
    try {
      const res = await api.get<{ authorizeUrl: string }>(
        `${API_BASE}/linkedin/connect`
      );
      window.location.assign(res.data.authorizeUrl);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to start LinkedIn connection"));
      setConnectLoading(false);
    }
  };

  const disconnectLinkedIn = async () => {
    clearError();
    try {
      await api.post(`${API_BASE}/linkedin/disconnect`);
      setLinkedIn({ connected: false });
      setDraftNotice("LinkedIn account disconnected.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to disconnect LinkedIn"));
    }
  };

  const confirmPublish = (draft: LinkedInDraft) => {
    setPublishTarget(draft);
  };

  const cancelPublish = () => {
    if (publishing) return;
    setPublishTarget(null);
  };

  const publishDraft = async () => {
    if (!publishTarget) return;
    clearError();
    setPublishing(true);
    try {
      const res = await api.post<{
        draft: LinkedInDraft;
        posted: boolean;
        postUrn?: string;
        message?: string;
      }>(`${API_BASE}/projects/linkedin-drafts/${publishTarget._id}/publish`);
      const updated = res.data.draft;
      setDrafts((prev) =>
        prev.map((d) => (d._id === updated._id ? { ...d, ...updated } : d))
      );
      if (editing?._id === updated._id) setEditing((cur) => (cur ? { ...cur, ...updated } : cur));
      if (res.data.posted) {
        setDraftNotice(
          `Published to LinkedIn${res.data.postUrn ? ` (${res.data.postUrn})` : ""}.`
        );
      } else {
        const reason = updated.publishErrorMessageSafe || res.data.message || "Publication was not confirmed.";
        setDraftNotice(`The post was not published. ${reason}`);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to publish to LinkedIn"));
    } finally {
      setPublishing(false);
      setPublishTarget(null);
    }
  };

  const clearError = () => setError(null);

  const selectRepo = (repo: ImportedRepo) => {
    setSelected(repo);
    setEvidence(null);
    setSuggestions([]);
    setEditing(null);
    setDraftNotice(null);
    if (repo.approvedForProfessionalUse) {
      fetchEvidence(repo);
    }
  };

  const fetchEvidence = async (repo: ImportedRepo) => {
    setEvidenceLoading(true);
    try {
      const res = await api.get<{ evidence: ProfessionalEvidence }>(
        `${API_BASE}/github/repositories/${repo.githubRepositoryId}/professional-evidence`
      );
      setEvidence(res.data.evidence);
    } catch {
      setEvidence(null);
    } finally {
      setEvidenceLoading(false);
    }
  };

  const toggleApprove = async (repo: ImportedRepo) => {
    clearError();
    try {
      const res = await api.post<{ repository: ImportedRepo }>(
        `${API_BASE}/github/repositories/${repo.githubRepositoryId}/approve`,
        { approved: !repo.approvedForProfessionalUse }
      );
      const updated = res.data.repository;
      setRepos((prev) =>
        prev.map((r) =>
          r.githubRepositoryId === updated.githubRepositoryId ? { ...r, ...updated } : r
        )
      );
      const isCurrent = selected?.githubRepositoryId === updated.githubRepositoryId;
      if (isCurrent) {
        setSelected((cur) => (cur ? { ...cur, ...updated } : cur));
        if (!updated.approvedForProfessionalUse) {
          setEvidence(null);
          setSuggestions([]);
        }
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update approval"));
    }
  };

  const generateEvidence = async () => {
    if (!selected) return;
    clearError();
    setEvidenceUpdating(true);
    try {
      const res = await api.post<{
        evidence: ProfessionalEvidence;
        derivedFromExistingAnalysis: boolean;
      }>(
        `${API_BASE}/github/repositories/${selected.githubRepositoryId}/professional-evidence`
      );
      setEvidence(res.data.evidence);
      setDraftNotice(
        res.data.derivedFromExistingAnalysis
          ? "Professional evidence built from the existing AI project analysis. No fabricated metrics are added."
          : "Professional evidence saved. Fields without a provided source are left unknown."
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to generate professional evidence"));
    } finally {
      setEvidenceUpdating(false);
    }
  };

  const updateEvidenceField = async (field: string, value: string) => {
    if (!selected || !evidence) return;
    const clone = { ...evidence, [field]: value } as ProfessionalEvidence;
    setEvidence(clone);
    try {
      await api.patch(
        `${API_BASE}/github/repositories/${selected.githubRepositoryId}/professional-evidence`,
        { [field]: value }
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save evidence clarification"));
    }
  };

  const runAssist = async () => {
    if (!selected) return;
    clearError();
    setAssistLoading(true);
    setSuggestions([]);
    try {
      const res = await api.post<{ suggestions: LinkedInSuggestion[] }>(
        `${API_BASE}/github/repositories/${selected.githubRepositoryId}/linkedin-draft/assist`
      );
      setSuggestions(res.data.suggestions);
      const first = res.data.suggestions[0];
      if (first) {
        setEditing(null);
        setHook(first.hook);
        setBody(first.body);
        setHashtags(first.hashtags.join(", "));
      }
      setDraftNotice(
        "The first AI suggestion is loaded into the Hook, Body, and Hashtags fields below. Review and edit it, then click 'Save Draft' to persist your version. Nothing has been published automatically."
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to generate LinkedIn suggestions"));
    } finally {
      setAssistLoading(false);
    }
  };

  const useSuggestion = (s: LinkedInSuggestion) => {
    setEditing(null);
    setHook(s.hook);
    setBody(s.body);
    setHashtags(s.hashtags.join(", "));
    setDraftNotice(
      "Loaded suggestion into the draft editor. Review and edit it, then click 'Save Draft' to persist your version."
    );
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const saveDraft = async () => {
    if (!evidence) {
      setError("Generate professional evidence before saving a draft.");
      return;
    }
    clearError();
    setSaving(true);
    try {
      const payload = {
        evidence: evidence._id,
        hook,
        body,
        hashtags: hashtags
          .split(",")
          .map((h) => h.trim().replace(/^#/, ""))
          .filter(Boolean),
      };
      if (editing) {
        await api.patch(
          `${API_BASE}/projects/linkedin-drafts/${editing._id}`,
          { hook, body, hashtags: payload.hashtags }
        );
      } else {
        await api.post(`${API_BASE}/projects/linkedin-drafts`, payload);
      }
      setEditing(null);
      setDraftNotice("Draft saved as 'Draft'. Use 'Mark Reviewed' then 'Approve' when ready.");
      await loadDrafts();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save draft"));
    } finally {
      setSaving(false);
    }
  };

  const setDraftStatus = async (draft: LinkedInDraft) => {
    clearError();
    try {
      await api.post(`${API_BASE}/projects/linkedin-drafts/${draft._id}/approve`);
      await loadDrafts();
      if (editing?._id === draft._id) {
        const updated = drafts.find((d) => d._id === draft._id);
        if (updated) setEditing(updated);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update draft status"));
    }
  };

  const reviewDraft = async (draft: LinkedInDraft) => {
    await setDraftStatus(draft);
  };

  const editDraft = (draft: LinkedInDraft) => {
    setEditing(draft);
    setHook(draft.hook);
    setBody(draft.body);
    setHashtags(draft.hashtags.join(", "));
    setDraftNotice("Editing an existing draft. Changes update that draft.");
  };

  const currentDrafts = evidence
    ? drafts.filter((d) => {
        const ev = d.evidence;
        const evId = typeof ev === "string" ? ev : ev?._id;
        return Boolean(evId) && String(evId) === String(evidence._id);
      })
    : [];

  return (
    <DashboardLayout active="Professional Content">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Professional Content & Career Opportunities
          </h1>
          <p className="text-slate-500 mt-1">
            Turn an approved GitHub project into professional evidence and a
            LinkedIn draft. Claude suggests — you decide. Nothing is ever
            published automatically.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={clearError} className="text-red-500 hover:text-red-700 ml-4">
              Dismiss
            </button>
          </div>
        )}
        {draftNotice && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
            {draftNotice}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-slate-400">Loading repositories...</div>
        ) : repos.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <p className="text-slate-600 font-medium mb-1">No imported repositories.</p>
            <p className="text-slate-400 text-sm">
              Import a GitHub repository first (GitHub Projects), then approve it
              here for professional use.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-4 max-h-[75vh] overflow-y-auto">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Repositories</h2>
              <div className="space-y-2">
                {repos.map((repo) => (
                  <button
                    key={repo._id}
                    onClick={() => selectRepo(repo)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selected?.githubRepositoryId === repo.githubRepositoryId
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {repo.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          repo.approvedForProfessionalUse
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {repo.approvedForProfessionalUse ? "Approved" : "Not approved"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-1">
                      {repo.description || "No description"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {selected ? (
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        {selected.fullName}
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
                        {selected.description || "No description"}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleApprove(selected)}
                      className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                        selected.approvedForProfessionalUse
                          ? "text-red-600 border-red-200 hover:bg-red-50"
                          : "text-white bg-emerald-600 hover:bg-emerald-700"
                      }`}
                    >
                      {selected.approvedForProfessionalUse
                        ? "Revoke Approval"
                        : "Approve for Professional Use"}
                    </button>
                  </div>
                  {!selected.approvedForProfessionalUse && (
                    <p className="text-xs text-slate-400 mt-3">
                      This repository must be explicitly approved before it can be
                      analyzed or published about.
                    </p>
                  )}
                </div>

                <section className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        LinkedIn Publishing
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
                        {linkedInLoading
                          ? "Checking connection..."
                          : linkedIn?.connected
                          ? `Connected as ${linkedIn.linkedin?.displayName || linkedIn.linkedin?.memberId}`
                          : "Connect your LinkedIn account to publish approved posts via the official API."}
                      </p>
                    </div>
                    {linkedInLoading ? (
                      <span className="text-sm text-slate-400">Loading…</span>
                    ) : linkedIn?.connected ? (
                      <button
                        onClick={disconnectLinkedIn}
                        className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={connectLinkedIn}
                        disabled={connectLoading}
                        className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {connectLoading ? "Connecting…" : "Connect LinkedIn"}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-3">
                    Publishing only ever happens when you explicitly approve a
                    draft and click “Publish”. Nothing is posted automatically, and
                    no token is ever exposed to this page.
                  </p>
                </section>

                {selected.approvedForProfessionalUse && (
                  <>
                    <section className="bg-white border border-slate-200 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900">
                          Professional Evidence
                        </h2>
                        <button
                          onClick={generateEvidence}
                          disabled={evidenceUpdating}
                          className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          {evidenceUpdating
                            ? "Analyzing..."
                            : evidence
                            ? "Regenerate Evidence"
                            : "Analyze for Professional Use"}
                        </button>
                      </div>

                      {evidenceLoading && (
                        <p className="text-sm text-slate-400">Loading evidence...</p>
                      )}
                      {!evidenceLoading && !evidence && (
                        <p className="text-sm text-slate-400">
                          No professional evidence yet. Generate it to see the
                          evidence-backed professional summary.
                        </p>
                      )}

                      {evidence && (
                        <div className="space-y-4">
                          <p className="text-xs text-slate-400">
                            Evidence is derived from verified repository facts and
                            the existing AI project analysis. Metrics without a
                            source are left unknown, never fabricated.
                          </p>
                          <div>
                            <label className="text-xs font-semibold text-slate-500">
                              Professional Summary
                            </label>
                            <textarea
                              className="mt-1 w-full border border-slate-200 rounded-lg p-2 text-sm"
                              rows={2}
                              value={evidence.professionalSummary}
                              onChange={(e) =>
                                updateEvidenceField("professionalSummary", e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500">
                              Problem Solved
                            </label>
                            <textarea
                              className="mt-1 w-full border border-slate-200 rounded-lg p-2 text-sm"
                              rows={2}
                              value={evidence.problemSolved}
                              onChange={(e) =>
                                updateEvidenceField("problemSolved", e.target.value)
                              }
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-semibold text-slate-500">
                                Contribution Evidence
                              </label>
                              <textarea
                                className="mt-1 w-full border border-slate-200 rounded-lg p-2 text-sm"
                                rows={2}
                                placeholder="Only what you can verify (e.g., 'Designed the auth flow')."
                                value={evidence.contributionEvidence}
                                onChange={(e) =>
                                  updateEvidenceField("contributionEvidence", e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-500">
                                Measurable Impact
                              </label>
                              <textarea
                                className="mt-1 w-full border border-slate-200 rounded-lg p-2 text-sm"
                                rows={2}
                                placeholder="Only if you have real numbers; otherwise left blank."
                                value={evidence.measurableImpact}
                                onChange={(e) =>
                                  updateEvidenceField("measurableImpact", e.target.value)
                                }
                              />
                            </div>
                          </div>
                          <Chips
                            label="Technical Skills"
                            values={evidence.technicalSkills}
                          />
                          <Chips label="Technologies" values={evidence.technologies} />
                          <Chips
                            label="Architecture / Engineering Practices"
                            values={evidence.architecturePractices}
                          />
                          <Chips
                            label="Suggested Post Angles"
                            values={evidence.suggestedPostAngles}
                          />
                          <Tags
                            label="Role-Relevant Keywords (for job matching)"
                            values={evidence.roleRelevantKeywords}
                          />
                        </div>
                      )}
                    </section>

                    <section className="bg-white border border-slate-200 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900">
                          LinkedIn Post Draft
                        </h2>
                        <button
                          onClick={runAssist}
                          disabled={assistLoading || !evidence}
                          className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {assistLoading ? "Generating..." : "Generate LinkedIn Post"}
                        </button>
                      </div>

                      {suggestions.length > 0 && (
                        <div className="space-y-3 mb-5">
                          <p className="text-xs text-slate-400">
                            Claude suggestions for review only. Use one to load it
                            into the editor below — nothing is saved or published
                            automatically.
                          </p>
                          {suggestions.map((s, idx) => (
                            <div
                              key={idx}
                              className="border border-blue-200 rounded-lg p-4"
                            >
                              <p className="text-sm font-medium text-slate-900">{s.hook}</p>
                              <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{s.body}</p>
                              {s.hashtags.length > 0 && (
                                <p className="text-xs text-blue-600 mt-2">
                                  {s.hashtags.map((h) => `#${h}`).join(" ")}
                                </p>
                              )}
                              <button
                                onClick={() => useSuggestion(s)}
                                className="mt-3 px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                Use this suggestion
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-500">Hook</label>
                          <input
                            className="mt-1 w-full border border-slate-200 rounded-lg p-2 text-sm"
                            value={hook}
                            onChange={(e) => setHook(e.target.value)}
                            placeholder="Opening line"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-500">Body</label>
                          <textarea
                            className="mt-1 w-full border border-slate-200 rounded-lg p-2 text-sm"
                            rows={6}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Post body"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-500">
                            Hashtags (comma separated)
                          </label>
                          <input
                            className="mt-1 w-full border border-slate-200 rounded-lg p-2 text-sm"
                            value={hashtags}
                            onChange={(e) => setHashtags(e.target.value)}
                            placeholder="typescript, openSource"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={saveDraft}
                            disabled={saving || !evidence}
                            className="px-4 py-2 text-sm text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
                          >
                            {saving ? "Saving..." : editing ? "Update Draft" : "Save Draft"}
                          </button>
                          {editing && editing.status === "draft" && (
                            <button
                              onClick={() => reviewDraft(editing)}
                              className="px-4 py-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              Mark Reviewed & Approve
                            </button>
                          )}
                        </div>
                      </div>
                    </section>

                    <section className="bg-white border border-slate-200 rounded-xl p-6">
                      <h2 className="text-lg font-semibold text-slate-900 mb-4">
                        Drafts for this project
                      </h2>
                      {currentDrafts.length === 0 ? (
                        <p className="text-sm text-slate-400">
                          No drafts saved yet.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {currentDrafts.map((d) => (
                            <div
                              key={d._id}
                              className="border border-slate-100 rounded-lg p-4"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-slate-900">
                                  {d.hook || "(no hook)"}
                                </p>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                                    STATUS_STYLES[d.status] || STATUS_STYLES.draft
                                  }`}
                                >
                                  {STATUS_LABELS[d.status] || d.status}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 mt-1 truncate">
                                {d.body}
                              </p>
                              {d.status === "draft" && (
                                <div className="mt-2 flex items-center gap-2">
                                  <button
                                    onClick={() => editDraft(d)}
                                    className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => reviewDraft(d)}
                                    className="px-3 py-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                                  >
                                    Approve — Ready to Publish
                                  </button>
                                </div>
                              )}
                              {d.status === "approved" && (
                                <div className="mt-2">
                                  <p className="text-xs text-emerald-600">
                                    Approved and ready to publish.
                                  </p>
                                  <button
                                    onClick={() => confirmPublish(d)}
                                    className="mt-2 px-3 py-1.5 text-xs text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
                                  >
                                    Publish to LinkedIn
                                  </button>
                                </div>
                              )}
                              {d.status === "published" && (
                                <div className="mt-2 space-y-0.5">
                                  <p className="text-xs text-violet-700">
                                    Published to LinkedIn.
                                  </p>
                                  {d.linkedinPostUrn && (
                                    <p className="text-[11px] text-violet-500 break-all">
                                      {d.linkedinPostUrn}
                                    </p>
                                  )}
                                </div>
                              )}
                              {d.status === "publish_failed" && (
                                <div className="mt-2">
                                  <p className="text-xs text-red-600">
                                    Publish failed
                                    {d.publishErrorCode ? ` (${d.publishErrorCode})` : ""}:
                                    {" "}
                                    {d.publishErrorMessageSafe || "Unknown error"}
                                  </p>
                                  <button
                                    onClick={() => confirmPublish(d)}
                                    className="mt-2 px-3 py-1.5 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"
                                  >
                                    Retry publish
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>
            ) : (
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400">
                Select a repository to begin.
              </div>
            )}
          </div>
        )}

        {publishTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900">
                Publish this post to LinkedIn?
              </h3>
              <p className="text-sm text-slate-600 mt-2">
                This will create a real, public LinkedIn post on your behalf via the
                official LinkedIn API. This action takes effect immediately and
                cannot be undone.
              </p>
              <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-40 overflow-y-auto">
                <p className="text-sm font-medium text-slate-900">
                  {publishTarget.hook || "(no hook)"}
                </p>
                <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">
                  {publishTarget.body}
                </p>
                {publishTarget.hashtags.length > 0 && (
                  <p className="text-xs text-blue-600 mt-2">
                    {publishTarget.hashtags.map((h) => `#${h}`).join(" ")}
                  </p>
                )}
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={cancelPublish}
                  disabled={publishing}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={publishDraft}
                  disabled={publishing}
                  className="px-4 py-2 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
                >
                  {publishing ? "Publishing…" : "Publish Now"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function Chips({ label, values }: { label: string; values: string[] }) {
  if (!values || values.length === 0) return null;
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      <div className="flex flex-wrap gap-2 mt-1">
        {values.map((v, i) => (
          <span
            key={i}
            className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded-md"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

function Tags({ label, values }: { label: string; values: string[] }) {
  if (!values || values.length === 0) return null;
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      <div className="flex flex-wrap gap-2 mt-1">
        {values.map((v, i) => (
          <span
            key={i}
            className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

export default ProfessionalContent;
