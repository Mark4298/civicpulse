import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowRight,
  HeartPulse,
  Radio,
  RefreshCw,
  Route,
  Shield,
  Trash2,
  Waves,
  Zap,
} from "lucide-react";
import type { Complaint, ComplaintCategory, ComplaintStatus } from "@civicpulse/shared";
import { Link } from "react-router-dom";
import { getMyReports } from "../api/client";
import { AuroraBackground } from "../components/AuroraBackground";

const categoryIcons: Record<ComplaintCategory, typeof Route> = {
  roads: Route,
  water: Waves,
  electricity: Zap,
  sanitation: Trash2,
  healthcare: HeartPulse,
  internet: Radio,
  drainage: Waves,
  education: Activity,
  transport: Route,
  safety: Shield,
  other: Radio,
};

const categoryNames: Record<ComplaintCategory, string> = {
  roads: "Roads & potholes",
  water: "Water supply",
  electricity: "Electricity & streetlights",
  sanitation: "Sanitation & garbage",
  healthcare: "Healthcare",
  internet: "Internet",
  drainage: "Drainage & sewage",
  education: "Education",
  transport: "Public transport",
  safety: "Public safety",
  other: "Other",
};

const statusLabels: Record<ComplaintStatus, string> = {
  submitted: "Submitted",
  reviewing: "Reviewing",
  in_progress: "In progress",
  resolved: "Resolved",
};

const urgencyLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
  emergency: "Emergency",
} as const;
const affectedLabels = {
  me: "Just me",
  street: "My street",
  neighbourhood: "Neighbourhood",
  wide_area: "Whole area",
} as const;
const durationLabels = {
  under_1_week: "Less than a week",
  "1_to_4_weeks": "1 to 4 weeks",
  "1_to_6_months": "1 to 6 months",
  over_6_months: "More than 6 months",
} as const;

function summary(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 140 ? `${cleaned.slice(0, 137)}…` : cleaned;
}

