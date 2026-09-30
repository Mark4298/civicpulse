import { createHash } from "node:crypto";
import type { Request, Response } from "express";

export function sendJsonWithEtag(request: Request, response: Response, value: unknown): void {
  const body = JSON.stringify(value);
  const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
  response.setHeader("ETag", etag);
  response.setHeader("Cache-Control", "no-cache");
  const requested = request.get("if-none-match");
  if (requested?.split(",").some((tag) => tag.trim() === etag || tag.trim() === "*")) {
    response.status(304).end();
    return;
  }
  response.type("application/json").send(body);
}
