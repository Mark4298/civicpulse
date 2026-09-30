import { FieldPath, FieldValue } from "firebase-admin/firestore";
import type { Complaint, ComplaintStatus } from "@civicpulse/shared";
import { getDb } from "../config/firebase.js";
import { logger } from "./logger.js";
import { withTimeout } from "./timeout.js";
import { HttpError } from "./httpError.js";
import { invalidateHotspotsCache } from "./ttlCache.js";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const memoryStore = new Map<string, Complaint>();
const collectionName = "complaints";
const referenceIdPattern = /^CP-\d{4}-\d{6}$/;

function complaintFromData(id: string, value: FirebaseFirestore.DocumentData): Complaint {
  return { ...value, id } as Complaint;
}

async function findComplaintDocument(
  collection: FirebaseFirestore.CollectionReference,
  id: string,
): Promise<
  FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot | undefined
> {
  const direct = await withTimeout(collection.doc(id).get(), 8000);
  if (direct.exists) return direct;
  if (!referenceIdPattern.test(id)) return undefined;
  const byReference = await withTimeout(
    collection.where("referenceId", "==", id).limit(1).get(),
    8000,
  );
  return byReference.docs[0];
}

function encodeCursor(id: string): string {
  return Buffer.from(id).toString("base64url");
}

function decodeCursor(cursor: string): string {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (!decoded || Buffer.from(decoded).toString("base64url") !== cursor) throw new Error();
    return decoded;
  } catch {
    throw new HttpError(400, "Invalid complaints cursor");
  }
}

export async function saveComplaint(complaint: Complaint): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      await withTimeout(db.collection(collectionName).doc(complaint.id).set(complaint), 8000);
      memoryStore.set(complaint.id, complaint);
      invalidateHotspotsCache();
      return;
    } catch (error) {
      logger.error("Firestore complaint write failed; preserving complaint in memory", error);
    }
  }
  memoryStore.set(complaint.id, complaint);
  invalidateHotspotsCache();
}

async function readFixtureComplaints(): Promise<Complaint[]> {
  const path = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../engine/sample/complaints.json",
  );
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(value)) throw new Error("Complaint fixture must contain an array");
  return value as Complaint[];
}

export async function listComplaintsForAnalytics(): Promise<Complaint[]> {
  const db = getDb();
  if (db) {
    try {
      const snapshot = await withTimeout(db.collection(collectionName).get(), 8000);
      const complaints = snapshot.docs.map((document) =>
        complaintFromData(document.id, document.data()),
      );
      const existingIds = new Set(snapshot.docs.map((document) => document.id));
      for (const complaint of memoryStore.values()) {
        if (!existingIds.has(complaint.id)) complaints.push(complaint);
      }
      return complaints;
    } catch (error) {
      logger.error("Firestore analytics read failed; using local fixture and memory", error);
    }
  }

  const byId = new Map(
    (await readFixtureComplaints()).map((complaint) => [complaint.id, complaint]),
  );
  for (const complaint of memoryStore.values()) byId.set(complaint.id, complaint);
  return [...byId.values()];
}

export async function listComplaints(limit: number, cursor?: string, userId?: string) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const db = getDb();
  if (db) {
    try {
      const collection = db.collection(collectionName);
      let query = collection.orderBy("timestamp", "desc").orderBy(FieldPath.documentId(), "asc");
      if (userId !== undefined) {
        query = collection
          .where("userId", "==", userId)
          .orderBy("timestamp", "desc")
          .orderBy(FieldPath.documentId(), "asc");
      }
      if (cursor !== undefined) {
        const cursorDocument = await withTimeout(collection.doc(decodeCursor(cursor)).get(), 8000);
        if (!cursorDocument.exists) throw new HttpError(400, "Cursor complaint was not found");
        if (userId !== undefined && cursorDocument.data()?.userId !== userId) {
          throw new HttpError(400, "Cursor complaint was not found");
        }
        query = query.startAfter(cursorDocument);
      }
      const snapshot = await withTimeout(query.limit(safeLimit + 1).get(), 8000);
      const documents = snapshot.docs.slice(0, safeLimit);
      return {
        complaints: documents.map((document) => complaintFromData(document.id, document.data())),
        nextCursor:
          snapshot.docs.length > safeLimit
            ? encodeCursor(documents[documents.length - 1]!.id)
            : null,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      logger.error("Firestore complaint query failed; using memory store", error);
    }
  }

  const sorted = [...memoryStore.values()]
    .filter((complaint) => userId === undefined || complaint.userId === userId)
    .sort(
      (left, right) =>
        right.timestamp.localeCompare(left.timestamp) || left.id.localeCompare(right.id),
    );
  const cursorId = cursor === undefined ? undefined : decodeCursor(cursor);
  const cursorIndex = cursorId ? sorted.findIndex((item) => item.id === cursorId) : -1;
  if (cursorId && cursorIndex < 0) throw new HttpError(400, "Cursor complaint was not found");
  const start = cursorIndex + 1;
  const page = sorted.slice(start, start + safeLimit + 1);
  const hasMore = page.length > safeLimit;
  const complaints = page.slice(0, safeLimit);
  return {
    complaints,
    nextCursor: hasMore ? encodeCursor(complaints[complaints.length - 1]!.id) : null,
  };
}

