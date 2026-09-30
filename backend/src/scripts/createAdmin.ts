import { getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDb } from "../config/firebase.js";
import { logger } from "../utils/logger.js";
import { withTimeout } from "../utils/timeout.js";

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();
  if (!email) throw new Error("Usage: tsx src/scripts/createAdmin.ts <email>");

  const db = getDb();
  const app = getApps()[0];
  if (!db || !app) throw new Error("Firebase Admin is unavailable");

  const user = await withTimeout(getAuth(app).getUserByEmail(email), 8000);
  await withTimeout(
    db.collection("users").doc(user.uid).set({ role: "admin" }, { merge: true }),
    8000,
  );
  logger.info(`Admin role granted to ${email}`);
}

void main().catch((error: unknown) => {
  logger.error("Could not create admin account", error);
  process.exitCode = 1;
});
