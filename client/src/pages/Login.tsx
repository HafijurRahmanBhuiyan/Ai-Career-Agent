import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/apiError";

interface FieldErrors {
  email?: string;
  password?: string;
}

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from || "/dashboard";

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!email.trim()) {
      errors.email = "Email is required";
    } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      errors.email = "Invalid email address";
    }
    if (!password) {
      errors.password = "Password is required";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      await login({ email: email.trim(), password });
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setApiError(getErrorMessage(err, "Invalid email or password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Access your career dashboard">
      {apiError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              fieldErrors.email ? "border-red-300" : "border-slate-200"
            }`}
          />
          {fieldErrors.email && (
            <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              fieldErrors.password ? "border-red-300" : "border-slate-200"
            }`}
          />
          {fieldErrors.password && (
            <p className="text-xs text-red-600 mt-1">{fieldErrors.password}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="text-sm text-slate-500 mt-6 text-center">
        Don&apos;t have an account?{" "}
        <Link to="/register" className="text-blue-600 hover:text-blue-700">
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}

export default Login;