function districtName(id: string): string {
  return id
    .replace(/^in-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function LoadingSkeleton() {
  return (
    <div className="reports-list" role="status" aria-busy="true" aria-label="Loading reports">
      {[0, 1, 2].map((index) => (
        <div className="report-row glass-panel" key={index}>
          <div
            className="report-row-main"
            style={{ display: "flex", alignItems: "center", gap: 14 }}
          >
            <div className="app-brand-icon" aria-hidden="true" />
            <div style={{ display: "grid", flex: 1, gap: 9 }} aria-hidden="true">
              <div
                style={{
                  height: 15,
                  width: "62%",
                  borderRadius: 4,
                  background: "var(--cp-raised)",
                }}
              />
              <div
                style={{
                  height: 11,
                  width: "42%",
                  borderRadius: 4,
                  background: "var(--cp-raised)",
                }}
              />
            </div>
          </div>
          <div
            style={{ height: 25, width: 86, borderRadius: 4, background: "var(--cp-raised)" }}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  );
}

export default function MyReports() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void getMyReports(controller.signal)
      .then((page) => {
        setComplaints(page.complaints);
        setNextCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Reports could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadVersion]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await getMyReports(undefined, nextCursor);
      setComplaints((current) => [...current, ...page.complaints]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "More reports could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="reports-page">
      <AuroraBackground />
      <section className="reports-shell" aria-labelledby="reports-title">
        <span className="auth-kicker">YOUR CIVICPULSE</span>
        <h1 id="reports-title">My reports</h1>
        <p className="auth-intro">Updates on the issues you have shared with your community.</p>
        {!loading && complaints.length > 0 && (
          <p
            className="reports-message"
            aria-label={`${complaints.length} reports submitted, ${complaints.filter((item) => item.status === "resolved").length} resolved`}
          >
            <Activity size={16} aria-hidden="true" />
            <strong>{complaints.length}</strong> reports submitted
            <span aria-hidden="true">·</span>
            <strong>{complaints.filter((item) => item.status === "resolved").length}</strong>{" "}
            resolved
          </p>
        )}
        {loading && <LoadingSkeleton />}
        {error && (
          <div className="reports-message reports-error" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button
              className="reports-more"
              type="button"
              onClick={() => setReloadVersion((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        )}
        {!loading && !error && complaints.length === 0 && (
          <>
            <div className="reports-message glass-panel" role="status">
              <Activity size={18} aria-hidden="true" />
              <strong>You haven&apos;t submitted any reports yet</strong>
            </div>
            <p className="reports-message">Share a local issue to start tracking its progress.</p>
            <Link className="reports-more" to="/">
              <ArrowRight size={16} /> Report an issue
            </Link>
          </>
        )}
        {complaints.length > 0 && (
          <div className="reports-list">
            {complaints.map((complaint) => {
              const Icon = categoryIcons[complaint.category];
              return (
                <article className="report-row glass-panel" key={complaint.id}>
                  <div
                    className="report-row-main"
                    style={{ display: "flex", alignItems: "center", gap: 14 }}
                  >
                    <div
                      className="app-brand-icon"
                      role="img"
                      aria-label={categoryNames[complaint.category]}
                    >
                      <Icon size={17} strokeWidth={1.9} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p>{summary(complaint.rawText)}</p>
                      <span>
                        {categoryNames[complaint.category]} ·{" "}
                        {new Date(complaint.timestamp).toLocaleDateString()}
                        {" · "}
                        {districtName(complaint.districtId)}
                      </span>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {complaint.urgency && (
                          <span
                            className={`rounded-full border px-2 py-1 ${complaint.urgency === "emergency" ? "border-rose-300/40 bg-rose-300/10 text-rose-100" : "border-amber-200/20 bg-amber-200/5 text-amber-100"}`}
                          >
                            {urgencyLabels[complaint.urgency]} urgency
                          </span>
                        )}
                        {complaint.affectedScale && (
                          <span className="rounded-full border border-white/10 px-2 py-1 text-slate-300">
                            {affectedLabels[complaint.affectedScale]}
                          </span>
                        )}
                        {complaint.duration && (
                          <span className="rounded-full border border-white/10 px-2 py-1 text-slate-300">
                            {durationLabels[complaint.duration]}
                          </span>
                        )}
                        {complaint.landmark && (
                          <span className="rounded-full border border-white/10 px-2 py-1 text-slate-300">
                            Near {complaint.landmark}
                          </span>
                        )}
                        <span className="rounded-full border border-cyan-300/20 px-2 py-1 text-cyan-100">
                          Ref: {complaint.referenceId || complaint.id}
                        </span>
                      </div>
                      {complaint.photoUrls && complaint.photoUrls.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2" aria-label="Report photos">
                          {complaint.photoUrls.map((url, index) => (
                            <button
                              type="button"
                              key={`${complaint.id}-photo-${index}`}
                              className="h-14 w-14 overflow-hidden rounded-lg border border-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                              onClick={() => setPhotoPreview(url)}
                              aria-label={`Open report photo ${index + 1}`}
                            >
                              <img
                                className="h-full w-full object-cover"
                                src={url}
                                alt={`Report attachment ${index + 1}`}
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`report-status status-${complaint.status}`}>
                    {statusLabels[complaint.status]}
                  </span>
                </article>
              );
            })}
          </div>
        )}
        {nextCursor && (
          <button className="reports-more" type="button" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <RefreshCw size={16} className="spin-icon" /> : <ArrowDown size={16} />}
            {loadingMore ? "Loading…" : "Load more reports"}
          </button>
        )}
        {photoPreview && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4"
            role="presentation"
            onClick={() => setPhotoPreview(null)}
          >
            <div
              className="relative max-h-[90vh] max-w-[min(90vw,900px)]"
              role="dialog"
              aria-modal="true"
              aria-label="Report photo preview"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className="absolute -right-3 -top-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                type="button"
                aria-label="Close photo preview"
                onClick={() => setPhotoPreview(null)}
              >
                <ArrowRight size={17} className="rotate-180" />
              </button>
              <img
                className="max-h-[85vh] max-w-full rounded-xl object-contain"
                src={photoPreview}
                alt="Full-size report attachment"
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
