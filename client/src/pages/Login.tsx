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
  const { login, isAuthenticated } = useAuth();
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
    <AuthLayout title="Welcome back" subtitle="Access your career dashboard">
      {apiError && <div className="alert-error mb-4">{apiError}</div>}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label className="field-label">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={`input ${fieldErrors.email ? "!border-red-400 focus:!border-red-400 focus:!ring-red-500/20" : ""}`}
          />
          {fieldErrors.email && (
            <p className="text-xs text-red-600 mt-1.5">{fieldErrors.email}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="field-label !mb-0">Password</label>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={`input ${fieldErrors.password ? "!border-red-400 focus:!border-red-400 focus:!ring-red-500/20" : ""}`}
          />
          {fieldErrors.password && (
            <p className="text-xs text-red-600 mt-1.5">{fieldErrors.password}</p>
          )}
        </div>

        <button type="submit" disabled={loading} className="btn-primary btn-block btn-lg">
          {loading ? (
            <>
              <span className="spinner h-4 w-4 !border-white"></span>
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="text-sm text-slate-500 mt-6 text-center">
        Don&apos;t have an account?{" "}
        <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
          Create one
        </Link>
      </p>

      <button
        type="button"
        onClick={() => navigate(isAuthenticated ? "/dashboard" : "/")}
        className="btn-outline btn-block mt-4"
      >
        Back to Home
      </button>
    </AuthLayout>
  );
}

export default Login;