import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/apiError";

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

function Register() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!name.trim()) {
      errors.name = "Name is required";
    } else if (name.trim().length > 100) {
      errors.name = "Name must be 100 characters or less";
    }
    if (!email.trim()) {
      errors.email = "Email is required";
    } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      errors.email = "Invalid email address";
    }
    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    } else if (password.length > 128) {
      errors.password = "Password must be 128 characters or less";
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
      await register({ name: name.trim(), email: email.trim(), password });
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      setApiError(
        getErrorMessage(err, "Unable to create your account. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Get started with AI Career Agent">
      {apiError && <div className="alert-error mb-4">{apiError}</div>}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label className="field-label">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            className={`input ${fieldErrors.name ? "!border-red-400 focus:!border-red-400 focus:!ring-red-500/20" : ""}`}
          />
          {fieldErrors.name && (
            <p className="text-xs text-red-600 mt-1.5">{fieldErrors.name}</p>
          )}
        </div>

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
          <label className="field-label">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
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
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p className="text-sm text-slate-500 mt-6 text-center">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
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

export default Register;