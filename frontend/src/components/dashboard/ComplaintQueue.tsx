import { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import type { Complaint, ComplaintCategory, ComplaintStatus } from "@civicpulse/shared";
import { getComplaintQueue, updateComplaintStatus } from "../../api/client";
import { categoryLabels } from "../CategoryChips";

const statuses: ComplaintStatus[] = ["submitted", "reviewing", "in_progress", "resolved"];
const classifierLabels: Record<NonNullable<Complaint["classifiedBy"]>, string> = {
  user: "Manual",
  trie: "Keyword",
  gemini: "AI",
  fallback: "Default",
};
const statusLabels: Record<ComplaintStatus, string> = {
  submitted: "Submitted",
  reviewing: "Reviewing",
  in_progress: "In progress",
  resolved: "Resolved",
};
const affectedLabels = {
  me: "Just me",
  street: "My street",
  neighbourhood: "Neighbourhood",
  wide_area: "Whole area",
} as const;
const urgencyLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
  emergency: "Emergency",
} as const;

function categoryName(category: ComplaintCategory): string {
  return categoryLabels[category];
}

function districtName(id: string): string {
  return id
    .replace(/^in-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function summary(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 150 ? `${cleaned.slice(0, 147)}…` : cleaned;
}

export function ComplaintQueue() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [statusToast, setStatusToast] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void getComplaintQueue(controller.signal)
      .then((page) => setComplaints(page.complaints))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Could not load recent complaints.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadVersion]);

  useEffect(() => {
    if (!statusToast) return;
    const timer = window.setTimeout(() => setStatusToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [statusToast]);

  async function changeStatus(complaint: Complaint, status: ComplaintStatus) {
    const previousStatus = complaint.status;
    setLoadingId(complaint.id);
    setError("");
    setStatusToast("");
    setComplaints((current) =>
      current.map((item) => (item.id === complaint.id ? { ...item, status } : item)),
    );
    try {
      const updated = await updateComplaintStatus(complaint.id, status);
      setComplaints((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStatusToast(`${statusLabels[status]} status saved.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not update complaint status.";
      setComplaints((current) =>
        current.map((item) =>
          item.id === complaint.id ? { ...item, status: previousStatus } : item,
        ),
      );
      try {
        const page = await getComplaintQueue(new AbortController().signal);
        setComplaints(page.complaints);
      } catch (refreshCause) {
        const refreshMessage =
          refreshCause instanceof Error
            ? refreshCause.message
            : "The queue could not be refreshed.";
        setError(`${message} ${refreshMessage}`);
        return;
      }
      setError(message);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="complaint-queue" aria-labelledby="complaint-queue-title">
      <div className="complaint-queue-heading">
        <div>
          <span className="panel-eyebrow">MODERATION</span>
          <h2 id="complaint-queue-title">Recent complaints</h2>
        </div>
        <span className="report-status">{complaints.length} reports</span>
      </div>
      {error && (
        <div className="dashboard-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => setReloadVersion((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}
      {statusToast && (
        <p className="report-status" role="status" aria-live="polite">
          {statusToast}
        </p>
      )}
      {loading && (
        <div className="panel-skeleton skeleton-shimmer" role="status">
          Loading complaints…
        </div>
      )}
      {!loading && !error && complaints.length === 0 && (
        <div className="projects-empty">No recent complaints to review.</div>
      )}
      {!loading && complaints.length > 0 && (
        <div className="complaint-queue-list">
          {complaints.map((complaint) => (
            <article className="complaint-queue-row" key={complaint.id}>
              <div className="complaint-queue-copy">
                <strong>{summary(complaint.rawText)}</strong>
                <span>
                  {districtName(complaint.districtId)} · {categoryName(complaint.category)} ·{" "}
                  {new Date(complaint.timestamp).toLocaleDateString()}
                </span>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/5 px-2 py-1 text-cyan-100">
                    {classifierLabels[complaint.classifiedBy ?? "fallback"]}
                  </span>
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
                      {complaint.duration.replace(/_/g, " ")}
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
                  <div className="mt-3 flex flex-wrap gap-2" aria-label="Complaint photos">
                    {complaint.photoUrls.map((url, index) => (
                      <button
                        type="button"
                        key={`${complaint.id}-photo-${index}`}
                        className="h-14 w-14 overflow-hidden rounded-lg border border-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                        onClick={() => setPhotoPreview(url)}
                        aria-label={`Open complaint photo ${index + 1}`}
                      >
                        <img
                          className="h-full w-full object-cover"
                          src={url}
                          alt={`Complaint attachment ${index + 1}`}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <label className="filter-control complaint-queue-status">
                <span className="sr-only">
                  Status for {districtName(complaint.districtId)} report
                </span>
                <select
                  value={complaint.status}
                  disabled={loadingId === complaint.id}
                  onChange={(event) =>
                    void changeStatus(complaint, event.target.value as ComplaintStatus)
                  }
                >
                  {statuses.map((status) => (
                    <option value={status} key={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          ))}
        </div>
      )}
      {loadingId && (
        <span className="sr-only" role="status">
          Updating complaint status…
        </span>
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
            aria-label="Complaint photo preview"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute -right-3 -top-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
              onClick={() => setPhotoPreview(null)}
              aria-label="Close photo preview"
            >
              <X size={17} />
            </button>
            <img
              className="max-h-[85vh] max-w-full rounded-xl object-contain"
              src={photoPreview}
              alt="Full-size complaint attachment"
            />
          </div>
        </div>
      )}
    </section>
  );
}
