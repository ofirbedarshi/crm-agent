#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const hookStateDir = path.join(repoRoot, ".cursor", "hooks", ".state");
const stateFile = path.join(hookStateDir, "eval-baseline.json");
const latestSummaryFile = path.join(hookStateDir, "latest-eval-summary.json");
const evalResultsDir = path.join(repoRoot, "src", "eval", "results");
const NOISE_THRESHOLD = 0.25;
const WARNING_THRESHOLD = 0.75;
const LATENCY_NOISE_THRESHOLD_MS = 250;
const LATENCY_WARNING_THRESHOLD_MS = 1000;

const SOURCE_INCLUDE = /^src\/.+\.(ts|tsx|js|mjs|cjs)$/i;
const SOURCE_EXCLUDE = [
  /^src\/eval\/results\//i,
  /^src\/cli\//i,
  /\.test\.(ts|tsx|js)$/i,
  /\.spec\.(ts|tsx|js)$/i
];
const BACKEND_KEY_PATHS = [
  /^src\/parser\//i,
  /^src\/pipeline\//i,
  /^src\/validation\//i,
  /^src\/crm\//i,
  /^src\/types\/parser\.ts$/i
];

function collectStrings(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

function looksLikeBackendLogicFile(filePath) {
  const normalized = normalizeToRepoRelative(filePath);
  if (!SOURCE_INCLUDE.test(normalized)) return false;
  if (SOURCE_EXCLUDE.some((pattern) => pattern.test(normalized))) return false;
  if (!BACKEND_KEY_PATHS.some((pattern) => pattern.test(normalized))) return false;
  return true;
}

function normalizeToRepoRelative(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  const repoNormalized = repoRoot.replace(/\\/g, "/");

  if (normalized.startsWith(repoNormalized + "/")) {
    return normalized.slice(repoNormalized.length + 1);
  }

  const srcIndex = normalized.toLowerCase().lastIndexOf("/src/");
  if (srcIndex !== -1) {
    return normalized.slice(srcIndex + 1);
  }

  return normalized.replace(/^\.?\//, "");
}

function shouldRunFromHookInput(payload) {
  const strings = collectStrings(payload);
  const pathCandidates = strings.filter((value) => typeof value === "string" && value.includes("/"));

  if (pathCandidates.some((s) => looksLikeBackendLogicFile(s))) {
    return true;
  }

  if (pathCandidates.length > 0) {
    return false;
  }

  return getChangedSourceFiles().some((filePath) => looksLikeBackendLogicFile(filePath));
}

function getChangedSourceFiles() {
  const diff = spawnSync("git", ["diff", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env
  });

  if (diff.status !== 0 || !diff.stdout) {
    return [];
  }

  return diff.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function getLatestEvalJsonFile() {
  if (!existsSync(evalResultsDir)) return null;
  const files = readdirSync(evalResultsDir)
    .filter((name) => name.startsWith("evaluation-") && name.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  return path.join(evalResultsDir, files[files.length - 1]);
}

function printSummary(message) {
  process.stderr.write(`\n[crm-eval-hook] ${message}\n`);
}

function withLatency(message, durationMs) {
  return `${message} [latency: ${durationMs}ms]`;
}

function buildLatencyAssessment(previousLatencyMs, currentLatencyMs) {
  if (previousLatencyMs === null) {
    return `Latency baseline established at ${currentLatencyMs}ms.`;
  }

  const delta = currentLatencyMs - previousLatencyMs;
  const absDelta = Math.abs(delta);

  if (absDelta < LATENCY_NOISE_THRESHOLD_MS) {
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return (
      `Latency change is within noise band (${direction} ${absDelta}ms). ` +
      `No action needed. (${previousLatencyMs}ms -> ${currentLatencyMs}ms)`
    );
  }

  if (delta > 0 && absDelta < LATENCY_WARNING_THRESHOLD_MS) {
    return (
      `Latency warning: regressed by ${absDelta}ms (${previousLatencyMs}ms -> ${currentLatencyMs}ms). ` +
      "Consider rerunning to confirm before action."
    );
  }

  if (delta >= LATENCY_WARNING_THRESHOLD_MS) {
    return (
      `Latency CRITICAL regression: ${absDelta}ms (${previousLatencyMs}ms -> ${currentLatencyMs}ms). ` +
      "Investigate before proceeding."
    );
  }

  return `Latency improved by ${absDelta}ms (${previousLatencyMs}ms -> ${currentLatencyMs}ms).`;
}

function persistLatestSummary(message, severity = "info", durationMs = 0, extra = {}) {
  const messageWithLatency = withLatency(message, durationMs);
  mkdirSync(hookStateDir, { recursive: true });
  writeFileSync(
    latestSummaryFile,
    JSON.stringify(
      {
        message: messageWithLatency,
        severity,
        duration_ms: durationMs,
        created_at: new Date().toISOString(),
        ...extra
      },
      null,
      2
    ),
    "utf8"
  );
}

function main() {
  const startedAt = process.hrtime.bigint();
  const elapsedMs = () => Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
  const inputRaw = readFileSync(0, "utf8");
  let payload = {};
  try {
    payload = inputRaw ? JSON.parse(inputRaw) : {};
  } catch {
    payload = {};
  }

  if (!shouldRunFromHookInput(payload)) {
    const msg = "Skipped: edit does not look like backend logic affecting parser flow.";
    printSummary(msg);
    persistLatestSummary(msg, "skip", elapsedMs());
    return;
  }

  printSummary("Core backend change detected. Running parser quality evaluation...");

  const cmd = spawnSync("npm", ["run", "eval:llm"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env
  });

  if (cmd.status !== 0) {
    const msg = "Evaluation failed to run. Please run `npm run eval:llm` manually.";
    printSummary(msg);
    persistLatestSummary(msg, "error", elapsedMs());
    if (cmd.stderr) process.stderr.write(cmd.stderr);
    return;
  }

  const latestReport = getLatestEvalJsonFile();
  if (!latestReport) {
    const msg = "No evaluation report found after run.";
    printSummary(msg);
    persistLatestSummary(msg, "error", elapsedMs());
    return;
  }

  const report = readJsonIfExists(latestReport);
  if (!report || typeof report.average_score !== "number") {
    const msg = "Could not parse evaluation average score from latest report.";
    printSummary(msg);
    persistLatestSummary(msg, "error", elapsedMs());
    return;
  }

  const current = report.average_score;
  const previousState = readJsonIfExists(stateFile);
  const previous = previousState && typeof previousState.average_score === "number"
    ? previousState.average_score
    : null;
  const previousLatencyMs = previousState && typeof previousState.latency_ms === "number"
    ? previousState.latency_ms
    : null;
  const currentLatencyMs = elapsedMs();
  const latencyAssessment = buildLatencyAssessment(previousLatencyMs, currentLatencyMs);

  mkdirSync(hookStateDir, { recursive: true });
  writeFileSync(
    stateFile,
    JSON.stringify(
      {
        average_score: current,
        latency_ms: currentLatencyMs,
        report_file: latestReport,
        updated_at: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );

  if (previous === null) {
    const msg = `Evaluation complete. Average score: ${current.toFixed(2)} (baseline established). ${latencyAssessment}`;
    printSummary(msg);
    persistLatestSummary(msg, "info", currentLatencyMs, {
      average_score: current,
      previous_average_score: null,
      latency_ms: currentLatencyMs,
      previous_latency_ms: null,
      report_file: latestReport
    });
    return;
  }

  const delta = Number((current - previous).toFixed(2));
  const absDelta = Math.abs(delta);

  if (absDelta < NOISE_THRESHOLD) {
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const msg =
      `Score change is within noise band (${direction} ${absDelta.toFixed(2)}). ` +
      `No action needed. (${previous.toFixed(2)} -> ${current.toFixed(2)}) ` +
      latencyAssessment;
    printSummary(msg);
    persistLatestSummary(msg, "info", currentLatencyMs, {
      average_score: current,
      previous_average_score: previous,
      latency_ms: currentLatencyMs,
      previous_latency_ms: previousLatencyMs,
      report_file: latestReport
    });
    return;
  }

  if (delta < 0 && absDelta < WARNING_THRESHOLD) {
    const msg =
      `Score warning: regressed by ${absDelta.toFixed(2)} (${previous.toFixed(2)} -> ${current.toFixed(
        2
      )}). Consider rerunning to confirm before action. ${latencyAssessment}`;
    printSummary(msg);
    persistLatestSummary(msg, "warning", currentLatencyMs, {
      average_score: current,
      previous_average_score: previous,
      latency_ms: currentLatencyMs,
      previous_latency_ms: previousLatencyMs,
      report_file: latestReport
    });
    return;
  }

  if (delta <= -WARNING_THRESHOLD) {
    const msg =
      `Score CRITICAL regression: ${absDelta.toFixed(2)} (${previous.toFixed(2)} -> ${current.toFixed(
        2
      )}). Investigate before proceeding. ${latencyAssessment}`;
    printSummary(msg);
    persistLatestSummary(msg, "critical", currentLatencyMs, {
      average_score: current,
      previous_average_score: previous,
      latency_ms: currentLatencyMs,
      previous_latency_ms: previousLatencyMs,
      report_file: latestReport
    });
    return;
  }

  if (delta > 0) {
    const msg =
      `Score improved by ${delta.toFixed(2)} (${previous.toFixed(2)} -> ${current.toFixed(2)}). ` +
      latencyAssessment;
    printSummary(msg);
    persistLatestSummary(msg, "info", currentLatencyMs, {
      average_score: current,
      previous_average_score: previous,
      latency_ms: currentLatencyMs,
      previous_latency_ms: previousLatencyMs,
      report_file: latestReport
    });
    return;
  }

  const msg = `Score unchanged at ${current.toFixed(2)}. ${latencyAssessment}`;
  printSummary(msg);
  persistLatestSummary(msg, "info", currentLatencyMs, {
    average_score: current,
    previous_average_score: previous,
    latency_ms: currentLatencyMs,
    previous_latency_ms: previousLatencyMs,
    report_file: latestReport
  });
}

main();
