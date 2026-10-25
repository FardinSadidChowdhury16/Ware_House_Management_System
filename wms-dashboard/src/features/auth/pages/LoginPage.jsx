import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { Eye, EyeOff } from "lucide-react";

export function LoginPage() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const from = location.state?.from || "/";

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await login(form);
      navigate(from, { replace: true });
    } catch (e) {
      setError(e?.response?.data?.detail || e?.response?.data?.message || "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-sm p-6" onSubmit={onSubmit}>
        <h1
          className="font-semibold"
          style={{ fontSize: "1.25rem", color: "#000", margin: "0 0 0.25rem 0", letterSpacing: "0" }}
        >
          WMS Dashboard Login
        </h1>
        <p style={{ color: "#475569", marginBottom: "1.25rem" }}>Sign in to access your warehouse dashboard.</p>

        <label className="text-sm font-medium text-slate-700 block mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          placeholder="name@company.com"
          autoComplete="email"
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          required
        />

        <label className="text-sm font-medium text-slate-700 block mb-1" htmlFor="password">
          Password
        </label>
        <div className="relative mb-4">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="Enter your password"
            autoComplete="current-password"
            className="w-full border border-slate-300 rounded-md pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors cursor-pointer"
            title={showPassword ? "Hide password" : "Show password"}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error ? <p className="text-sm text-red-600 mb-3">{error}</p> : null}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-slate-900 text-white text-sm font-medium rounded-md py-2.5 hover:bg-slate-700 disabled:opacity-60"
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