export async function getComplaintById(id: string): Promise<Complaint> {
  const db = getDb();
  if (db) {
    try {
      const document = await findComplaintDocument(db.collection(collectionName), id);
      if (!document?.exists) {
        const memoryComplaint = findMemoryComplaint(id);
        if (memoryComplaint) return memoryComplaint;
        logger.error(`Complaint lookup failed for searched id ${id}`);
        throw new HttpError(404, "Complaint not found");
      }
      const complaint = complaintFromData(document.id, document.data() ?? {});
      memoryStore.set(complaint.id, complaint);
      return complaint;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      logger.error(`Firestore complaint lookup failed for searched id ${id}`, error);
      throw new HttpError(503, "Could not load complaint");
    }
  }
  const complaint =
    memoryStore.get(id) ??
    (referenceIdPattern.test(id)
      ? [...memoryStore.values()].find((item) => item.referenceId === id)
      : undefined);
  if (!complaint) {
    logger.error(`Complaint lookup failed for searched id ${id}`);
    throw new HttpError(404, "Complaint not found");
  }
  return complaint;
}

function findMemoryComplaint(id: string): Complaint | undefined {
  return (
    memoryStore.get(id) ??
    (referenceIdPattern.test(id)
      ? [...memoryStore.values()].find((item) => item.referenceId === id)
      : undefined)
  );
}

function updateMemoryComplaintStatus(
  id: string,
  status: ComplaintStatus,
  adminId: string,
  adminNote?: string,
): Complaint {
  const complaint = findMemoryComplaint(id);
  if (!complaint) {
    logger.error(`Complaint status update failed for searched id ${id}`);
    throw new HttpError(404, "Complaint not found");
  }
  const updatedAt = new Date().toISOString();
  const historyEntry = { status, updatedAt, adminId, ...(adminNote ? { note: adminNote } : {}) };
  const statusHistory = (complaint as Complaint & { statusHistory?: unknown[] }).statusHistory ?? [];
  const updated = {
    ...complaint,
    status,
    statusHistory: [...statusHistory, historyEntry],
    updatedAt,
    ...(adminNote ? { adminNote } : {}),
  } as Complaint;
  memoryStore.set(updated.id, updated);
  invalidateHotspotsCache();
  return updated;
}

export async function updateComplaintStatus(
  id: string,
  status: ComplaintStatus,
  adminId: string,
  adminNote?: string,
): Promise<Complaint> {
  const db = getDb();
  if (db) {
    try {
      const collection = db.collection(collectionName);
      const document = await findComplaintDocument(collection, id);
      if (!document?.exists) {
        return updateMemoryComplaintStatus(id, status, adminId, adminNote);
      }
      const reference = collection.doc(document.id);
      const updatedAt = new Date().toISOString();
      const historyEntry = {
        status,
        updatedAt,
        adminId,
        ...(adminNote ? { note: adminNote } : {}),
      };
      const complaint = await withTimeout(
        db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(reference);
          const value = snapshot.data();
          if (!snapshot.exists || !value) {
            logger.error(`Complaint status update failed for searched id ${id}`);
            throw new HttpError(404, "Complaint not found");
          }
          const statusHistory = Array.isArray(value.statusHistory) ? value.statusHistory : [];
          transaction.update(reference, {
            status,
            statusHistory: FieldValue.arrayUnion(historyEntry),
            updatedAt,
            ...(adminNote ? { adminNote } : {}),
          });
          return {
            ...complaintFromData(snapshot.id, value),
            status,
            statusHistory: [...statusHistory, historyEntry],
            updatedAt,
            ...(adminNote ? { adminNote } : {}),
          } as Complaint;
        }),
        8000,
      );
      memoryStore.set(complaint.id, complaint);
      invalidateHotspotsCache();
      return complaint;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      logger.error("Firestore complaint status update failed", error);
      throw new HttpError(503, "Could not update complaint status");
    }
  }

  return updateMemoryComplaintStatus(id, status, adminId, adminNote);
}
