import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  accent: "cyan" | "violet" | "rose" | "green";
}

function KpiValue({ value }: { value: number }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.span
      initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.35 }}
    >
      {value.toLocaleString()}
    </motion.span>
  );
}

export function KpiCard({ label, value, detail, icon: Icon, accent }: KpiCardProps) {
  return (
    <article className={`kpi-card kpi-${accent}`}>
      <div className="kpi-card-inner">
        <div className="kpi-label-row">
          <span>{label}</span>
          <span className="kpi-icon">
            <Icon size={17} strokeWidth={1.8} />
          </span>
        </div>
        <strong className="kpi-value">
          <KpiValue value={value} />
        </strong>
        <span className="kpi-detail">{detail}</span>
      </div>
    </article>
  );
}
