import { getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { UserProfile, UserRole } from "@civicpulse/shared";
import { getDb } from "../config/firebase.js";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";
import { withTimeout } from "../utils/timeout.js";

export type AuthenticatedUser = Pick<UserProfile, "uid" | "email" | "role">;

export interface SignupInput {
  email: string;
  password: string;
  displayName: string;
  state: string;
  district: string;
}

function getAdminClients() {
  const db = getDb();
  const app = getApps()[0];
  if (!db || !app) throw new HttpError(503, "Firebase Authentication is unavailable");
  return { auth: getAuth(app), db };
}

function errorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function roleFrom(value: unknown): UserRole {
  return value === "admin" ? "admin" : "citizen";
}

function toProfile(uid: string, value: Record<string, unknown>): UserProfile {
  return {
    uid,
    email: typeof value.email === "string" ? value.email : "",
    displayName: typeof value.displayName === "string" ? value.displayName : "",
    role: roleFrom(value.role),
    state: typeof value.state === "string" ? value.state : "",
    district: typeof value.district === "string" ? value.district : "",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
  };
}

export async function verifyIdToken(token: string): Promise<AuthenticatedUser> {
  const { auth, db } = getAdminClients();
  let decodedToken;
  try {
    decodedToken = await withTimeout(auth.verifyIdToken(token), 8000);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const code = errorCode(error);
    if (
      code === "auth/argument-error" ||
      code === "auth/id-token-expired" ||
      code === "auth/id-token-revoked" ||
      code === "auth/invalid-id-token"
    ) {
      throw new HttpError(401, "Invalid or expired authentication token");
    }
    logger.error("Firebase ID token verification failed", error);
    throw new HttpError(503, "Authentication verification is unavailable");
  }

  try {
    const profile = await withTimeout(db.collection("users").doc(decodedToken.uid).get(), 8000);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email ?? "",
      role: roleFrom(profile.data()?.role),
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error("Could not load authenticated user role", error);
    throw new HttpError(503, "Could not load authenticated user profile");
  }
}

export async function createAccount(input: SignupInput): Promise<UserProfile> {
  const { auth, db } = getAdminClients();
  let authUser;
  try {
    authUser = await withTimeout(
      auth.createUser({
        email: input.email,
        password: input.password,
        displayName: input.displayName,
      }),
      8000,
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const code = errorCode(error);
    if (code === "auth/email-already-exists") {
      throw new HttpError(409, "An account with this email already exists");
    }
    if (code === "auth/invalid-email" || code === "auth/invalid-password" || code === "auth/weak-password") {
      throw new HttpError(400, "Email or password does not meet Firebase requirements");
    }
    logger.error("Firebase Auth account creation failed", error);
    throw new HttpError(503, "Account registration is unavailable");
  }

  const profile: UserProfile = {
    uid: authUser.uid,
    email: input.email,
    displayName: input.displayName,
    role: "citizen",
    state: input.state,
    district: input.district,
    createdAt: new Date().toISOString(),
  };
  try {
    await withTimeout(db.collection("users").doc(authUser.uid).set(profile), 8000);
    return profile;
  } catch (error) {
    logger.error("Could not save signup profile; removing Auth account", error);
    try {
      await withTimeout(auth.deleteUser(authUser.uid), 8000);
    } catch (cleanupError) {
      logger.error("Could not remove incomplete Auth signup", cleanupError);
    }
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "Could not save user profile");
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile> {
  const { db } = getAdminClients();
  try {
    const snapshot = await withTimeout(db.collection("users").doc(uid).get(), 8000);
    const value = snapshot.data();
    if (!snapshot.exists || !value) throw new HttpError(404, "User profile not found");
    return toProfile(uid, value);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error("Could not load user profile", error);
    throw new HttpError(503, "Could not load user profile");
  }
}

export async function promoteAdmin(uid: string): Promise<UserProfile> {
  const { db } = getAdminClients();
  try {
    const reference = db.collection("users").doc(uid);
    const snapshot = await withTimeout(reference.get(), 8000);
    const value = snapshot.data();
    if (!snapshot.exists || !value) throw new HttpError(404, "User profile not found");
    await withTimeout(reference.update({ role: "admin" }), 8000);
    return toProfile(uid, { ...value, role: "admin" });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error("Could not promote user to admin", error);
    throw new HttpError(503, "Could not promote user");
  }
}