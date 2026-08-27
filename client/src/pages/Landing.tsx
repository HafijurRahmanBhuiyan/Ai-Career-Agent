import { Link } from "react-router-dom";

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-sm">
            AC
          </div>
          <span className="text-xl font-bold">AI Career Agent</span>
        </div>
        <Link
          to="/dashboard"
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          Open Dashboard
        </Link>
      </nav>

      <main className="max-w-4xl mx-auto px-8 pt-24 pb-32 text-center">
        <div className="inline-block px-4 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm font-medium mb-8">
          AI-Powered Career Automation
        </div>
        <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
          Your Personal
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Career Agent
          </span>
        </h1>
        <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-12 leading-relaxed">
          Automate your career workflow with AI. Analyze GitHub projects,
          generate LinkedIn posts, discover jobs, and track applications — all
          with human oversight.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            to="/dashboard"
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            Get Started
          </Link>
          <a
            href="#features"
            className="px-8 py-3 border border-slate-600 hover:border-slate-500 rounded-lg font-medium transition-colors"
          >
            Learn More
          </a>
        </div>

        <div id="features" className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <FeatureCard
            title="GitHub Analysis"
            description="Auto-detect new projects and generate professional LinkedIn posts with AI."
          />
          <FeatureCard
            title="Job Matching"
            description="AI-powered job matching with explainable scores based on your profile."
          />
          <FeatureCard
            title="Email Tracking"
            description="Classify career emails — interviews, shortlists, rejections — automatically."
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors">
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

export default Landing;
