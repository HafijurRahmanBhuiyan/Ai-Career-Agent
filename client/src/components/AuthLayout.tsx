import { ReactNode } from "react";

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-sm">
            AC
          </div>
          <span className="text-xl font-bold text-white">AI Career Agent</span>
        </div>
        <div className="bg-white rounded-xl shadow-xl p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">{title}</h1>
          <p className="text-slate-500 text-sm mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
