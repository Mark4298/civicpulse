import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getDb } from "../config/firebase.js";
import { logger } from "../utils/logger.js";
import { withTimeout } from "../utils/timeout.js";

const maxPhotoBytes = 200 * 1024;

async function compressPhoto(input: Buffer): Promise<Buffer> {
  // Compression is bounded to 24 sharp passes per photo.
  for (const dimension of [1000, 800, 640, 480]) {
    for (const quality of [70, 60, 50, 40, 30, 20]) {
      const compressed = await sharp(input)
        .rotate()
        .resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (compressed.length <= maxPhotoBytes) return compressed;
    }
  }
  throw new Error("A photo could not be compressed under 200 KB.");
}

export async function uploadPhotos(
  complaintId: string,
  files: Express.Multer.File[]
): Promise<string[]> {
  const photoUrls: string[] = [];
  const db = getDb();
  
  if (!db) {
    logger.warn("Firestore unavailable; report photos could not be stored");
    return [];
  }

  const storageBucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  let storageBucket: ReturnType<ReturnType<typeof getStorage>["bucket"]> | undefined;
  if (storageBucketName && getApps()[0]) {
    try {
      const bucket = getStorage(getApps()[0]).bucket(storageBucketName);
      const [exists] = await withTimeout(bucket.exists(), 5000);
      if (exists) storageBucket = bucket;
      else logger.warn("Configured Firebase Storage bucket is unreachable; using Firestore photos");
    } catch (error) {
      logger.warn(
        `Firebase Storage unavailable (${error instanceof Error ? error.constructor.name : typeof error}); using Firestore photos`,
      );
    }
  }

  for (const [index, file] of files.slice(0, 3).entries()) {
    const buffer = await compressPhoto(file.buffer);
    const photoDocId = `photo_${index}`;
    let photoUrl: string | undefined;
    if (storageBucket) {
      const objectPath = `complaints/${complaintId}/photos/${photoDocId}.jpg`;
      const token = randomUUID();
      try {
        const storageFile = storageBucket.file(objectPath);
        await withTimeout(
          storageFile.save(buffer, {
            resumable: false,
            metadata: {
              contentType: "image/jpeg",
              metadata: { firebaseStorageDownloadTokens: token },
            },
          }),
          8000,
        );
        photoUrl =
          `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storageBucket.name)}` +
          `/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
      } catch (error) {
        logger.warn(
          `Firebase Storage upload failed (${error instanceof Error ? error.constructor.name : typeof error}); using Firestore photos`,
        );
      }
    }

    if (!photoUrl) {
      photoUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;
      await withTimeout(
        db.collection("complaints").doc(complaintId).collection("photos").doc(photoDocId).set({
          dataUri: photoUrl,
          timestamp: new Date().toISOString(),
        }),
        5000,
      );
    }
    photoUrls.push(photoUrl);
  }

  return photoUrls;
}
