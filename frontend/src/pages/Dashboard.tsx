import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Globe2,
  MapPinned,
  RadioTower,
  SlidersHorizontal,
} from "lucide-react";
import type { ComplaintCategory, Hotspot, HotspotCluster } from "@civicpulse/shared";
import { getAiHealth, getDashboardData, type DashboardData } from "../api/client";
import { AuroraBackground } from "../components/AuroraBackground";
import { ComplaintQueue } from "../components/dashboard/ComplaintQueue";
import { KpiCard } from "../components/dashboard/KpiCard";
import { TopProjects } from "../components/dashboard/TopProjects";
import type { ChartDatum } from "../components/dashboard/DashboardCharts";
import "../dashboard.css";

const DashboardMap = lazy(() => import("../components/dashboard/DashboardMap"));
const DashboardCharts = lazy(() => import("../components/dashboard/DashboardCharts"));

const categories: ComplaintCategory[] = [
  "roads",
  "water",
  "electricity",
  "sanitation",
  "healthcare",
  "internet",
  "drainage",
  "education",
  "transport",
  "safety",
  "other",
];
const emptyClusters: HotspotCluster[] = [];
const emptyProjects: Hotspot[] = [];
const categoryLabels: Record<ComplaintCategory, string> = {
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

interface ClusterIndex {
  byCountry: Map<string, HotspotCluster[]>;
  byCategory: Map<ComplaintCategory, HotspotCluster[]>;
  bySeverity: Map<number, HotspotCluster[]>;
  projectsByCountry: Map<string, Hotspot[]>;
  projectsByCategory: Map<ComplaintCategory, Hotspot[]>;
  projectsBySeverity: Map<number, Hotspot[]>;
}

function addToIndex<K, V>(index: Map<K, V[]>, key: K, value: V): void {
  const items = index.get(key) ?? [];
  items.push(value);
  index.set(key, items);
}

function buildIndex(data: DashboardData | null): ClusterIndex {
  const index: ClusterIndex = {
    byCountry: new Map(),
    byCategory: new Map(),
    bySeverity: new Map(),
    projectsByCountry: new Map(),
    projectsByCategory: new Map(),
    projectsBySeverity: new Map(),
  };
  for (const cluster of data?.hotspots.clusters ?? []) {
    addToIndex(index.byCountry, cluster.country, cluster);
    addToIndex(index.byCategory, cluster.topCategory, cluster);
    for (let threshold = 1; threshold <= 5; threshold += 1) {
      if (cluster.avgSeverity >= threshold) addToIndex(index.bySeverity, threshold, cluster);
    }
  }
  for (const project of data?.hotspots.hotspots ?? []) {
    addToIndex(index.projectsByCountry, project.country, project);
    addToIndex(index.projectsByCategory, project.topCategory, project);
    for (let threshold = 1; threshold <= 5; threshold += 1) {
      if (project.avgSeverity >= threshold)
        addToIndex(index.projectsBySeverity, threshold, project);
    }
  }
  return index;
}

function smallest<T>(lists: T[][]): T[] | undefined {
  return lists.reduce<T[] | undefined>(
    (current, next) => (current === undefined || next.length < current.length ? next : current),
    undefined,
  );
}

function filterFromIndexes<
  T extends { country: string; topCategory: ComplaintCategory; avgSeverity: number },
>(
  all: T[],
  indexes: Array<T[] | undefined>,
  country: string,
  category: ComplaintCategory | "all",
  severity: number,
): T[] {
  const source = smallest(indexes.filter((items): items is T[] => items !== undefined)) ?? all;
  return source.filter(
    (item) =>
      (country === "all" || item.country === country) &&
      (category === "all" || item.topCategory === category) &&
      item.avgSeverity >= severity,
  );
}

function SkeletonDashboard() {
  return (
    <main className="dashboard-shell" aria-busy="true" aria-label="Loading policy dashboard">
      <div className="dashboard-skeleton-header skeleton-shimmer" />
      <div className="dashboard-skeleton-kpis">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="dashboard-skeleton-kpi skeleton-shimmer" key={index} />
        ))}
      </div>
      <div className="dashboard-skeleton-main">
        <div className="dashboard-skeleton-map skeleton-shimmer" />
        <div className="dashboard-skeleton-projects skeleton-shimmer" />
      </div>
      <span className="sr-only">Loading analytics…</span>
    </main>
  );
}

function PanelSkeleton() {
  return (
    <div className="panel-skeleton skeleton-shimmer" role="status">
      Loading visualization…
    </div>
  );
}

