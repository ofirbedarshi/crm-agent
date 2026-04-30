#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const hookStateDir = path.join(repoRoot, ".cursor", "hooks", ".state");
const stateFile = path.join(hookStateDir, "eval-baseline.json");
const evalResultsDir = path.join(repoRoot, "src", "eval", "results");
const NOISE_THRESHOLD = 0.25;
const WARNING_THRESHOLD = 0.75;

const SOURCE_INCLUDE = /^src\/.+\.(ts|tsx|js|mjs|cjs)$/i;
const SOURCE_EXCLUDE = [
  /^src\/eval\/results\//i,
  /^src\/cli\//i,
  /\.test\.(ts|tsx|js)$/i,
  /\.spec\.(ts|tsx|js)$/i
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
  const normalized = filePath.replace(/\\/g, "/");
  if (!SOURCE_INCLUDE.test(normalized)) return false;
  if (SOURCE_EXCLUDE.some((pattern) => pattern.test(normalized))) return false;
  return true;
}

function shouldRunFromHookInput(payload) {
  const strings = collectStrings(payload);
  return strings.some((s) => looksLikeBackendLogicFile(s));
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

function main() {
  const inputRaw = readFileSync(0, "utf8");
  let payload = {};
  try {
    payload = inputRaw ? JSON.parse(inputRaw) : {};
  } catch {
    payload = {};
  }

  if (!shouldRunFromHookInput(payload)) {
    printSummary("Skipped: edit does not look like backend logic affecting parser flow.");
    return;
  }

  printSummary("Core backend change detected. Running parser quality evaluation...");

  const cmd = spawnSync("npm", ["run", "eval:llm"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env
  });

  if (cmd.status !== 0) {
    printSummary("Evaluation failed to run. Please run `npm run eval:llm` manually.");
    if (cmd.stderr) process.stderr.write(cmd.stderr);
    return;
  }

  const latestReport = getLatestEvalJsonFile();
  if (!latestReport) {
    printSummary("No evaluation report found after run.");
    return;
  }

  const report = readJsonIfExists(latestReport);
  if (!report || typeof report.average_score !== "number") {
    printSummary("Could not parse evaluation average score from latest report.");
    return;
  }

  const current = report.average_score;
  const previousState = readJsonIfExists(stateFile);
  const previous = previousState && typeof previousState.average_score === "number"
    ? previousState.average_score
    : null;

  mkdirSync(hookStateDir, { recursive: true });
  writeFileSync(
    stateFile,
    JSON.stringify(
      {
        average_score: current,
        report_file: latestReport,
        updated_at: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );

  if (previous === null) {
    printSummary(
      `Evaluation complete. Average score: ${current.toFixed(2)} (baseline established).`
    );
    return;
  }

  const delta = Number((current - previous).toFixed(2));
  const absDelta = Math.abs(delta);

  if (absDelta < NOISE_THRESHOLD) {
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    printSummary(
      `Score change is within noise band (${direction} ${absDelta.toFixed(2)}). ` +
        `No action needed. (${previous.toFixed(2)} -> ${current.toFixed(2)})`
    );
    return;
  }

  if (delta < 0 && absDelta < WARNING_THRESHOLD) {
    printSummary(
      `Score warning: regressed by ${absDelta.toFixed(2)} (${previous.toFixed(2)} -> ${current.toFixed(
        2
      )}). Consider rerunning to confirm before action.`
    );
    return;
  }

  if (delta <= -WARNING_THRESHOLD) {
    printSummary(
      `Score CRITICAL regression: ${absDelta.toFixed(2)} (${previous.toFixed(2)} -> ${current.toFixed(
        2
      )}). Investigate before proceeding.`
    );
    return;
  }

  if (delta > 0) {
    printSummary(
      `Score improved by ${delta.toFixed(2)} (${previous.toFixed(2)} -> ${current.toFixed(2)}).`
    );
    return;
  }

  printSummary(`Score unchanged at ${current.toFixed(2)}.`);
}

main();
