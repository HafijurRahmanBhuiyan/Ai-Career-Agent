import { AIProgressState } from "../hooks/useAIProgress";

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude",
  gemini: "Gemini",
  openai: "OpenAI",
  groq: "Groq",
  openrouter: "OpenRouter",
  cerebras: "Cerebras",
  mistral: "Mistral",
};

const PROVIDER_COLORS: Record<string, string> = {
  claude: "text-orange-700 border-orange-200 bg-orange-50",
  gemini: "text-blue-700 border-blue-200 bg-blue-50",
  openai: "text-emerald-700 border-emerald-200 bg-emerald-50",
  groq: "text-red-700 border-red-200 bg-red-50",
  openrouter: "text-slate-700 border-slate-200 bg-slate-50",
  cerebras: "text-violet-700 border-violet-200 bg-violet-50",
  mistral: "text-teal-700 border-teal-200 bg-teal-50",
};

const DEFAULT_COLOR =
  "text-slate-700 border-slate-200 bg-slate-50";

function buildLabel(provider: string | "", model: string) {
  const label = PROVIDER_LABELS[provider] || provider;
  return label ? (
    <>
      {label}
      <span className="ml-1 font-semibold">{model}</span>
    </>
  ) : (
    <span className="font-semibold">{model}</span>
  );
}

/**
 * Provider + model badge.
 *
 * `live` (default): shown while an AI result is being generated. Displays the
 * exact provider + model the backend is currently trying (updated in real time
 * as the fallback chain advances), with a neutral "Contacting AI…" state until
 * the first attempt event arrives.
 *
 * `final`: shown after generation completes. Displays the provider + model that
 * actually produced the result, statically (no pulse) so it stays readable and
 * remains visible while the result is on screen.
 */
export default function AIProviderIndicator({
  state,
  mode = "live",
  idleLabel = "Contacting AI provider...",
  classes = "",
}: {
  state: AIProgressState | null;
  mode?: "live" | "final";
  idleLabel?: string;
  classes?: string;
}) {
  const colorClass = state
    ? (PROVIDER_COLORS[state.provider] || DEFAULT_COLOR)
    : "text-brand-700 border-brand-200 bg-brand-50/70";

  if (mode === "final" && state) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${colorClass} ${classes}`}
        title="AI model used to generate this result"
      >
        <svg
          className="h-3 w-3 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className="truncate">
          <span className="mr-1 text-current opacity-70">Generated with</span>
          {buildLabel(state.provider, state.model)}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${colorClass} ${classes}`}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
      </span>
      {state ? (
        <span className="truncate">{buildLabel(state.provider, state.model)}</span>
      ) : (
        idleLabel
      )}
    </span>
  );
}