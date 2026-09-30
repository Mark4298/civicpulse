import { Router } from "express";
import multer from "multer";
import { getAiHealth, getHotspots, getStats } from "../controllers/hotspots.js";
import { previewClassification, transcribeReportAudio } from "../controllers/complaints.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { complaintRateLimit } from "../middleware/rateLimit.js";
import { HttpError } from "../utils/httpError.js";

const router = Router();
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype.startsWith("audio/")) {
      callback(new HttpError(415, "The uploaded file must be audio"));
      return;
    }
    callback(null, true);
  },
});

router.get("/hotspots", getHotspots);
router.get("/stats", getStats);
router.get("/health/ai", ...requireAdmin, getAiHealth);
router.post("/classify/preview", complaintRateLimit, requireAuth, previewClassification);
router.post(
  "/transcribe",
  complaintRateLimit,
  requireAuth,
  audioUpload.single("audio"),
  transcribeReportAudio,
);

export default router;
