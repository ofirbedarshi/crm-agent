#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const hookStateDir = path.join(repoRoot, ".cursor", "hooks", ".state");
const latestSummaryFile = path.join(hookStateDir, "latest-eval-summary.json");
const sentMarkerFile = path.join(hookStateDir, "latest-eval-summary-sent.txt");

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readTextIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, "utf8").trim();
  } catch {
    return null;
  }
}

function main() {
  // Consume stdin to keep hook behavior consistent across events.
  try {
    readFileSync(0, "utf8");
  } catch {
    // no-op
  }

  const summary = readJsonIfExists(latestSummaryFile);
  if (!summary || typeof summary.message !== "string" || typeof summary.created_at !== "string") {
    return;
  }

  const alreadySentAt = readTextIfExists(sentMarkerFile);
  if (alreadySentAt === summary.created_at) {
    return;
  }

  const hookMessage = `[crm-eval-hook] ${summary.message}`;
  const output = {
    followup_message: `Append this line at the end of your response: "${hookMessage}"`
  };

  process.stdout.write(JSON.stringify(output));

  mkdirSync(hookStateDir, { recursive: true });
  writeFileSync(sentMarkerFile, summary.created_at, "utf8");
}

main();
