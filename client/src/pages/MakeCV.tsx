import { useEffect, useState, useCallback, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";

interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedIn: string;
  website: string;
}

interface Education {
  institution: string;
  degreeType: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gradeValue: string;
  highlights: string[];
}

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

interface Project {
  name: string;
  description: string;
  githubLink: string;
  liveLink: string;
  highlights: string[];
}

interface CVProfileData {
  _id: string;
  title: string;
  personalInfo: PersonalInfo;
  professionalSummary: string;
  education: Education[];
  workExperience: WorkExperience[];
  skills: string[];
  projects: Project[];
  achievements: string[];
  additionalInfo: { bullets: string[]; description: string };
}

const STEPS = [
  "Personal Info",
  "Summary",
  "Education",
  "Work Experience",
  "Skills",
  "Projects",
  "Achievements",
  "Additional Information",
  "Review",
] as const;

const emptyPersonalInfo: PersonalInfo = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedIn: "",
  website: "",
};

const emptyEducation: Education = {
  institution: "",
  degreeType: "",
  degree: "",
  field: "",
  startDate: "",
  endDate: "",
  gradeValue: "",
  highlights: [],
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

const emptyProject: Project = { name: "", description: "", githubLink: "", liveLink: "", highlights: [] };

const EDUCATION_GROUPS = ["Science", "Humanities", "Commerce"];
const SCHOOL_DEGREE_TYPES = ["SSC", "HSC"];
const MAJOR_DEGREE_TYPES = ["Diploma", "Bachelor's", "Master's"];

function newEmptyData(): CVProfileData {
  return {
    _id: "",
    title: "My CV",
    personalInfo: { ...emptyPersonalInfo },
    professionalSummary: "",
    education: [{ ...emptyEducation }],
    workExperience: [{ ...emptyWork }],
    skills: [],
    projects: [{ ...emptyProject }],
    achievements: [],
    additionalInfo: { bullets: [], description: "" },
  };
}

function MakeCV() {
  const [searchParams] = useSearchParams();
  const existingId = searchParams.get("id");

  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<CVProfileData>(newEmptyData);
  const [loading, setLoading] = useState(!!existingId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [highlightInputs, setHighlightInputs] = useState<Record<string, string>>({});

  const loadProfile = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ profile: CVProfileData }>(`/cv/${id}`);
      setData({
        ...res.data.profile,
        additionalInfo: res.data.profile.additionalInfo ?? {
          bullets: [],
          description: "",
        },
      });
    } catch {
      setError("Failed to load CV profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (existingId) loadProfile(existingId);
  }, [existingId, loadProfile]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { _id: _, ...rest } = data;
      const payload = {
        ...rest,
        education: data.education.filter(
          (e) => e.institution.trim() && e.degree.trim()
        ),
        workExperience: data.workExperience.filter(
          (w) => w.company.trim() && w.designation.trim()
        ),
        projects: data.projects.filter((p) => p.name.trim()),
      };
      if (data._id) {
        const res = await api.patch<{ profile: CVProfileData }>(`/cv/${data._id}`, payload);
        setData(res.data.profile);
        setSaved(true);
        setSuccess("Saved");
      } else {
        const res = await api.post<{ profile: CVProfileData }>("/cv", payload);
        setData(res.data.profile);
        setSaved(true);
        setSuccess("Created");
      }
    } catch (err: unknown) {
      let msg = "Failed to save";
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as Record<string, unknown>;
        msg = (data.error as string) || msg;
        if (Array.isArray(data.details)) {
          const details = data.details
            .map((d: { field?: string; message?: string }) =>
              d.field ? `${d.field}: ${d.message}` : d.message
            )
            .join("; ");
          if (details) msg = `${msg} — ${details}`;
        }
      }
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!data._id) {
      setError("Save your CV before downloading");
      return;
    }
    try {
      const res = await api.get(`/cv/${data._id}/generate-pdf`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF");
    }
  };

  const handlePersonalInfo = (field: keyof PersonalInfo, value: string) => {
    setData((d) => ({ ...d, personalInfo: { ...d.personalInfo, [field]: value } }));
  };

  const handleWorkChange = (
    index: number,
    field: keyof WorkExperience,
    value: string | boolean
  ) => {
    setData((d) => {
      const copy = [...d.workExperience];
      copy[index] = { ...copy[index], [field]: value } as WorkExperience;
      return { ...d, workExperience: copy };
    });
  };

  const addWorkHighlight = (workIndex: number) => {
    const key = `work-${workIndex}`;
    const val = highlightInputs[key]?.trim();
    if (!val) return;
    setData((d) => {
      const copy = [...d.workExperience];
      copy[workIndex] = {
        ...copy[workIndex]!,
        highlights: [...copy[workIndex]!.highlights, val],
      } as WorkExperience;
      return { ...d, workExperience: copy };
    });
    setHighlightInputs((h) => ({ ...h, [key]: "" }));
  };

  const removeWorkHighlight = (workIndex: number, hlIndex: number) => {
    setData((d) => {
      const copy = [...d.workExperience];
      copy[workIndex] = {
        ...copy[workIndex]!,
        highlights: copy[workIndex]!.highlights.filter((_, i) => i !== hlIndex),
      } as WorkExperience;
      return { ...d, workExperience: copy };
    });
  };

  const handleEduChange = (
    index: number,
    field: keyof Education,
    value: string
  ) => {
    setData((d) => {
      const copy = [...d.education];
      copy[index] = { ...copy[index], [field]: value } as Education;
      return { ...d, education: copy };
    });
  };

  const handleEduDegreeTypeChange = (index: number, value: string) => {
    setData((d) => {
      const copy = [...d.education];
      const autoDegree =
        value === "HSC"
          ? "Higher Secondary Certificate"
          : value === "SSC"
          ? "Secondary School Certificate"
          : copy[index]!.degree;
      copy[index] = {
        ...copy[index],
        degreeType: value,
        degree: autoDegree,
        field: "",
      } as Education;
      return { ...d, education: copy };
    });
  };

  const addEduHighlight = (eduIndex: number) => {
    const key = `edu-${eduIndex}`;
    const val = highlightInputs[key]?.trim();
    if (!val) return;
    setData((d) => {
      const copy = [...d.education];
      copy[eduIndex] = {
        ...copy[eduIndex]!,
        highlights: [...copy[eduIndex]!.highlights, val],
      } as Education;
      return { ...d, education: copy };
    });
    setHighlightInputs((h) => ({ ...h, [key]: "" }));
  };

  const removeEduHighlight = (eduIndex: number, hlIndex: number) => {
    setData((d) => {
      const copy = [...d.education];
      copy[eduIndex] = {
        ...copy[eduIndex]!,
        highlights: copy[eduIndex]!.highlights.filter((_, i) => i !== hlIndex),
      } as Education;
      return { ...d, education: copy };
    });
  };

  const handleProjectChange = (
    index: number,
    field: keyof Project,
    value: string
  ) => {
    setData((d) => {
      const copy = [...d.projects];
      copy[index] = { ...copy[index], [field]: value } as Project;
      return { ...d, projects: copy };
    });
  };

  const addProjectHighlight = (projIndex: number) => {
    const key = `proj-${projIndex}`;
    const val = highlightInputs[key]?.trim();
    if (!val) return;
    setData((d) => {
      const copy = [...d.projects];
      copy[projIndex] = {
        ...copy[projIndex]!,
        highlights: [...copy[projIndex]!.highlights, val],
      } as Project;
      return { ...d, projects: copy };
    });
    setHighlightInputs((h) => ({ ...h, [key]: "" }));
  };

  const removeProjectHighlight = (projIndex: number, hlIndex: number) => {
    setData((d) => {
      const copy = [...d.projects];
      copy[projIndex] = {
        ...copy[projIndex]!,
        highlights: copy[projIndex]!.highlights.filter((_, i) => i !== hlIndex),
      } as Project;
      return { ...d, projects: copy };
    });
  };

  const addSkill = () => {
    const val = highlightInputs["skills"]?.trim();
    if (!val) return;
    setData((d) => ({ ...d, skills: [...d.skills, val] }));
    setHighlightInputs((h) => ({ ...h, skills: "" }));
  };

  const removeSkill = (idx: number) => {
    setData((d) => ({
      ...d,
      skills: d.skills.filter((_, i) => i !== idx),
    }));
  };

  const addAchievement = () => {
    const val = highlightInputs["achievements"]?.trim();
    if (!val) return;
    setData((d) => ({ ...d, achievements: [...d.achievements, val] }));
    setHighlightInputs((h) => ({ ...h, achievements: "" }));
  };

  const removeAchievement = (idx: number) => {
    setData((d) => ({
      ...d,
      achievements: d.achievements.filter((_, i) => i !== idx),
    }));
  };

  const addAdditionalBullet = () => {
    const val = highlightInputs["additionalInfo"]?.trim();
    if (!val) return;
    setData((d) => ({
      ...d,
      additionalInfo: {
        ...d.additionalInfo,
        bullets: [...d.additionalInfo.bullets, val],
      },
    }));
    setHighlightInputs((h) => ({ ...h, additionalInfo: "" }));
  };

  const removeAdditionalBullet = (idx: number) => {
    setData((d) => ({
      ...d,
      additionalInfo: {
        ...d.additionalInfo,
        bullets: d.additionalInfo.bullets.filter((_, i) => i !== idx),
      },
    }));
  };

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

  const handleNext = () => {
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (currentStep !== STEPS.length - 1) return;
    await save();
  };

  const stepValid = (): boolean => {
    switch (currentStep) {
      case 0:
        return (
          data.personalInfo.fullName.trim().length > 0 &&
          data.personalInfo.email.trim().length > 0 &&
          data.personalInfo.phone.trim().length > 0 &&
          data.personalInfo.location.trim().length > 0
        );
      case 1:
      case 4:
      case 6:
      case 7:
        return true;
      case 2:
        return data.education.some((e) => e.institution.trim() && e.degree.trim());
      case 3:
        return data.workExperience.some((w) => w.company.trim() && w.designation.trim());
      case 5:
        return data.projects.some((p) => p.name.trim());
      default:
        return true;
    }
  };

  const inputClass =
    "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  if (loading) {
    return (
      <DashboardLayout active="Make CV">
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-500 text-sm">Loading CV...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout active="Make CV">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Make CV</h1>
          <p className="text-slate-500 mt-1">
            Build an ATS-friendly CV step by step
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 ml-4">
              Dismiss
            </button>
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center justify-between">
            <span>{success}</span>
            <button
              onClick={() => setSuccess(null)}
              className="text-green-500 ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex gap-8">
          <nav className="w-56 flex-shrink-0">
            <div className="bg-white border border-slate-200 rounded-xl p-4 sticky top-8">
              <div className="space-y-1">
                {STEPS.map((step, idx) => (
                  <button
                    key={step}
                    onClick={() => setCurrentStep(idx)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                      idx === currentStep
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : idx < currentStep
                        ? "text-slate-600 hover:bg-slate-50"
                        : "text-slate-400"
                    }`}
                  >
                    <span className="mr-2">
                      {idx < currentStep ? "✓" : `${idx + 1}.`}
                    </span>
                    {step}
                  </button>
                ))}
              </div>
            </div>
          </nav>

          <div className="flex-1 min-w-0">
            <form onSubmit={handleSubmit}>
              {currentStep === 0 && (
                <section className="bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 mb-4">
                    Personal Information
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        CV Title
                      </label>
                      <input
                        type="text"
                        value={data.title}
                        onChange={(e) =>
                          setData((d) => ({ ...d, title: e.target.value }))
                        }
                        placeholder="e.g. Senior Developer CV"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={data.personalInfo.fullName}
                        onChange={(e) =>
                          handlePersonalInfo("fullName", e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Email *
                      </label>
                      <input
                        type="email"
                        value={data.personalInfo.email}
                        onChange={(e) =>
                          handlePersonalInfo("email", e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Phone *
                      </label>
                      <input
                        type="tel"
                        value={data.personalInfo.phone}
                        onChange={(e) =>
                          handlePersonalInfo("phone", e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Location *
                      </label>
                      <input
                        type="text"
                        value={data.personalInfo.location}
                        onChange={(e) =>
                          handlePersonalInfo("location", e.target.value)
                        }
                        placeholder="e.g. London, UK"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        LinkedIn
                      </label>
                      <input
                        type="url"
                        value={data.personalInfo.linkedIn}
                        onChange={(e) =>
                          handlePersonalInfo("linkedIn", e.target.value)
                        }
                        placeholder="https://linkedin.com/in/..."
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Website
                      </label>
                      <input
                        type="url"
                        value={data.personalInfo.website}
                        onChange={(e) =>
                          handlePersonalInfo("website", e.target.value)
                        }
                        placeholder="https://..."
                        className={inputClass}
                      />
                    </div>
                  </div>
                </section>
              )}

              {currentStep === 1 && (
                <section className="bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 mb-4">
                    Professional Summary
                  </h2>
                  <p className="text-xs text-slate-500 mb-3">
                    A 2-4 sentence overview of your experience and career goals.
                    Keep it concise and keyword-rich for ATS.
                  </p>
                  <textarea
                    rows={6}
                    value={data.professionalSummary}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        professionalSummary: e.target.value,
                      }))
                    }
                    placeholder="e.g. Software engineer with 5+ years of experience building scalable web applications..."
                    className={`${inputClass} resize-none`}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    {data.professionalSummary.length}/2000 characters
                  </p>
                </section>
              )}

              {currentStep === 3 && (
                <section className="bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 mb-4">
                    Work Experience
                  </h2>
                  <div className="space-y-6">
                    {data.workExperience.map((work, idx) => (
                      <div
                        key={idx}
                        className="border border-slate-100 rounded-lg p-4 relative"
                      >
                        {data.workExperience.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setData((d) => ({
                                ...d,
                                workExperience: d.workExperience.filter(
                                  (_, i) => i !== idx
                                ),
                              }))
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
                                  handleWorkChange(
                                    idx,
                                    "startDate",
                                    e.target.value
                                  )
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
                                  handleWorkChange(
                                    idx,
                                    "endDate",
                                    e.target.value
                                  )
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
                                  handleWorkChange(
                                    idx,
                                    "current",
                                    e.target.checked
                                  )
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
                              handleWorkChange(
                                idx,
                                "description",
                                e.target.value
                              )
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
                      setData((d) => ({
                        ...d,
                        workExperience: [
                          ...d.workExperience,
                          { ...emptyWork },
                        ],
                      }))
                    }
                    className="mt-4 text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add another work experience
                  </button>
                </section>
              )}

              {currentStep === 2 && (
                <section className="bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 mb-4">
                    Education
                  </h2>
                  <div className="space-y-6">
                    {data.education.map((edu, idx) => (
                      <div
                        key={idx}
                        className="border border-slate-100 rounded-lg p-4 relative"
                      >
                        {data.education.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setData((d) => ({
                                ...d,
                                education: d.education.filter(
                                  (_, i) => i !== idx
                                ),
                              }))
                            }
                            className="absolute top-3 right-3 text-xs text-red-400 hover:text-red-600"
                          >
                            Remove
                          </button>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Institution *
                            </label>
                            <input
                              type="text"
                              value={edu.institution}
                              onChange={(e) =>
                                handleEduChange(idx, "institution", e.target.value)
                              }
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Degree Type
                            </label>
                            <select
                              value={edu.degreeType}
                              onChange={(e) =>
                                handleEduDegreeTypeChange(idx, e.target.value)
                              }
                              className={inputClass}
                            >
                              <option value="">Select degree type</option>
                              <option value="SSC">SSC</option>
                              <option value="HSC">HSC</option>
                              <option value="Diploma">Diploma</option>
                              <option value="Bachelor's">Bachelor's</option>
                              <option value="Master's">Master's</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Degree *
                            </label>
                            <input
                              type="text"
                              value={edu.degree}
                              onChange={(e) =>
                                handleEduChange(idx, "degree", e.target.value)
                              }
                              placeholder="e.g. BSc, MSc"
                              className={inputClass}
                            />
                          </div>
                          {SCHOOL_DEGREE_TYPES.includes(edu.degreeType) && (
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                Group
                              </label>
                              <select
                                value={edu.field}
                                onChange={(e) =>
                                  handleEduChange(idx, "field", e.target.value)
                                }
                                className={inputClass}
                              >
                                <option value="">Select group</option>
                                {EDUCATION_GROUPS.map((g) => (
                                  <option key={g} value={g}>
                                    {g}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {MAJOR_DEGREE_TYPES.includes(edu.degreeType) && (
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                Major
                              </label>
                              <input
                                type="text"
                                value={edu.field}
                                onChange={(e) =>
                                  handleEduChange(idx, "field", e.target.value)
                                }
                                placeholder="e.g. Computer Science"
                                className={inputClass}
                              />
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                Start
                              </label>
                              <input
                                type="text"
                                value={edu.startDate}
                                onChange={(e) =>
                                  handleEduChange(idx, "startDate", e.target.value)
                                }
                                placeholder="e.g. Sep 2016"
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
                                  handleEduChange(idx, "endDate", e.target.value)
                                }
                                placeholder="e.g. Jun 2020"
                                className={inputClass}
                              />
                            </div>
                          </div>
                          {SCHOOL_DEGREE_TYPES.includes(edu.degreeType) && (
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                GPA Value
                              </label>
                              <input
                                type="text"
                                value={edu.gradeValue}
                                onChange={(e) =>
                                  handleEduChange(idx, "gradeValue", e.target.value)
                                }
                                placeholder="e.g. 4.50/5.00"
                                maxLength={7}
                                className={inputClass}
                              />
                            </div>
                          )}
                          {MAJOR_DEGREE_TYPES.includes(edu.degreeType) && (
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                CGPA Value
                              </label>
                              <input
                                type="text"
                                value={edu.gradeValue}
                                onChange={(e) =>
                                  handleEduChange(idx, "gradeValue", e.target.value)
                                }
                                placeholder="e.g. 3.75/4.00"
                                maxLength={7}
                                className={inputClass}
                              />
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Highlights
                          </label>
                          {renderHighlightInput(
                            `edu-${idx}`,
                            () => addEduHighlight(idx),
                            edu.highlights,
                            (hlIdx) => removeEduHighlight(idx, hlIdx)
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        education: [...d.education, { ...emptyEducation }],
                      }))
                    }
                    className="mt-4 text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add another education
                  </button>
                </section>
              )}

              {currentStep === 4 && (
                <section className="bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 mb-4">
                    Skills
                  </h2>
                  <p className="text-xs text-slate-500 mb-3">
                    Add your skills as bullet points. These will be
                    searchable by ATS systems.
                  </p>
                  {renderHighlightInput("skills", addSkill, data.skills, removeSkill)}
                </section>
              )}

              {currentStep === 5 && (
                <section className="bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 mb-4">
                    Projects
                  </h2>
                  <div className="space-y-6">
                    {data.projects.map((proj, idx) => (
                      <div
                        key={idx}
                        className="border border-slate-100 rounded-lg p-4 relative"
                      >
                        {data.projects.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setData((d) => ({
                                ...d,
                                projects: d.projects.filter(
                                  (_, i) => i !== idx
                                ),
                              }))
                            }
                            className="absolute top-3 right-3 text-xs text-red-400 hover:text-red-600"
                          >
                            Remove
                          </button>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Project Name *
                            </label>
                            <input
                              type="text"
                              value={proj.name}
                              onChange={(e) =>
                                handleProjectChange(idx, "name", e.target.value)
                              }
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              GitHub Repository Link
                            </label>
                            <input
                              type="url"
                              value={proj.githubLink}
                              onChange={(e) =>
                                handleProjectChange(idx, "githubLink", e.target.value)
                              }
                              placeholder="https://github.com/..."
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Live Link
                            </label>
                            <input
                              type="url"
                              value={proj.liveLink}
                              onChange={(e) =>
                                handleProjectChange(idx, "liveLink", e.target.value)
                              }
                              placeholder="https://..."
                              className={inputClass}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Description
                            </label>
                            <textarea
                              rows={2}
                              value={proj.description}
                              onChange={(e) =>
                                handleProjectChange(
                                  idx,
                                  "description",
                                  e.target.value
                                )
                              }
                              className={`${inputClass} resize-none`}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Highlights
                          </label>
                          {renderHighlightInput(
                            `proj-${idx}`,
                            () => addProjectHighlight(idx),
                            proj.highlights,
                            (hlIdx) => removeProjectHighlight(idx, hlIdx)
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        projects: [...d.projects, { ...emptyProject }],
                      }))
                    }
                    className="mt-4 text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add another project
                  </button>
                </section>
              )}

              {currentStep === 6 && (
                <section className="bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 mb-4">
                    Achievements
                  </h2>
                  <p className="text-xs text-slate-500 mb-3">
                    Notable accomplishments, awards, or recognitions.
                  </p>
                  {renderHighlightInput(
                    "achievements",
                    addAchievement,
                    data.achievements,
                    removeAchievement
                  )}
                </section>
              )}

              {currentStep === 7 && (
                <section className="bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 mb-4">
                    Additional Information
                  </h2>
                  <p className="text-xs text-slate-500 mb-3">
                    Anything else you'd like to share with employers.
                  </p>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-medium text-slate-700 mb-2">
                        Bullet Points
                      </h3>
                      {renderHighlightInput(
                        "additionalInfo",
                        addAdditionalBullet,
                        data.additionalInfo.bullets,
                        removeAdditionalBullet
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
                      <h3 className="text-sm font-medium text-slate-700 mb-2">
                        Description
                      </h3>
                      <textarea
                        rows={4}
                        value={data.additionalInfo.description}
                        onChange={(e) =>
                          setData((d) => ({
                            ...d,
                            additionalInfo: {
                              ...d.additionalInfo,
                              description: e.target.value,
                            },
                          }))
                        }
                        placeholder="Enter additional information as a paragraph..."
                        className={`${inputClass} resize-none`}
                      />
                    </div>
                  </div>
                </section>
              )}

              {currentStep === 8 && (
                <section className="bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 mb-4">
                    Review & Download
                  </h2>

                  <div className="space-y-6">
                    <div className="border border-slate-100 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-slate-900 mb-2">
                        Personal Info
                      </h3>
                      <p className="text-sm text-slate-600">
                        <strong>{data.personalInfo.fullName || "—"}</strong> |{" "}
                        {data.personalInfo.email || "—"} |{" "}
                        {data.personalInfo.phone || "—"} |{" "}
                        {data.personalInfo.location || "—"}
                      </p>
                      {(data.personalInfo.linkedIn || data.personalInfo.website) && (
                        <p className="text-xs text-slate-400 mt-1">
                          {data.personalInfo.linkedIn && (
                            <span className="mr-3">{data.personalInfo.linkedIn}</span>
                          )}
                          {data.personalInfo.website}
                        </p>
                      )}
                    </div>

                    {data.professionalSummary && (
                      <div className="border border-slate-100 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-slate-900 mb-2">
                          Summary
                        </h3>
                        <p className="text-sm text-slate-600 whitespace-pre-line">
                          {data.professionalSummary}
                        </p>
                      </div>
                    )}

                    {data.workExperience.some((w) => w.company) && (
                      <div className="border border-slate-100 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-slate-900 mb-2">
                          Work Experience ({data.workExperience.length})
                        </h3>
                        {data.workExperience
                          .filter((w) => w.company)
                          .map((w, i) => (
                            <div key={i} className="mb-2 last:mb-0">
                              <p className="text-sm text-slate-800 font-medium">
                                {w.designation} at {w.company}
                                {w.location ? `, ${w.location}` : ""}
                              </p>
                              <p className="text-xs text-slate-400">
                                {w.startDate} –{" "}
                                {w.current ? "Present" : w.endDate || "—"}
                              </p>
                              {w.description && (
                                <p className="mt-1 text-xs text-slate-600 whitespace-pre-line">
                                  {w.description}
                                </p>
                              )}
                              {w.highlights.length > 0 && (
                                <ul className="mt-1 text-xs text-slate-600">
                                  {w.highlights.map((h, hi) => (
                                    <li key={hi}>• {h}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                      </div>
                    )}

                    {data.education.some((e) => e.institution) && (
                      <div className="border border-slate-100 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-slate-900 mb-2">
                          Education ({data.education.length})
                        </h3>
                        {data.education
                          .filter((e) => e.institution)
                          .map((e, i) => (
                            <div key={i} className="mb-2 last:mb-0">
                              <p className="text-sm text-slate-800 font-medium">
                                {[
                                  e.degreeType,
                                  [e.degree, e.field].filter(Boolean).join(" in "),
                                ]
                                  .filter(Boolean)
                                  .join(" — ")}
                              </p>
                              <p className="text-xs text-slate-500">
                                {e.institution}
                                {e.gradeValue
                                  ? ` — ${
                                      SCHOOL_DEGREE_TYPES.includes(e.degreeType)
                                        ? "GPA"
                                        : "CGPA"
                                    }: ${e.gradeValue}`
                                  : ""}
                              </p>
                              <p className="text-xs text-slate-400">
                                {e.startDate} – {e.endDate || "Present"}
                              </p>
                            </div>
                          ))}
                      </div>
                    )}

                    {data.skills.length > 0 && (
                      <div className="border border-slate-100 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-slate-900 mb-2">
                          Skills ({data.skills.length})
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {data.skills.map((s, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {data.projects.some((p) => p.name) && (
                      <div className="border border-slate-100 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-slate-900 mb-2">
                          Projects ({data.projects.length})
                        </h3>
                        {data.projects
                          .filter((p) => p.name)
                          .map((p, i) => (
                            <div key={i} className="mb-2 last:mb-0">
                              <p className="text-sm text-slate-800 font-medium">
                                {p.name}
                              </p>
                              {p.description && (
                                <p className="text-xs text-slate-600">
                                  {p.description}
                                </p>
                              )}
                              {(p.githubLink || p.liveLink) && (
                                <p className="text-xs text-blue-600 mt-0.5">
                                  {p.githubLink && <span className="mr-3">{p.githubLink}</span>}
                                  {p.liveLink}
                                </p>
                              )}
                            </div>
                          ))}
                      </div>
                    )}

                    {data.achievements.length > 0 && (
                      <div className="border border-slate-100 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-slate-900 mb-2">
                          Achievements
                        </h3>
                        <ul className="text-sm text-slate-600">
                          {data.achievements.map((a, i) => (
                            <li key={i}>• {a}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(data.additionalInfo.bullets.length > 0 ||
                      data.additionalInfo.description.trim()) && (
                      <div className="border border-slate-100 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-slate-900 mb-2">
                          Additional Information
                        </h3>
                        {data.additionalInfo.bullets.length > 0 && (
                          <ul className="text-sm text-slate-600">
                            {data.additionalInfo.bullets.map((b, i) => (
                              <li key={i}>• {b}</li>
                            ))}
                          </ul>
                        )}
                        {data.additionalInfo.description.trim() && (
                          <p className="text-sm text-slate-600 whitespace-pre-line mt-2">
                            {data.additionalInfo.description}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={saving}
                        className="px-5 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={downloadPdf}
                        disabled={!saved}
                        className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        Download PDF
                      </button>
                      {!saved && (
                        <p className="text-xs text-slate-400 self-center">
                          Save your CV first to download
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              )}

              <div className="flex justify-between mt-6">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={currentStep === 0}
                  className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40"
                >
                  Back
                </button>
                <div className="flex gap-3">
                  {currentStep < STEPS.length - 1 && (
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={!stepValid()}
                      className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      Next
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default MakeCV;
