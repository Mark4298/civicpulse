import type { RequestHandler } from "express";
import { INDIA_SEED_DISTRICTS, listDistricts } from "../services/districts.js";
import { createAccount, getUserProfile, promoteAdmin, type SignupInput } from "../services/auth.js";
import { HttpError } from "../utils/httpError.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function boundedString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(400, `${name} is required and must be at most ${maxLength} characters`);
  }
  return value.trim();
}

function signupInput(body: unknown): SignupInput {
  if (!isRecord(body)) throw new HttpError(400, "Request body must be a JSON object");
  const email = boundedString(body.email, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "email is invalid");
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
    throw new HttpError(400, "password must be between 8 and 128 characters");
  }
  return {
    email,
    password: body.password,
    displayName: boundedString(body.displayName, "displayName", 100),
    state: boundedString(body.state, "state", 100),
    district: boundedString(body.district, "district", 100),
  };
}

export const signup: RequestHandler = async (request, response, next) => {
  try {
    response.status(201).json({ user: await createAccount(signupInput(request.body)) });
  } catch (error) {
    next(error);
  }
};

export const me: RequestHandler = async (request, response, next) => {
  try {
    if (!request.user) throw new HttpError(401, "Authentication required");
    response.json({ user: await getUserProfile(request.user.uid) });
  } catch (error) {
    next(error);
  }
};

export const promote: RequestHandler = async (request, response, next) => {
  try {
    if (!isRecord(request.body)) throw new HttpError(400, "Request body must be a JSON object");
    const uid = boundedString(request.body.uid, "uid", 128);
    response.json({ user: await promoteAdmin(uid) });
  } catch (error) {
    next(error);
  }
};

export const signupDistricts: RequestHandler = async (_request, response, next) => {
  try {
    const loaded = (await listDistricts()).filter(
      (district) => district.country === "India" && typeof district.state === "string",
    );
    const districts = loaded.length > 0 ? loaded : INDIA_SEED_DISTRICTS;
    response.json({ districts });
  } catch (error) {
    next(error);
  }
};