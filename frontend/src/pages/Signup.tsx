import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { IndiaAdminState } from "../../../shared/data/indiaAdmin.js";
import { AuroraBackground } from "../components/AuroraBackground";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const next = (() => {
    const raw = new URLSearchParams(location.search).get("next");
    if (typeof raw !== "string") return "/";
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  })();

  const [adminStates, setAdminStates] = useState<IndiaAdminState[]>([]);
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [stateSearch, setStateSearch] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void import("../../../shared/data/indiaAdmin.js")
      .then(({ INDIA_ADMIN_STATES }) => {
        if (active) setAdminStates([...INDIA_ADMIN_STATES]);
      })
      .catch((cause: unknown) => {
        if (active) {
          setOptionsError(
            cause instanceof Error
              ? cause.message
              : "Indian states and districts could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const states = adminStates.filter(
    (item) => item.name === state || item.name.toLowerCase().includes(stateSearch.toLowerCase()),
  );
  const selectedState = adminStates.find((item) => item.name === state);
  const districtOptions = (selectedState?.districts ?? []).filter(
    (item) =>
      item.name === district || item.name.toLowerCase().includes(districtSearch.toLowerCase()),
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signup({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        state,
        district,
      });
      navigate(next || "/", { replace: true });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Account creation failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <AuroraBackground />
      <section className="auth-panel glass-panel auth-panel-wide" aria-labelledby="signup-title">
        <span className="auth-kicker">JOIN YOUR COMMUNITY</span>
        <h1 id="signup-title">Create an account</h1>
        <p className="auth-intro">Track your reports and see how local priorities progress.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            Name
            <input
              type="text"
              autoComplete="name"
              maxLength={100}
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
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
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="auth-form-row">
            <label className="auth-field">
              Search state or union territory
              <input
                type="search"
                value={stateSearch}
                onChange={(event) => setStateSearch(event.target.value)}
                placeholder="Type a state"
                aria-label="Search states and union territories"
              />
            </label>
            <label className="auth-field">
              State or union territory
              <select
                required
                value={state}
                disabled={optionsLoading || adminStates.length === 0}
                onChange={(event) => {
                  setState(event.target.value);
                  setDistrict("");
                  setStateSearch("");
                  setDistrictSearch("");
                }}
              >
                <option value="">{optionsLoading ? "Loading states?" : "Select a state"}</option>
                {states.map((item) => (
                  <option value={item.name} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="auth-form-row">
            <label className="auth-field">
              Search district
              <input
                type="search"
                value={districtSearch}
                onChange={(event) => setDistrictSearch(event.target.value)}
                placeholder={state ? "Type a district" : "Select a state first"}
                aria-label="Search districts in the selected state"
                disabled={!state}
              />
            </label>
            <label className="auth-field">
              District
              <select
                required
                value={district}
                disabled={!state || districtOptions.length === 0}
                onChange={(event) => {
                  setDistrict(event.target.value);
                  setDistrictSearch("");
                }}
              >
                <option value="">Select a district</option>
                {districtOptions.map((item) => (
                  <option value={item.name} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {optionsError && (
            <p className="auth-error" role="alert">
              {optionsError}
            </p>
          )}
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {!optionsLoading && !optionsError && adminStates.length === 0 && (
            <p className="auth-error" role="status">
              No Indian states and districts are available yet.
            </p>
          )}
          <button
            className="auth-submit"
            type="submit"
            disabled={submitting || optionsLoading || adminStates.length === 0}
          >
            {submitting ? "Creating account?" : "Create account"}
          </button>
        </form>
        <p className="auth-switch">
          Already registered? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        </p>
      </section>
    </main>
  );
}
