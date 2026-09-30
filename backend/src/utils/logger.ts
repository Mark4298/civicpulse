export const logger = {
  info(message: string): void {
    console.info(`[civicpulse] ${message}`);
  },
  warn(message: string): void {
    console.warn(`[civicpulse] ${message}`);
  },
  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? error.message : error ? String(error) : "";
    console.error(`[civicpulse] ${message}${detail ? `: ${detail}` : ""}`);
  },
};
