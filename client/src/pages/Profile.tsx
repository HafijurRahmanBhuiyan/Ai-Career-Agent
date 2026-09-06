import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import axios from "axios";
import api from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import { getErrorMessage } from "../utils/apiError";

interface WorkExperience {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  currentlyWorking: boolean;
  description: string;
}

interface Education {
  level: "hsc" | "bachelor" | "master";
  institution: string;
  degree: string;
  fieldOfStudy: string;
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
  workExperience: WorkExperience[];
  education: Education[];
}

const EDUCATION_LABELS: Record<Education["level"], string> = {
  hsc: "HSC",
  bachelor: "Bachelor's Degree",
  master: "Master's Degree",
};

const emptyEducation = (level: Education["level"]): Education => ({
  level,
  institution: "",
  degree: "",
  fieldOfStudy: "",
  startDate: "",
  endDate: "",
  certificateFileName: null,
  certificateFileId: null,
});

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
  const [skills, setSkills] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [salaryCurrency, setSalaryCurrency] = useState("BDT");
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [workExperience, setWorkExperience] = useState<WorkExperience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);

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
        setSkills(p.skills?.join(", ") || "");
        setSalaryMin(p.salaryMin || "");
        setSalaryMax(p.salaryMax || "");
        setSalaryCurrency(p.salaryCurrency || "BDT");
        setCvFileName(p.cvFileName || null);
        setWorkExperience(p.workExperience || []);
        setEducation(p.education || []);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setEducation([
            emptyEducation("hsc"),
            emptyEducation("bachelor"),
            emptyEducation("master"),
          ]);
        } else {
          setError(getErrorMessage(err, "Failed to load profile"));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateExperience = (
    index: number,
    field: keyof WorkExperience,
    value: string | boolean
  ) => {
    setWorkExperience((prev) =>
      prev.map((exp, i) => (i === index ? { ...exp, [field]: value } : exp))
    );
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

    const skillsArr = skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (skillsArr.length) payload.skills = skillsArr;

    try {
      try {
        await api.patch("/profile", payload);
      } catch (patchErr) {
        if (axios.isAxiosError(patchErr) && patchErr.response?.status === 404) {
          await api.post("/profile", {
            ...payload,
            skills: skillsArr,
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
      const res = await api.post<{ fileName: string }>(
        "/profile/documents/cv",
        form
      );
      setCvFileName(res.data.fileName);
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
      const res = await api.post<{ fileName: string; profile: { education: Education[] } }>(
        `/profile/documents/certificate/${index}`,
        form
      );
      setCvFileName(res.data.fileName);
      const updated = res.data.profile.education;
      const updatedEntry = updated && updated[index];
      if (updatedEntry) {
        setEducation((prev) =>
          prev.map((edu, i) =>
            i === index
              ? {
                  ...edu,
                  certificateFileName: updatedEntry.certificateFileName,
                  certificateFileId: updatedEntry.certificateFileId,
                }
              : edu
          )
        );
      }
      setSuccess("Certificate uploaded.");
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
    } catch (err) {
      setError(getErrorMessage(err, "Could not remove certificate"));
    }
  };

  const inputClass =
    "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

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
              <input
                type="text"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="e.g. JavaScript, React, Node.js, MongoDB"
                className={inputClass}
              />
              <p className="text-xs text-slate-400 mt-1">Comma-separated</p>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                CV
              </h2>
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
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                Work Experience
              </h2>
              {workExperience.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No work experience added yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {workExperience.map((exp, i) => (
                    <div
                      key={i}
                      className="border border-slate-200 rounded-lg p-4 space-y-3"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Company
                          </label>
                          <input
                            type="text"
                            value={exp.company}
                            onChange={(e) =>
                              updateExperience(i, "company", e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Job Title
                          </label>
                          <input
                            type="text"
                            value={exp.title}
                            onChange={(e) =>
                              updateExperience(i, "title", e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Start Date
                          </label>
                          <input
                            type="date"
                            value={exp.startDate}
                            onChange={(e) =>
                              updateExperience(i, "startDate", e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            End Date
                          </label>
                          <input
                            type="date"
                            value={exp.endDate}
                            disabled={exp.currentlyWorking}
                            onChange={(e) =>
                              updateExperience(i, "endDate", e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={exp.currentlyWorking}
                          onChange={(e) =>
                            updateExperience(
                              i,
                              "currentlyWorking",
                              e.target.checked
                            )
                          }
                          className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                        />
                        I currently work here
                      </label>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Description
                        </label>
                        <textarea
                          value={exp.description}
                          onChange={(e) =>
                            updateExperience(i, "description", e.target.value)
                          }
                          rows={2}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                Education
              </h2>
              <div className="space-y-6">
                {education.map((edu, i) => (
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
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Field of Study
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
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Start Date
                          </label>
                          <input
                            type="date"
                            value={edu.startDate}
                            onChange={(e) =>
                              updateEducation(i, "startDate", e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            End Date
                          </label>
                          <input
                            type="date"
                            value={edu.endDate}
                            onChange={(e) =>
                              updateEducation(i, "endDate", e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Certificate
                      </label>
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
                    </div>
                  </div>
                ))}
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
