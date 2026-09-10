import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import axios from "axios";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import { getErrorMessage } from "../utils/apiError";

interface WorkExperience {
  company: string;
  designation: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
  highlights: string[];
}

interface Education {
  level: "ssc" | "hsc" | "bachelor" | "master";
  institution: string;
  degree: string;
  fieldOfStudy: string;
  session: string;
  passingYear: string;
  gpa: string;
  cgpa: string;
  startDate: string;
  endDate: string;
  certificateFileName: string | null;
  certificateFileId: string | null;
}

interface ProfileData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  skills: string[];
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  cvFileName: string | null;
  cvFileId: string | null;
  workExperience: WorkExperience[];
  education: Education[];
}

const EDUCATION_LABELS: Record<Education["level"], string> = {
  ssc: "SSC / O-Level",
  hsc: "HSC / A-Level",
  bachelor: "Bachelor's Degree",
  master: "Master's Degree",
};

const emptyEducation = (level: Education["level"]): Education => ({
  level,
  institution: "",
  degree: "",
  fieldOfStudy: "",
  session: "",
  passingYear: "",
  gpa: "",
  cgpa: "",
  startDate: "",
  endDate: "",
  certificateFileName: null,
  certificateFileId: null,
});

const EDUCATION_ORDER: Education["level"][] = [
  "ssc",
  "hsc",
  "bachelor",
  "master",
];

const normalizeEducation = (
  education: Education[] | undefined
): Education[] => {
  const existing = new Map(
    (education || []).map((edu) => [edu.level, { ...edu }])
  );
  return EDUCATION_ORDER.map((level) => existing.get(level) || emptyEducation(level));
};

const emptyWork: WorkExperience = {
  company: "",
  designation: "",
  location: "",
  startDate: "",
  endDate: "",
  current: false,
  description: "",
  highlights: [],
};

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

const isImageFile = (fileName: string | null | undefined): boolean => {
  if (!fileName) return false;
  const ext = fileName.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.includes(ext);
};

