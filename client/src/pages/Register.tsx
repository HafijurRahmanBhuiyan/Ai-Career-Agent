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
  const { register } = useAuth();
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
      {apiError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              fieldErrors.name ? "border-red-300" : "border-slate-200"
            }`}
          />
          {fieldErrors.name && (
            <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>
          )}
        </div>

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
            placeholder="At least 8 characters"
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
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="text-sm text-slate-500 mt-6 text-center">
        Already have an account?{" "}
        <Link to="/login" className="text-blue-600 hover:text-blue-700">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

export default Register;
