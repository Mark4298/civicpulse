import type { RequestHandler } from "express";
import { requireAuth } from "./requireAuth.js";

const adminOnly: RequestHandler = (request, response, next) => {
  if (request.user?.role !== "admin") {
    response.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
};

export const requireAdmin: RequestHandler[] = [requireAuth, adminOnly];