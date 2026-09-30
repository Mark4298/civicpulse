import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { UserRole } from "@civicpulse/shared";
import { useAuth } from "../context/AuthContext";
import { AuroraBackground } from "../components/AuroraBackground";
import { getCurrentUserProfile } from "../api/client";

export default function Login() {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedRole, setSelectedRole] = useState<UserRole>("citizen");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const next = (() => {
    const raw = new URLSearchParams(location.search).get("next");
    if (typeof raw !== "string") return "/";
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  })();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      const { user: profile } = await getCurrentUserProfile();
      if (profile.role !== selectedRole) {
        await logout();
        setError(
          selectedRole === "admin"
            ? "This account is not registered as an Administrator"
            : "This account is not registered as a Citizen",
        );
        return;
      }
      const destination = selectedRole === "admin" && next === "/" ? "/dashboard" : next || "/";
      navigate(destination, { replace: true });
    } catch (cause) {
      await logout();
      setError(cause instanceof Error ? cause.message : "Sign in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <AuroraBackground />
      <section className="auth-panel glass-panel" aria-labelledby="login-title">
        <span className="auth-kicker">CITIZEN ACCESS</span>
        <h1 id="login-title">Welcome back</h1>
        <p className="auth-intro">Sign in to follow the progress of your reports.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-role-toggle" role="group" aria-label="Account type">
            {(["citizen", "admin"] as const).map((role) => (
              <button
                className={`auth-role-option${selectedRole === role ? " is-selected" : ""}`}
                type="button"
                aria-pressed={selectedRole === role}
                key={role}
                onClick={() => setSelectedRole(role)}
              >
                {role === "admin" ? "Administrator" : "Citizen"}
              </button>
            ))}
          </div>
          <label className="auth-field">
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="auth-field">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          New to CivicPulse? <Link to={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
        </p>
      </section>
    </main>
  );
}