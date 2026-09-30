import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { EngineInput, EngineOutput } from "./engineFallback.js";
import { runEngineFallback } from "./engineFallback.js";
import { logger } from "../utils/logger.js";

const timeoutMs = 3000;

function binaryPath(): string {
  if (process.env.ENGINE_BINARY) return process.env.ENGINE_BINARY;
  const filename = process.platform === "win32" ? "civicpulse-engine.exe" : "civicpulse-engine";
  const candidates = [
    resolve(process.cwd(), "../engine", filename),
    resolve(process.cwd(), "engine", filename),
    resolve(process.cwd(), "../../engine", filename),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

function runBinary(input: EngineInput): Promise<EngineOutput> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(binaryPath(), [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error, output?: EngineOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(error);
      else resolvePromise(output!);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error(`Engine timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 5_000_000) finish(new Error("Engine output exceeded 5 MB"));
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (code !== 0) {
        finish(new Error(`Engine exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(stdout);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("Engine returned a non-object JSON value");
        }
        finish(undefined, parsed as EngineOutput);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stdin.once("error", (error) => finish(error));
    child.stdin.end(JSON.stringify(input));
  });
}

export async function runEngine(input: EngineInput): Promise<EngineOutput> {
  try {
    return await runBinary(input);
  } catch (error) {
    logger.error(`C++ engine ${input.cmd} failed; using TypeScript fallback`, error);
    return runEngineFallback(input);
  }
}
