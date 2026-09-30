import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import authRouter from "./routes/auth.js";
import complaintsRouter from "./routes/complaints.js";
import hotspotsRouter from "./routes/hotspots.js";
import { HttpError } from "./utils/httpError.js";
import { logger } from "./utils/logger.js";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.disable("x-powered-by");
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  }),
);
app.use(compression());
app.use(express.json({ limit: "64kb" }));

app.use("/api/auth", authRouter);
app.use("/api/complaints", complaintsRouter);
app.use("/api", hotspotsRouter);

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    void _next;
    const parserStatus =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status < 500
        ? error.status
        : undefined;
    const statusCode =
      error instanceof HttpError
        ? error.statusCode
        : error instanceof multer.MulterError
          ? error.code === "LIMIT_FILE_SIZE"
            ? 413
            : 400
          : (parserStatus ?? 500);
    if (statusCode >= 500) logger.error("Unhandled request error", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    response
      .status(statusCode)
      .json({ error: statusCode === 500 ? "Internal server error" : message });
  },
);

app.listen(port, () => {
  logger.info(`API listening on port ${port}`);
});
