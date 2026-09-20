import { Link } from "react-router-dom";

const FEATURES = [
  {
    title: "ATS-Friendly CV Making",
    description:
      "Build optimized, ATS-compliant resumes tailored to each job with AI-powered formatting.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-6 h-6"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 15l3 3 6-6" />
      </svg>
    ),
    tint: "from-brand-500 to-violet-500",
  },
  {
    title: "GitHub Analysis",
    description:
      "Auto-detect new projects and generate professional LinkedIn posts with AI.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-6 h-6"
      >
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
      </svg>
    ),
    tint: "from-slate-700 to-slate-900",
  },
  {
    title: "Job Matching",
    description:
      "AI-powered job matching with explainable scores based on your profile.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-6 h-6"
      >
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    tint: "from-cyan-500 to-sky-500",
  },
  {
    title: "Email Tracking",
    description:
      "Classify career emails — interviews, shortlists, rejections — automatically.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-6 h-6"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-10 6L2 7" />
      </svg>
    ),
    tint: "from-emerald-500 to-teal-500",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect your world",
    description:
      "Add your GitHub, Gmail and LinkedIn — the agent reads your professional signals.",
  },
  {
    n: "02",
    title: "Build your profile",
    description:
      "CV, skills, experience and education become a living career intelligence profile.",
  },
  {
    n: "03",
    title: "Let AI do the heavy lifting",
    description:
      "Job discovery, match scores, content drafts and follow-ups — generated for you.",
  },
  {
    n: "04",
    title: "Stay in control",
    description:
      "Review AI actions with human oversight and keep every decision yours.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center font-bold text-sm shadow-glow-primary">
            AC
          </div>
          <span className="text-lg font-bold tracking-tight">
            AI Career Agent
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="btn-ghost !text-slate-200 hover:!bg-white/10 hover:!text-white hidden sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            to="/dashboard"
            className="btn-primary btn-sm px-4 sm:px-5 sm:py-2.5"
          >
            Open Dashboard
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative">
        <div className="absolute inset-0 hero-mesh" aria-hidden />
        <div className="relative max-w-7xl mx-auto px-6 sm:px-10 pt-16 sm:pt-24 pb-24 text-center">
          <p className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-white/10 border border-white/15 mb-8 animate-fade-in-up">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            AI-Powered Career Automation
          </p>
          <h1 className="text-4xl sm:text-6xl font-extrabold leading-[1.08] tracking-tight mb-6 animate-fade-in-up">
            Your Personal
            <br />
            <span className="text-gradient">Career Agent</span>
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up">
            Automate your career workflow with AI. Analyze GitHub projects,
            generate LinkedIn posts, discover jobs, and track applications —
            all with human oversight.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up">
            <Link to="/dashboard" className="btn-primary btn-lg !px-8 w-full sm:w-auto">
              Get Started Free
            </Link>
            <a
              href="#features"
              className="btn-outline btn-lg !bg-transparent !text-slate-200 !border-white/20 hover:!bg-white/10 hover:!text-white w-full sm:w-auto"
            >
              Learn More
            </a>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              ["14+", "Integrated tools"],
              ["4", "AI workflows"],
              ["24/7", "Automated tracking"],
              ["0", "Manual entry needed"],
            ].map(([stat, label]) => (
              <div
                key={label}
                className="px-4 py-5 rounded-2xl bg-white/5 border border-white/10"
              >
                <p className="text-2xl sm:text-3xl font-bold text-gradient">{stat}</p>
                <p className="text-xs text-slate-400 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <div id="features" className="max-w-7xl mx-auto px-6 sm:px-10 py-20 sm:py-28">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-brand-300 uppercase tracking-widest mb-3">
            Everything you need
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            A complete career command center
          </h2>
          <p className="text-slate-400 mt-4 max-w-2xl mx-auto">
            From your first saved job to a signed offer — the agent keeps every
            stage organized and moving forward.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-200"
            >
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.tint} flex items-center justify-center mb-4 shadow-card transition-transform group-hover:scale-105`}
              >
                {f.icon}
              </div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-y border-white/10">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 py-20 sm:py-28">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-violet-300 uppercase tracking-widest mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              From scattered signals to a smooth workflow
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s) => (
              <div key={s.n} className="relative p-6 rounded-2xl bg-white/[0.04] border border-white/10">
                <p className="text-4xl font-extrabold text-white/10 mb-4">{s.n}</p>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {s.description}
                </p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-20 rounded-3xl bg-gradient-to-br from-brand-600 to-violet-700 p-10 sm:p-14 text-center shadow-pop relative overflow-hidden">
            <div className="absolute inset-0 hero-mesh opacity-40" aria-hidden />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
                Ready to put your career on autopilot?
              </h2>
              <p className="text-brand-100 mb-8 max-w-xl mx-auto">
                Join the professionals who keep every pipeline moving with
                intelligent automation.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link
                  to="/register"
                  className="btn bg-white text-brand-700 btn-lg !px-8 hover:bg-brand-50 shadow-card hover:shadow-card-hover"
                >
                  Create your account
                </Link>
                <Link
                  to="/dashboard"
                  className="btn btn-lg !px-8 bg-white/10 hover:bg-white/20 text-white border border-white/30"
                >
                  Explore the dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 sm:px-10 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
        <p className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center text-[10px] font-bold text-white">
            AC
          </span>
          © {new Date().getFullYear()} AI Career Agent
        </p>
        <div className="flex items-center gap-6">
          <Link to="/login" className="hover:text-slate-300">
            Sign in
          </Link>
          <Link to="/register" className="hover:text-slate-300">
            Register
          </Link>
          <Link to="/privacy-policy" className="hover:text-slate-300">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
}

export default Landing;