function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [salaryCurrency, setSalaryCurrency] = useState("BDT");
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [cvPreviewUrl, setCvPreviewUrl] = useState<string | null>(null);
  const [cvModalOpen, setCvModalOpen] = useState(false);
  const [workExperience, setWorkExperience] = useState<WorkExperience[]>([
    { ...emptyWork },
  ]);
  const [education, setEducation] = useState<Education[]>([]);
  const [certPreviewUrls, setCertPreviewUrls] = useState<
    Record<number, string>
  >({});
  const [certModalIndex, setCertModalIndex] = useState<number | null>(null);
  const [highlightInputs, setHighlightInputs] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<{ profile: ProfileData }>("/profile");
        const p = res.data.profile;
        setFullName(p.fullName || "");
        setEmail(p.email || "");
        setPhone(p.phone || "");
        setLocation(p.location || "");
        setSkills(p.skills || []);
        setSalaryMin(p.salaryMin || "");
        setSalaryMax(p.salaryMax || "");
        setSalaryCurrency(p.salaryCurrency || "BDT");
        setCvFileName(p.cvFileName || null);
        setWorkExperience(p.workExperience?.length ? p.workExperience : [{ ...emptyWork }]);
        const norm = normalizeEducation(p.education);
        setEducation(norm);
        norm.forEach((edu, i) => {
          if (edu.certificateFileName) loadCertPreview(i);
        });
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setEducation(normalizeEducation(undefined));
        } else {
          setError(getErrorMessage(err, "Failed to load profile"));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!cvFileName) {
      setCvPreviewUrl(null);
      return;
    }
    let cancelled = false;
    const fetchCv = async () => {
      try {
        const res = await api.get("/profile/documents/cv", {
          responseType: "blob",
        });
        if (!cancelled) {
          const url = URL.createObjectURL(res.data as Blob);
          setCvPreviewUrl(url);
        }
      } catch {
        if (!cancelled) setCvPreviewUrl(null);
      }
    };
    fetchCv();
    return () => {
      cancelled = true;
    };
  }, [cvFileName]);

  const loadCertPreview = async (index: number) => {
    try {
      const res = await api.get(`/profile/documents/certificate/${index}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      setCertPreviewUrls((prev) => {
        if (prev[index]) URL.revokeObjectURL(prev[index]);
        return { ...prev, [index]: url };
      });
    } catch {
      // no preview available
    }
  };

  const clearCertPreview = (index: number) => {
    setCertPreviewUrls((prev) => {
      if (prev[index]) URL.revokeObjectURL(prev[index]);
      const { [index]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleWorkChange = (
    index: number,
    field: keyof WorkExperience,
    value: string | boolean
  ) => {
    setWorkExperience((prev) =>
      prev.map((w, i) =>
        i === index ? { ...w, [field]: value } : w
      )
    );
  };

  const addWorkHighlight = (workIndex: number) => {
    const key = `work-${workIndex}`;
    const val = highlightInputs[key]?.trim();
    if (!val) return;
    setWorkExperience((prev) =>
      prev.map((w, i) =>
        i === workIndex
          ? { ...w, highlights: [...w.highlights, val] }
          : w
      )
    );
    setHighlightInputs((h) => ({ ...h, [key]: "" }));
  };

  const removeWorkHighlight = (workIndex: number, hlIndex: number) => {
    setWorkExperience((prev) =>
      prev.map((w, i) =>
        i === workIndex
          ? { ...w, highlights: w.highlights.filter((_, j) => j !== hlIndex) }
          : w
      )
    );
  };

  const addSkill = () => {
    const val = skillInput.trim();
    if (!val) return;
    setSkills((prev) => [...prev, val]);
    setSkillInput("");
  };

  const removeSkill = (index: number) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEducation = (
    index: number,
    field: keyof Education,
    value: string
  ) => {
    setEducation((prev) =>
      prev.map((edu, i) => (i === index ? { ...edu, [field]: value } : edu))
    );
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload: Record<string, unknown> = {
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      location: location.trim(),
      salaryExpectation: {
        min: salaryMin.trim() === "" ? undefined : Number(salaryMin),
        max: salaryMax.trim() === "" ? undefined : Number(salaryMax),
        currency: salaryCurrency.trim(),
      },
      workExperience,
      education: education.map((edu) => ({
        level: edu.level,
        institution: edu.institution,
        degree: edu.degree,
        fieldOfStudy: edu.fieldOfStudy,
        startDate: edu.startDate,
        endDate: edu.endDate,
      })),
    };

    if (skills.length) payload.skills = skills;

    try {
      try {
        await api.patch("/profile", payload);
      } catch (patchErr) {
        if (axios.isAxiosError(patchErr) && patchErr.response?.status === 404) {
          await api.post("/profile", {
            ...payload,
            skills,
          });
        } else {
          throw patchErr;
        }
      }
      setSuccess("Profile saved.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not save profile"));
    } finally {
      setSaving(false);
    }
  };

  const handleCvUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setUploading("cv");
    setError(null);
    try {
      const res = await api.post<{ profile: { cvFileName: string | null } }>(
        "/profile/documents/cv",
        form
      );
      setCvFileName(res.data.profile.cvFileName || file.name);
      setSuccess("CV uploaded.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not upload CV"));
    } finally {
      setUploading(null);
      e.target.value = "";
    }
  };

  const handleCvDelete = async () => {
    setError(null);
    try {
      await api.delete("/profile/documents/cv");
      setCvFileName(null);
      setCvPreviewUrl(null);
      setSuccess("CV removed.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not remove CV"));
    }
  };

  const handleCertificateUpload = async (
    index: number,
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setUploading(`cert-${index}`);
    setError(null);
    try {
      const res = await api.post<{
        profile: { education: Education[] };
        extracted: {
          institution: string;
          degree: string;
          fieldOfStudy: string;
          session: string;
          passingYear: string;
          gpa: string;
          cgpa: string;
          startDate: string;
          endDate: string;
        };
      }>(`/profile/documents/certificate/${index}`, form);
      const updated = res.data.profile.education;
      const extracted = res.data.extracted;
      const updatedEntry = updated && updated[index];
      if (updatedEntry) {
        setEducation((prev) =>
          prev.map((edu, i) =>
            i === index
              ? {
                  ...edu,
                  certificateFileName: updatedEntry.certificateFileName,
                  certificateFileId: updatedEntry.certificateFileId,
                  institution: edu.institution || extracted.institution,
                  degree: edu.degree || extracted.degree,
                  fieldOfStudy: edu.fieldOfStudy || extracted.fieldOfStudy,
                  session: edu.session || extracted.session,
                  passingYear: edu.passingYear || extracted.passingYear,
                  gpa: edu.gpa || extracted.gpa,
                  cgpa: edu.cgpa || extracted.cgpa,
                  startDate: edu.startDate || extracted.startDate,
                  endDate: edu.endDate || extracted.endDate,
                }
              : edu
          )
        );
      }
      setSuccess("Certificate uploaded and fields extracted.");
      loadCertPreview(index);
    } catch (err) {
      setError(getErrorMessage(err, "Could not upload certificate"));
    } finally {
      setUploading(null);
      e.target.value = "";
    }
  };

  const handleCertificateDelete = async (index: number) => {
    setError(null);
    try {
      await api.delete(`/profile/documents/certificate/${index}`);
      setEducation((prev) =>
        prev.map((edu, i) =>
          i === index
            ? { ...edu, certificateFileName: null, certificateFileId: null }
            : edu
        )
      );
      setSuccess("Certificate removed.");
      clearCertPreview(index);
    } catch (err) {
      setError(getErrorMessage(err, "Could not remove certificate"));
    }
  };

  const inputClass =
    "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  const renderHighlightInput = (
    key: string,
    onAdd: () => void,
    items: string[],
    onRemove: (i: number) => void
  ) => (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={highlightInputs[key] || ""}
          onChange={(e) =>
            setHighlightInputs((h) => ({ ...h, [key]: e.target.value }))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="Add a bullet point"
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={onAdd}
          className="px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
        >
          Add
        </button>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-center justify-between text-sm text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg"
            >
              <span className="mr-2">{item}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-red-400 hover:text-red-600 text-xs"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <DashboardLayout active="Profile">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
          <p className="text-slate-500 mt-1">
            Your complete personal and professional information
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
            <button
              onClick={() => setSuccess(null)}
              className="text-green-500 ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-500 text-sm">Loading profile...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                Basic Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Gmail
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+8801XXXXXXXXX"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Dhaka, Bangladesh"
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                Skills
              </h2>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                  placeholder="Add a skill"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className="px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Add
                </button>
              </div>
              {skills.length > 0 && (
                <ul className="space-y-1">
                  {skills.map((skill, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between text-sm text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg"
                    >
                      <span className="mr-2">{skill}</span>
                      <button
                        type="button"
                        onClick={() => removeSkill(i)}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                CV
              </h2>
              <div className="flex items-start gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-4">
                    <label className="cursor-pointer inline-flex px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                      {uploading === "cv" ? "Uploading..." : "Upload CV"}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={handleCvUpload}
                        className="hidden"
                      />
                    </label>
                    {cvFileName && (
                      <span className="text-sm text-slate-700 flex items-center gap-3">
                        <span>{cvFileName}</span>
                        <button
                          type="button"
                          onClick={handleCvDelete}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Upload your CV (PDF, DOC, DOCX — max 8MB)
                  </p>
                </div>
                {cvPreviewUrl && (
                  <button
                    type="button"
                    onClick={() => setCvModalOpen(true)}
                    className="flex-shrink-0 w-24 h-32 border border-slate-200 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-400 transition-shadow cursor-pointer bg-slate-50 flex items-center justify-center"
                  >
                    <iframe
                      src={cvPreviewUrl}
                      className="w-full h-full pointer-events-none"
                      title="CV Preview"
                    />
                  </button>
                )}
              </div>
            </section>

            {cvModalOpen && cvPreviewUrl && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                onClick={() => setCvModalOpen(false)}
              >
                <div
                  className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {cvFileName}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCvModalOpen(false)}
                      className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                    >
                      &#10005;
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <iframe
                      src={cvPreviewUrl}
                      className="w-full h-full border-0"
                      title="CV Viewer"
                    />
                  </div>
                </div>
              </div>
            )}

            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                Work Experience
              </h2>
              <div className="space-y-6">
                {workExperience.map((work, idx) => (
                  <div
                    key={idx}
                    className="border border-slate-100 rounded-lg p-4 relative"
                  >
                    {workExperience.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setWorkExperience((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="absolute top-3 right-3 text-xs text-red-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Company *
                        </label>
                        <input
                          type="text"
                          value={work.company}
                          onChange={(e) =>
                            handleWorkChange(idx, "company", e.target.value)
                          }
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Designation *
                        </label>
                        <input
                          type="text"
                          value={work.designation}
                          onChange={(e) =>
                            handleWorkChange(idx, "designation", e.target.value)
                          }
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Location
                        </label>
                        <input
                          type="text"
                          value={work.location}
                          onChange={(e) =>
                            handleWorkChange(idx, "location", e.target.value)
                          }
                          className={inputClass}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Start Date
                          </label>
                          <input
                            type="text"
                            value={work.startDate}
                            onChange={(e) =>
                              handleWorkChange(idx, "startDate", e.target.value)
                            }
                            placeholder="e.g. Jan 2020"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            End Date
                          </label>
                          <input
                            type="text"
                            value={work.endDate}
                            onChange={(e) =>
                              handleWorkChange(idx, "endDate", e.target.value)
                            }
                            placeholder="e.g. Present"
                            disabled={work.current}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={work.current}
                            onChange={(e) =>
                              handleWorkChange(idx, "current", e.target.checked)
                            }
                            className="h-4 w-4 text-blue-600 border-slate-300 rounded"
                          />
                          Currently working here
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Highlights
                      </label>
                      {renderHighlightInput(
                        `work-${idx}`,
                        () => addWorkHighlight(idx),
                        work.highlights,
                        (hlIdx) => removeWorkHighlight(idx, hlIdx)
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 border-t border-slate-200"></div>
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        OR
                      </span>
                      <div className="flex-1 border-t border-slate-200"></div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Description
                      </label>
                      <textarea
                        rows={3}
                        value={work.description}
                        onChange={(e) =>
                          handleWorkChange(idx, "description", e.target.value)
                        }
                        placeholder="Describe your responsibilities and achievements as a paragraph..."
                        className={`${inputClass} resize-none`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setWorkExperience((prev) => [...prev, { ...emptyWork }])
                }
                className="mt-4 text-sm text-blue-600 hover:text-blue-700"
              >
                + Add another work experience
              </button>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                Education
              </h2>
              <div className="space-y-6">
                {education.map((edu, i) => {
                  const isSecondary = edu.level === "ssc" || edu.level === "hsc";
                  return (
                    <>
                      <div
                        key={edu.level}
                        className="border border-slate-200 rounded-lg p-4 space-y-3"
                      >
                      <h3 className="text-sm font-medium text-slate-800">
                        {EDUCATION_LABELS[edu.level]}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Institution
                          </label>
                          <input
                            type="text"
                            value={edu.institution}
                            onChange={(e) =>
                              updateEducation(i, "institution", e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Degree / Certificate
                          </label>
                          <input
                            type="text"
                            value={edu.degree}
                            onChange={(e) =>
                              updateEducation(i, "degree", e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>
                        {isSecondary ? (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                Group
                              </label>
                              <input
                                type="text"
                                value={edu.fieldOfStudy}
                                onChange={(e) =>
                                  updateEducation(i, "fieldOfStudy", e.target.value)
                                }
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                Session
                              </label>
                              <input
                                type="text"
                                value={edu.session}
                                onChange={(e) =>
                                  updateEducation(i, "session", e.target.value)
                                }
                                placeholder="e.g. 2025-26"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                Passing Year
                              </label>
                              <input
                                type="text"
                                value={edu.passingYear}
                                onChange={(e) =>
                                  updateEducation(i, "passingYear", e.target.value)
                                }
                                placeholder="e.g. 2025"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                GPA
                              </label>
                              <input
                                type="text"
                                value={edu.gpa}
                                onChange={(e) =>
                                  updateEducation(i, "gpa", e.target.value)
                                }
                                placeholder="e.g. 4.50/5.00"
                                className={inputClass}
                              />
                            </div>
                          </>
                        ) : edu.level === "master" ? (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                Major
                              </label>
                              <input
                                type="text"
                                value={edu.fieldOfStudy}
                                onChange={(e) =>
                                  updateEducation(i, "fieldOfStudy", e.target.value)
                                }
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                CGPA
                              </label>
                              <input
                                type="text"
                                value={edu.cgpa}
                                onChange={(e) =>
                                  updateEducation(i, "cgpa", e.target.value)
                                }
                                placeholder="e.g. 3.50 out of 4.00"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                Start
                              </label>
                              <input
                                type="text"
                                value={edu.startDate}
                                onChange={(e) =>
                                  updateEducation(i, "startDate", e.target.value)
                                }
                                placeholder="e.g. Jan 2025"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                End
                              </label>
                              <input
                                type="text"
                                value={edu.endDate}
                                onChange={(e) =>
                                  updateEducation(i, "endDate", e.target.value)
                                }
                                placeholder="e.g. Dec 2026"
                                className={inputClass}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                Major
                              </label>
                              <input
                                type="text"
                                value={edu.fieldOfStudy}
                                onChange={(e) =>
                                  updateEducation(i, "fieldOfStudy", e.target.value)
                                }
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                CGPA
                              </label>
                              <input
                                type="text"
                                value={edu.cgpa}
                                onChange={(e) =>
                                  updateEducation(i, "cgpa", e.target.value)
                                }
                                placeholder="e.g. 3.50 out of 4.00"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                Start
                              </label>
                              <input
                                type="text"
                                value={edu.startDate}
                                onChange={(e) =>
                                  updateEducation(i, "startDate", e.target.value)
                                }
                                placeholder="e.g. Jan 2022"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                End
                              </label>
                              <input
                                type="text"
                                value={edu.endDate}
                                onChange={(e) =>
                                  updateEducation(i, "endDate", e.target.value)
                                }
                                placeholder="e.g. Dec 2025"
                                className={inputClass}
                              />
                            </div>
                          </>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Certificate
                        </label>
                        <div className="flex items-start gap-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-4">
                              <label className="cursor-pointer inline-flex px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                                {uploading === `cert-${i}`
                                  ? "Uploading..."
                                  : "Upload Certificate"}
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp"
                                  onChange={(e) => handleCertificateUpload(i, e)}
                                  className="hidden"
                                />
                              </label>
                              {edu.certificateFileName && (
                                <span className="text-sm text-slate-700 flex items-center gap-3">
                                  <span>{edu.certificateFileName}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCertificateDelete(i)}
                                    className="text-xs text-red-600 hover:underline"
                                  >
                                    Remove
                                  </button>
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mt-2">
                              Supported: PDF, DOC, DOCX, PNG, JPG, GIF, WEBP
                            </p>
                          </div>
                          {certPreviewUrls[i] && (
                            <button
                              type="button"
                              onClick={() => setCertModalIndex(i)}
                              className="flex-shrink-0 w-20 h-28 border border-slate-200 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-400 transition-shadow cursor-pointer bg-slate-50 flex items-center justify-center"
                            >
                              {isImageFile(edu.certificateFileName) ? (
                                <img
                                  src={certPreviewUrls[i]}
                                  alt="Certificate Preview"
                                  className="w-full h-full object-contain pointer-events-none"
                                />
                              ) : (
                                <iframe
                                  src={certPreviewUrls[i]}
                                  className="w-full h-full pointer-events-none"
                                  title="Certificate Preview"
                                />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {certModalIndex === i && certPreviewUrls[i] && (
                      <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                        onClick={() => setCertModalIndex(null)}
                      >
                        <div
                          className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                            <h3 className="text-sm font-semibold text-slate-900">
                              {edu.certificateFileName}
                            </h3>
                            <button
                              type="button"
                              onClick={() => setCertModalIndex(null)}
                              className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                            >
                              &#10005;
                            </button>
                          </div>
<div className="flex-1 overflow-hidden">
                              {isImageFile(edu.certificateFileName) ? (
                                <img
                                  src={certPreviewUrls[i]}
                                  alt={edu.certificateFileName || "Certificate"}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <iframe
                                  src={certPreviewUrls[i]}
                                  className="w-full h-full border-0"
                                  title={edu.certificateFileName || "Certificate"}
                                />
                              )}
                            </div>
                        </div>
                      </div>
                    )}
                    </>
                  );
                })}
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                Salary Range
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Minimum
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                    placeholder="e.g. 50000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Maximum
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(e.target.value)}
                    placeholder="e.g. 120000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Currency
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={salaryCurrency}
                    onChange={(e) => setSalaryCurrency(e.target.value)}
                    placeholder="e.g. BDT, USD"
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}

export default Profile;
