import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ComplaintLanguage } from "@civicpulse/shared";
import { ComplaintForm } from "../components/ComplaintForm";
import { Hero } from "../components/Hero";
import { AuroraBackground } from "../components/AuroraBackground";
import { useAuth } from "../context/AuthContext";
import "../home.css";

export default function Home() {
  const { user, loading } = useAuth();
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState<ComplaintLanguage | "auto">("auto");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const message = (routeLocation.state as { toast?: unknown } | null)?.toast;
    if (typeof message !== "string") return;
    setToast(message);
    navigate("/", { replace: true, state: null });
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [routeLocation.state, navigate]);

  if (loading) {
    return (
      <main className="home-page">
        <AuroraBackground />
        <div className="home-shell">
          <div className="home-layout">
            <Hero language={language} isLoggedIn={Boolean(user)} onSelectTopic={setPrompt} />
            <div className="report-card glass-panel" aria-busy="true" aria-live="polite">
              <div className="animate-pulse rounded-xl bg-white/10 p-6">
                <div className="mb-3 h-4 w-24 rounded bg-white/10" />
                <div className="mb-4 h-10 w-2/3 rounded bg-white/10" />
                <div className="h-24 rounded bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="home-page">
      <AuroraBackground />
      <div className="home-shell">
        {toast && (
          <div className="app-toast" role="status">
            {toast}
          </div>
        )}
        {!user && (
          <div className="tracking-banner">
            <span>Reports are always open to everyone.</span>
            <Link to="/login?next=%2F">Sign in to track your reports</Link>
          </div>
        )}

        <div className="home-layout">
          <Hero language={language} isLoggedIn={Boolean(user)} onSelectTopic={setPrompt} />
          {user ? (
            <ComplaintForm
              initialValue={prompt}
              initialLanguage={language}
              onLanguageChange={setLanguage}
              onClearInitialValue={() => setPrompt("")}
            />
          ) : (
            <div className="report-card glass-panel auth-card" aria-labelledby="sign-in-report-title">
              <span className="auth-kicker">REPORT ACCESS</span>
              <h2 id="sign-in-report-title">Sign in to report</h2>
              <p>
                So we can send you updates and let you track your report.
              </p>
              <div className="auth-actions">
                <Link className="auth-submit" to="/login?next=%2F">
                  Log in
                </Link>
                <Link className="secondary-button" to="/signup?next=%2F">
                  Create account
                </Link>
              </div>
            </div>
          )}
        </div>

        <footer className="site-footer">
          <span>
            Built as a Digital Public Good — architecture supports any BRICS nation via configurable
            district and language data
          </span>
          <span className="footer-languages">
            EN <i /> हिन्दी <i /> বাংলা <i /> தமிழ்
          </span>
        </footer>
        <motion.div
          className="page-index"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.65 }}
        >
          <span>01</span>
          <span className="page-index-line" />
          <span>01</span>
        </motion.div>
      </div>
    </main>
  );
}
