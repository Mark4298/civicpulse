import { Router } from "express";
import multer from "multer";
import {
  createMessage,
  createText,
  createVoice,
  getById,
  list,
  listMine,
  suggestLocation,
  updateStatus,
} from "../controllers/complaints.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { complaintRateLimit } from "../middleware/rateLimit.js";
import { HttpError } from "../utils/httpError.js";

const router = Router();
const supportedAudio = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
]);
const supportedPhotos = new Set(["image/jpeg", "image/png", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 4 },
  fileFilter: (_request, file, callback) => {
    if (file.fieldname === "audio") {
      if (!supportedAudio.has(file.mimetype)) {
        callback(new HttpError(415, "Audio must be WebM, Ogg, WAV, or FLAC"));
        return;
      }
    } else if (file.fieldname === "photos") {
      if (!supportedPhotos.has(file.mimetype)) {
        callback(new HttpError(415, "Photos must be JPEG, PNG, or WebP"));
        return;
      }
    } else {
      callback(new HttpError(400, `Unexpected field: ${file.fieldname}`));
      return;
    }
    callback(null, true);
  },
});

router.post("/text", complaintRateLimit, requireAuth, upload.array("photos", 3), createText);
router.post(
  "/voice",
  complaintRateLimit,
  requireAuth,
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "photos", maxCount: 3 },
  ]),
  createVoice,
);
router.post("/message", complaintRateLimit, requireAuth, upload.array("photos", 3), createMessage);
router.get("/mine", requireAuth, listMine);
router.get("/", ...requireAdmin, list);
router.get("/location-suggestion", complaintRateLimit, suggestLocation);
router.get("/:id", ...requireAdmin, getById);
router.patch("/:id/status", ...requireAdmin, updateStatus);

export default router;
