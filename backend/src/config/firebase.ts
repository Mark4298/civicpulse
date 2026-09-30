import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { logger } from "../utils/logger.js";

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
dotenv.config({ path: envPath });
logger.info(`Environment file loaded: ${envPath}`);

const firebaseEnvStatus = (name: string): string => (process.env[name]?.trim() ? "present" : "missing");
logger.info(
  `Firebase credential env check: FIREBASE_PROJECT_ID=${firebaseEnvStatus("FIREBASE_PROJECT_ID")}, ` +
    `FIREBASE_CLIENT_EMAIL=${firebaseEnvStatus("FIREBASE_CLIENT_EMAIL")}, ` +
    `FIREBASE_PRIVATE_KEY=${firebaseEnvStatus("FIREBASE_PRIVATE_KEY")}`,
);
const firestoreConfigured = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]
  .every((name) => Boolean(process.env[name]?.trim()));
const geminiEnabled = Boolean(process.env.GEMINI_API_KEY?.trim());
const photoProvider = process.env.FIREBASE_STORAGE_BUCKET?.trim()
  ? "Storage (if reachable), Firestore photos fallback"
  : "Firestore photos";
logger.info(
  `Integrations: Firestore ${firestoreConfigured ? "enabled" : "disabled"}; ` +
    `Gemini ${geminiEnabled ? `enabled (${process.env.GEMINI_MODEL || "gemini-3.8-flash"})` : "disabled"}; ` +
    `${photoProvider}; Web Speech (client) + Gemini transcription`,
);

let firestore: Firestore | undefined;

export function getDb(): Firestore | undefined {
  if (firestore) return firestore;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return undefined;

  try {
    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        ...(process.env.FIREBASE_STORAGE_BUCKET?.trim()
          ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET.trim() }
          : {}),
      });
    firestore = getFirestore(app);
    return firestore;
  } catch (error) {
    logger.error("Firebase initialization failed; using in-memory demo storage", error);
    return undefined;
  }
}

export const db = getDb();
