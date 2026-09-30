import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  BookOpen,
  Bus,
  HeartPulse,
  Radio,
  Route,
  Shield,
  Trash2,
  Waves,
  Zap,
} from "lucide-react";
import type { ComplaintCategory, Hotspot } from "@civicpulse/shared";

interface TopProjectsProps {
  projects: Hotspot[];
}

const categoryIcons: Record<ComplaintCategory, typeof Route> = {
  roads: Route,
  water: Waves,
  electricity: Zap,
  sanitation: Trash2,
  healthcare: HeartPulse,
  internet: Radio,
  drainage: Waves,
  education: BookOpen,
  transport: Bus,
  safety: Shield,
  other: Activity,
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

function PriorityRing({ score }: { score: number }) {
  const reducedMotion = useReducedMotion();
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0.08, Math.min(1, score / 20));
  return (
    <div className="priority-ring" aria-label={`Priority score ${score.toFixed(1)}`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="priority-ring-track" cx="24" cy="24" r={radius} />
        <motion.circle
          className="priority-ring-value"
          cx="24"
          cy="24"
          r={radius}
          strokeDasharray={`${circumference * progress} ${circumference}`}
          initial={reducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.72 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reducedMotion ? 0 : 0.65, ease: "easeOut" }}
        />
      </svg>
      <strong>{score.toFixed(0)}</strong>
    </div>
  );
}

export function TopProjects({ projects }: TopProjectsProps) {
  const reducedMotion = useReducedMotion();
  if (projects.length === 0) {
    return (
      <div className="projects-empty">
        <Activity size={19} />
        <span>No projects match these filters.</span>
      </div>
    );
  }

  return (
    <div className="project-list">
      {projects.slice(0, 5).map((project, index) => {
        const Icon = categoryIcons[project.topCategory];
        return (
          <motion.article
            className="project-card"
            key={project.districtId}
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reducedMotion ? 0 : 0.28,
              delay: reducedMotion ? 0 : index * 0.06,
            }}
          >
            <div className="project-rank">{String(index + 1).padStart(2, "0")}</div>
            <div className="project-icon">
              <Icon size={17} strokeWidth={1.8} />
            </div>
            <div className="project-copy">
              <div className="project-title-row">
                <strong>{project.districtName}</strong>
                <span>{project.country}</span>
              </div>
              <span className="project-category">{categoryNames[project.topCategory]}</span>
              <p>{project.recommendation}</p>
              <div className="project-meta">
                <span>{project.complaintCount.toLocaleString()} reports</span>
                <span>Avg severity {project.avgSeverity.toFixed(1)}</span>
              </div>
            </div>
            <PriorityRing score={project.priorityScore} />
          </motion.article>
        );
      })}
    </div>
  );
}