export default function Dashboard() {
  const reducedMotion = useReducedMotion();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [country, setCountry] = useState("India");
  const [category, setCategory] = useState<ComplaintCategory | "all">("all");
  const [minimumSeverity, setMinimumSeverity] = useState(1);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getAiHealth(controller.signal)
      .then((health) => setAiAvailable(health.geminiConfigured && health.lastErrorType === null))
      .catch(() => {
        if (!controller.signal.aborted) setAiAvailable(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let mounted = true;
    let firstLoad = true;
    let activeRequest: AbortController | undefined;

    const refresh = async () => {
      activeRequest?.abort();
      const controller = new AbortController();
      activeRequest = controller;
      if (firstLoad) setLoading(true);
      else setRefreshing(true);
      try {
        const next = await getDashboardData(controller.signal);
        if (mounted) {
          setData(next);
          setError("");
        }
      } catch (cause) {
        if (mounted && !controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Could not load policy analytics.");
        }
      } finally {
        firstLoad = false;
        if (mounted && !controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      activeRequest?.abort();
    };
  }, []);

  const countryNames = useMemo(() => {
    if (data?.stats.isDemo) return ["India"];
    return Object.entries(data?.stats.countries ?? {})
      .filter(([, count]) => count > 0)
      .map(([name]) => name)
      .sort();
  }, [data?.stats.countries, data?.stats.isDemo]);

  useEffect(() => {
    if (!data) return;
    setCountry((selected) => {
      if (selected === "all") return selected;
      if (selected !== "all" && countryNames.includes(selected)) return selected;
      if (countryNames.includes("India")) return "India";
      return countryNames[0] ?? "all";
    });
  }, [countryNames, data]);

  const allClusters = data?.hotspots.clusters ?? emptyClusters;
  const allProjects = data?.hotspots.hotspots ?? emptyProjects;
  const indexes = useMemo(() => buildIndex(data), [data]);
  const visibleClusters = useMemo(
    () =>
      filterFromIndexes(
        allClusters,
        [
          country === "all" ? undefined : indexes.byCountry.get(country),
          category === "all" ? undefined : indexes.byCategory.get(category),
          indexes.bySeverity.get(minimumSeverity),
        ],
        country,
        category,
        minimumSeverity,
      ),
    [allClusters, category, country, indexes, minimumSeverity],
  );
  const visibleProjects = useMemo(
    () =>
      filterFromIndexes(
        allProjects,
        [
          country === "all" ? undefined : indexes.projectsByCountry.get(country),
          category === "all" ? undefined : indexes.projectsByCategory.get(category),
          indexes.projectsBySeverity.get(minimumSeverity),
        ],
        country,
        category,
        minimumSeverity,
      ),
    [allProjects, category, country, indexes, minimumSeverity],
  );

  const categoryChart: ChartDatum[] = categories
    .filter((item) => category === "all" || item === category)
    .map((item) => ({ name: categoryLabels[item], value: data?.stats.categories[item] ?? 0 }))
    .filter((item) => item.value > 0);
  const countryChart: ChartDatum[] = Object.entries(data?.stats.countries ?? {})
    .filter(([name]) => country === "all" || name === country)
    .map(([name, value]) => ({ name, value }))
    .filter((item) => item.value > 0);
  const languageCount = Object.values(data?.stats.languages ?? {}).filter(
    (value) => value > 0,
  ).length;
  const highPriorityCount = allProjects.filter((project) => project.priorityScore >= 12).length;
  if (loading && !data) return <SkeletonDashboard />;

  return (
    <main className="dashboard-page">
      <AuroraBackground />
      <div className="dashboard-shell">
        <header className="dashboard-header">
          <div className="dashboard-brand-block">
            <a href="/" className="dashboard-brand" aria-label="CivicPulse home">
              C<span>·</span>P
            </a>
            <div className="dashboard-heading">
              <div className="dashboard-breadcrumb">
                CIVICPULSE <span>/</span> POLICY VIEW
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h1>Infrastructure pulse</h1>
                <span
                  className="inline-flex min-h-11 items-center gap-2 text-xs text-slate-300"
                  aria-label={`AI status: ${aiAvailable === null ? "checking" : aiAvailable ? "available" : "unavailable"}`}
                  title={`AI status: ${aiAvailable === null ? "checking" : aiAvailable ? "available" : "unavailable"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 rounded-full ${aiAvailable === null ? "bg-slate-400" : aiAvailable ? "bg-emerald-400" : "bg-rose-400"}`}
                  />
                  AI
                </span>
              </div>
            </div>
          </div>
          <div className="dashboard-status">
            <span className={`live-indicator${refreshing ? " is-refreshing" : ""}`} />
            <span>
              {refreshing ? "Updating" : data?.stats.isDemo ? "Fallback data" : "Live data"}
            </span>
            {data?.stats.isDemo && (
              <span className="report-status status-reviewing">Demo data</span>
            )}
            <span className="status-divider" />
            <span>Refreshes every 30s</span>
          </div>
        </header>

        {error && (
          <motion.div
            className="dashboard-error"
            role="alert"
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
          >
            <AlertTriangle size={17} />
            <span>{error}</span>
            <button type="button" onClick={() => window.location.reload()}>
              Retry
            </button>
          </motion.div>
        )}

        <section className="dashboard-kpis" aria-label="Key indicators">
          <KpiCard
            label="Citizen reports"
            value={data?.stats.totalComplaints ?? 0}
            detail="Across all channels"
            icon={Activity}
            accent="cyan"
          />
          <KpiCard
            label="Districts covered"
            value={data?.stats.districtsCovered ?? 0}
            detail="With at least one report"
            icon={MapPinned}
            accent="violet"
          />
          <KpiCard
            label="Languages"
            value={languageCount}
            detail="Voices represented"
            icon={Globe2}
            accent="green"
          />
          <KpiCard
            label="Priority hotspots"
            value={highPriorityCount}
            detail="Score 12 and above"
            icon={RadioTower}
            accent="rose"
          />
        </section>

        <section className="dashboard-filters" aria-label="Filter dashboard data">
          <div className="filter-heading">
            <SlidersHorizontal size={15} />
            <span>FILTER VIEW</span>
          </div>
          {!data?.stats.isDemo && (
            <label className="filter-control">
              <span>Country</span>
              <select value={country} onChange={(event) => setCountry(event.target.value)}>
                <option value="all">All countries</option>
                {countryNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="filter-control">
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ComplaintCategory | "all")}
            >
              <option value="all">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {categoryLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control severity-filter">
            <span>
              Minimum severity <strong>{minimumSeverity}+</strong>
            </span>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={minimumSeverity}
              onChange={(event) => setMinimumSeverity(Number(event.target.value))}
            />
          </label>
          <span className="filter-result-count">
            {visibleClusters.length} clusters · {visibleProjects.length} projects
          </span>
        </section>

        <div className="dashboard-content">
          <section className="dashboard-panel map-panel">
            <div className="panel-heading map-heading">
              <div>
                <span className="panel-eyebrow">SPATIAL SIGNAL</span>
                <h2>Where reports converge</h2>
              </div>
              <div className="map-legend" aria-label="Priority legend">
                <span>
                  <i className="legend-high" />
                  High
                </span>
                <span>
                  <i className="legend-medium" />
                  Watch
                </span>
                <span>
                  <i className="legend-low" />
                  Lower
                </span>
              </div>
            </div>
            <div className="dashboard-map-stage">
              {visibleClusters.length === 0 && (
                <div className="map-empty-overlay">No clusters match these filters.</div>
              )}
              <Suspense fallback={<PanelSkeleton />}>
                <DashboardMap clusters={visibleClusters} />
              </Suspense>
            </div>
            <div className="map-footnote">
              <span>Marker area reflects clustered reports</span>
              <span>{visibleClusters.length} visible clusters</span>
            </div>
          </section>

          <section
            className={`dashboard-panel project-panel${projectsOpen ? " projects-open" : ""}`}
          >
            <button
              className="project-sheet-toggle"
              type="button"
              onClick={() => setProjectsOpen((open) => !open)}
              aria-expanded={projectsOpen}
            >
              <span className="sheet-grabber" />
              <span>
                Top recommended projects <strong>{visibleProjects.length}</strong>
              </span>
            </button>
            <div className="panel-heading project-panel-heading">
              <div>
                <span className="panel-eyebrow">ACTION PRIORITIES</span>
                <h2>Top recommended projects</h2>
              </div>
              <span className="top-five-mark">TOP 05</span>
            </div>
            <TopProjects projects={visibleProjects} />
          </section>

          <Suspense fallback={<PanelSkeleton />}>
            <DashboardCharts categories={categoryChart} countries={countryChart} />
          </Suspense>
        </div>

        <ComplaintQueue />

        <footer className="dashboard-footer">
          <span>Decision support from community reports</span>
          <span>
            Data refreshes automatically <i className="footer-live-dot" />
          </span>
        </footer>
      </div>
    </main>
  );
}
