import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import { getErrorMessage } from "../utils/apiError";
import {
  ImportedRepo,
  ProfessionalEvidence,
  LinkedInSuggestion,
  LinkedInDraft,
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
      if (!evidence) {
        setDraftNotice("No professional evidence yet. Generating it first, then Claude will draft your post.");
        const evRes = await api.post<{ evidence: ProfessionalEvidence }>(
          `${API_BASE}/github/repositories/${selected.githubRepositoryId}/professional-evidence`
        );
        setEvidence(evRes.data.evidence);
      }
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
        <header className="page-header">
          <div>
            <h1 className="page-title">
              Professional Content & Career Opportunities
            </h1>
            <p className="page-subtitle">
              Turn an approved GitHub project into professional evidence and a
              LinkedIn draft. Claude suggests — you decide. Nothing is ever
              published automatically.
            </p>
          </div>
        </header>

        {error && (
          <div className="alert-error mb-6">
            <span>{error}</span>
            <button
              onClick={clearError}
              className="shrink-0 font-semibold text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}
        {draftNotice && (
          <div className="alert-warning mb-6">{draftNotice}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
            <span className="spinner h-5 w-5" />
            Loading repositories...
          </div>
        ) : repos.length === 0 ? (
          <div className="empty-state p-10">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
              <span className="h-5 w-5 rounded-full border-2 border-dashed border-brand-400" />
            </div>
            <p className="font-semibold text-slate-700 mb-1.5">No imported repositories</p>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              Import a GitHub repository first (GitHub Projects), then approve it
              here for professional use.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 card p-4 lg:max-h-[75vh] lg:overflow-y-auto">
              <h2 className="section-title mb-3">Repositories</h2>
              <div className="space-y-2">
                {repos.map((repo) => (
                  <button
                    key={repo._id}
                    onClick={() => selectRepo(repo)}
                    className={`w-full text-left p-3 rounded-xl transition-all duration-150 ${
                      selected?.githubRepositoryId === repo.githubRepositoryId
                        ? "border border-brand-300 bg-brand-50 ring-1 ring-brand-200 shadow-sm"
                        : "border border-slate-200 hover:border-brand-200 hover:bg-slate-50 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900 truncate min-w-0">
                        {repo.name}
                      </span>
                      <span
                        className={`badge ${
                          repo.approvedForProfessionalUse
                            ? "bg-emerald-100 text-emerald-700"
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
                <div className="card relative overflow-hidden p-6">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-violet-500 to-brand-600" />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900 truncate">
                          {selected.fullName}
                        </h2>
                        {selected.approvedForProfessionalUse && (
                          <span className="badge bg-emerald-100 text-emerald-700 shrink-0">
                            Approved
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        {selected.description || "No description"}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleApprove(selected)}
                      className={`btn w-full sm:w-auto justify-center shrink-0 ${
                        selected.approvedForProfessionalUse
                          ? "btn-danger-outline"
                          : "bg-gradient-to-br from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 shadow-[0_10px_24px_-10px_rgb(5_150_105/0.55)]"
                      }`}
                    >
                      {selected.approvedForProfessionalUse
                        ? "Revoke Approval"
                        : "Approve for Professional Use"}
                    </button>
                  </div>
                  {!selected.approvedForProfessionalUse && (
                    <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                      This repository must be explicitly approved before it can be
                      analyzed or published about.
                    </div>
                  )}
                </div>

                <section className="card p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        LinkedIn Publishing
                      </h2>
                      <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                        Publishing only ever happens when you explicitly approve a
                        draft and click "Publish". Nothing is posted automatically,
                        and no token is ever exposed to this page.
                      </p>
                    </div>
                    <Link
                      to="/dashboard/connections"
                      className="btn btn-sm btn-secondary shrink-0"
                    >
                      Manage in Connections
                    </Link>
                  </div>
                </section>

                {selected.approvedForProfessionalUse && (
                  <>
                    <section className="card p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                        <h2 className="text-lg font-semibold text-slate-900">
                          Professional Evidence
                        </h2>
                        <button
                          onClick={generateEvidence}
                          disabled={evidenceUpdating}
                          className="btn btn-primary btn-sm w-full sm:w-auto justify-center shrink-0"
                        >
                          {evidenceUpdating
                            ? "Analyzing..."
                            : evidence
                            ? "Regenerate Evidence"
                            : "Analyze for Professional Use"}
                        </button>
                      </div>

                      {evidenceLoading && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span className="spinner h-4 w-4" />
                          Loading evidence...
                        </div>
                      )}
                      {!evidenceLoading && !evidence && (
                        <div className="rounded-xl bg-slate-50 border border-dashed border-slate-300 p-5 text-sm text-slate-500 text-center">
                          No professional evidence yet. Generate it to see the
                          evidence-backed professional summary.
                        </div>
                      )}

                      {evidence && (
                        <div className="space-y-4">
                          <div className="rounded-lg bg-brand-50 border border-brand-100 px-3 py-2 text-xs text-brand-700">
                            Evidence is derived from verified repository facts and
                            the existing AI project analysis. Metrics without a
                            source are left unknown, never fabricated.
                          </div>
                          <div>
                            <label className="field-label">
                              Professional Summary
                            </label>
                            <textarea
                              className="textarea"
                              rows={2}
                              value={evidence.professionalSummary}
                              onChange={(e) =>
                                updateEvidenceField("professionalSummary", e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <label className="field-label">
                              Problem Solved
                            </label>
                            <textarea
                              className="textarea"
                              rows={2}
                              value={evidence.problemSolved}
                              onChange={(e) =>
                                updateEvidenceField("problemSolved", e.target.value)
                              }
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="field-label">
                                Contribution Evidence
                              </label>
                              <textarea
                                className="textarea"
                                rows={2}
                                placeholder="Only what you can verify (e.g., 'Designed the auth flow')."
                                value={evidence.contributionEvidence}
                                onChange={(e) =>
                                  updateEvidenceField("contributionEvidence", e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <label className="field-label">
                                Measurable Impact
                              </label>
                              <textarea
                                className="textarea"
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

                    <section className="card p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                        <h2 className="text-lg font-semibold text-slate-900">
                          LinkedIn Post Draft
                        </h2>
                        <button
                          onClick={runAssist}
                          disabled={assistLoading}
                          className="btn btn-primary btn-sm w-full sm:w-auto justify-center shrink-0"
                        >
                          {assistLoading ? "Generating..." : "Generate LinkedIn Post"}
                        </button>
                      </div>

                      {suggestions.length > 0 && (
                        <div className="space-y-3 mb-5">
                          <p className="text-xs text-slate-500">
                            Claude suggestions for review only. Use one to load it
                            into the editor below — nothing is saved or published
                            automatically.
                          </p>
                          {suggestions.map((s, idx) => (
                            <div
                              key={idx}
                              className="card-hover border-brand-100 p-4"
                            >
                              <p className="text-sm font-semibold text-slate-900">{s.hook}</p>
                              <p className="text-sm text-slate-600 mt-1.5 whitespace-pre-wrap break-words">{s.body}</p>
                              {s.hashtags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {s.hashtags.map((h, i) => (
                                    <span key={i} className="badge bg-brand-100 text-brand-700">
                                      #{h}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <button
                                onClick={() => useSuggestion(s)}
                                className="btn btn-sm btn-primary mt-3"
                              >
                                Use this suggestion
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <label className="field-label">Hook</label>
                          <input
                            className="input"
                            value={hook}
                            onChange={(e) => setHook(e.target.value)}
                            placeholder="Opening line"
                          />
                        </div>
                        <div>
                          <label className="field-label">Body</label>
                          <textarea
                            className="textarea"
                            rows={6}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Post body"
                          />
                        </div>
                        <div>
                          <label className="field-label">
                            Hashtags (comma separated)
                          </label>
                          <input
                            className="input"
                            value={hashtags}
                            onChange={(e) => setHashtags(e.target.value)}
                            placeholder="typescript, openSource"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            onClick={saveDraft}
                            disabled={saving || !evidence}
                            className="btn btn-primary"
                          >
                            {saving ? "Saving..." : editing ? "Update Draft" : "Save Draft"}
                          </button>
                          {editing && editing.status === "draft" && (
                            <button
                              onClick={() => reviewDraft(editing)}
                              className="btn btn-secondary"
                            >
                              Mark Reviewed & Approve
                            </button>
                          )}
                        </div>
                      </div>
                    </section>

                    <section className="card p-6">
                      <h2 className="text-lg font-semibold text-slate-900 mb-4">
                        Drafts for this project
                      </h2>
                      {currentDrafts.length === 0 ? (
                        <div className="rounded-xl bg-slate-50 border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
                          No drafts saved yet.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {currentDrafts.map((d) => (
                            <div
                              key={d._id}
                              className="border border-slate-200 rounded-xl p-4 hover:border-brand-200 transition-colors"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm font-medium text-slate-900 truncate min-w-0">
                                  {d.hook || "(no hook)"}
                                </p>
                                <span
                                  className={`badge shrink-0 ${
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
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <button
                                    onClick={() => editDraft(d)}
                                    className="btn btn-sm btn-outline"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => reviewDraft(d)}
                                    className="btn btn-sm bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300"
                                  >
                                    Approve — Ready to Publish
                                  </button>
                                </div>
                              )}
                              {d.status === "approved" && (
                                <div className="mt-3">
                                  <p className="text-xs text-emerald-600">
                                    Approved and ready to publish.
                                  </p>
                                  <button
                                    onClick={() => confirmPublish(d)}
                                    className="btn btn-sm btn-primary mt-2"
                                  >
                                    Publish to LinkedIn
                                  </button>
                                </div>
                              )}
                              {d.status === "published" && (
                                <div className="mt-3 space-y-0.5">
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
                                <div className="mt-3">
                                  <p className="text-xs text-red-600">
                                    Publish failed
                                    {d.publishErrorCode ? ` (${d.publishErrorCode})` : ""}:
                                    {" "}
                                    {d.publishErrorMessageSafe || "Unknown error"}
                                  </p>
                                  <button
                                    onClick={() => confirmPublish(d)}
                                    className="btn btn-sm border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-300 mt-2"
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
              <div className="lg:col-span-2 card p-10 flex flex-col items-center justify-center text-center text-slate-400 min-h-[280px]">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
                  <span className="h-6 w-6 rounded-full border-2 border-dashed border-brand-400" />
                </div>
                <p className="text-slate-500 font-medium">Select a repository to begin</p>
              </div>
            )}
          </div>
        )}

        {publishTarget && (
          <div className="modal-backdrop">
            <div className="modal-panel max-w-md p-6">
              <h3 className="text-lg font-semibold text-slate-900">
                Publish this post to LinkedIn?
              </h3>
              <p className="text-sm text-slate-600 mt-2">
                This will create a real, public LinkedIn post on your behalf via the
                official LinkedIn API. This action takes effect immediately and
                cannot be undone.
              </p>
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-4 max-h-40 overflow-y-auto">
                <p className="text-sm font-semibold text-slate-900 break-words">
                  {publishTarget.hook || "(no hook)"}
                </p>
                <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap break-words">
                  {publishTarget.body}
                </p>
                {publishTarget.hashtags.length > 0 && (
                  <p className="text-xs text-brand-700 mt-2">
                    {publishTarget.hashtags.map((h) => `#${h}`).join(" ")}
                  </p>
                )}
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={cancelPublish}
                  disabled={publishing}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  onClick={publishDraft}
                  disabled={publishing}
                  className="btn btn-primary"
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
      <label className="field-label">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span key={i} className="chip bg-slate-100 text-slate-700">
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
      <label className="field-label">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span key={i} className="chip bg-brand-50 text-brand-700">
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

export default ProfessionalContent;
