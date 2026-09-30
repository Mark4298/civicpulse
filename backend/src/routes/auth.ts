import { Router } from "express";
import { me, promote, signup, signupDistricts } from "../controllers/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.get("/districts", signupDistricts);
router.post("/signup", signup);
router.post("/promote-admin", ...requireAdmin, promote);
router.get("/me", requireAuth, me);

export default router;