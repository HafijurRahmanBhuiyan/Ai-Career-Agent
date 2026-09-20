import { Link } from "react-router-dom";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Information We Collect",
    body: "AI Career Agent may collect account information, GitHub repository information, career-related information, and information required to connect supported third-party services.",
  },
  {
    title: "GitHub Data",
    body: "When you connect GitHub, AI Career Agent may access repositories and related repository information that you authorize. This information is used to provide repository analysis and career-related features.",
  },
  {
    title: "LinkedIn Data",
    body: "When you connect LinkedIn, AI Career Agent uses the permissions you authorize to support LinkedIn-related features, including creating and publishing posts on your behalf when you explicitly request it.",
  },
  {
    title: "AI Providers",
    body: "Repository and career-related information may be sent to configured AI providers to generate analysis and recommendations.",
  },
  {
    title: "How We Use Information",
    body: "Information is used to provide repository analysis, career assistance, professional-content generation, and other features requested by you.",
  },
  {
    title: "Data Security",
    body: "We take reasonable measures to protect your information and credentials from unauthorized access.",
  },
  {
    title: "Third-Party Services",
    body: "AI Career Agent may integrate with services such as GitHub, LinkedIn, Google, Anthropic, and OpenAI. Their respective privacy policies and terms may also apply.",
  },
  {
    title: "Data Retention",
    body: "We retain information as necessary to provide the application's features, maintain your account, and comply with applicable obligations.",
  },
  {
    title: "Your Choices",
    body: "You may disconnect supported third-party accounts and stop using the application at any time.",
  },
  {
    title: "Contact",
    body: "If you have questions about this Privacy Policy, please contact the administrator of AI Career Agent.",
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-app-mesh">
      <nav className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-violet-600 flex items-center justify-center text-white font-bold text-xs shadow-glow-primary">
              AC
            </span>
            <span className="font-bold text-slate-900">AI Career Agent</span>
          </Link>
          <Link to="/" className="btn-outline btn-sm">
            ← Back to site
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12 sm:py-16">
        <div className="card p-8 sm:p-10 shadow-pop">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 mb-3">
            Legal
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-6">
            Privacy Policy
          </h1>

          <p className="text-slate-600 mb-8 leading-relaxed">
            <strong className="text-slate-900">AI Career Agent</strong>{" "}
            respects your privacy. This Privacy Policy explains how information
            is collected, used, and protected when you use our application.
          </p>

          <div className="space-y-8">
            {SECTIONS.map((s) => (
              <section key={s.title}>
                <h2 className="text-lg font-semibold text-slate-900 mb-2">
                  {s.title}
                </h2>
                <p className="text-slate-600 leading-relaxed">{s.body}</p>
              </section>
            ))}
          </div>

          <p className="mt-10 pt-6 border-t border-slate-200 text-sm text-slate-400">
            <strong className="text-slate-600">Last updated:</strong>{" "}
            August 29, 2026
          </p>
        </div>
      </main>
    </div>
  );
}