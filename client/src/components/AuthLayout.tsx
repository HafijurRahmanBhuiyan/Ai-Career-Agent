import { ReactNode } from "react";
import { Link } from "react-router-dom";

const FEATURES = [
  {
    title: "AI-powered job matching",
    description: "Explainable match scores aligned to your real profile.",
  },
  {
    title: "Automatic Gmail insights",
    description: "Interviews, offers and outcomes detected — no data entry.",
  },
  {
    title: "Content that works for you",
    description: "LinkedIn posts, CVs and follow-ups generated in seconds.",
  },
];

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-950 via-slate-900 to-violet-950 p-12 text-white hero-mesh">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-violet-500 flex items-center justify-center font-bold text-base shadow-glow-primary">
            AC
          </div>
          <span className="text-lg font-bold">AI Career Agent</span>
        </div>

        <div>
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-white/10 border border-white/15 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Your personal career copilot
          </p>
          <h2 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight mb-6">
            Take control of your
            <span className="text-gradient"> career journey.</span>
          </h2>
          <p className="text-slate-300 text-lg max-w-md leading-relaxed">
            One intelligent workspace for CVs, job discovery, applications,
            emails and follow-ups — built for professionals.
          </p>

          <ul className="mt-10 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <div className="mt-0.5 w-6 h-6 rounded-full bg-emerald-400/20 flex items-center justify-center shrink-0">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5 text-emerald-400"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-sm text-slate-400">{f.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} AI Career Agent ·{" "}
          <Link to="/privacy-policy" className="hover:text-slate-300">
            Privacy Policy
          </Link>
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center p-6 sm:p-10 bg-slate-50">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 flex items-center justify-center font-bold text-base text-white shadow-glow-primary">
              AC
            </div>
            <span className="text-lg font-bold text-slate-900">
              AI Career Agent
            </span>
          </div>

          <div className="card p-8 shadow-pop">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {title}
            </h1>
            <p className="text-sm text-slate-500 mt-1.5 mb-6">{subtitle}</p>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}