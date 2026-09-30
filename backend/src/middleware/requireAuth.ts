import type { NextFunction, Request, RequestHandler, Response } from "express";
import { verifyIdToken, type AuthenticatedUser } from "../services/auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

async function authenticate(
  request: Request,
  response: Response,
  next: NextFunction,
  required: boolean,
): Promise<void> {
  const authorization = request.header("authorization");
  if (!authorization && !required) {
    next();
    return;
  }
  const match = authorization ? /^Bearer\s+(.+)$/i.exec(authorization) : null;
  const token = match?.[1]?.trim();
  if (!token) {
    response.status(401).json({ error: "Please sign in to submit a report" });
    return;
  }

  try {
    request.user = await verifyIdToken(token);
    next();
  } catch (error) {
    response.status(401).json({ error: "Please sign in to submit a report" });
  }
}

export const optionalAuth: RequestHandler = (request, response, next) => {
  void authenticate(request, response, next, false);
};

export const requireAuth: RequestHandler = (request, response, next) => {
  void authenticate(request, response, next, true);
};