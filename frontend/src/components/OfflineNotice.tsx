import { motion, useReducedMotion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function OfflineNotice() {
  const online = useOnlineStatus();
  const reducedMotion = useReducedMotion();
  if (online) return null;

  return (
    <motion.div
      className="network-notice"
      role="status"
      aria-live="polite"
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.2 }}
    >
      <WifiOff size={16} aria-hidden="true" />
      <span>You’re offline. Reports can’t be sent until your connection returns.</span>
    </motion.div>
  );
}
