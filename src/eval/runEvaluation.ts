import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseMessage } from "../parser/parseMessage";
import type { ParseMessageResult } from "../types/parser";
import { evalInputs } from "./evalInputs";
import { JUDGE_SYSTEM_PROMPT } from "./judgePrompt";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const JUDGE_MODEL = "gpt-4o-mini";

interface JudgeResult {
  score: number;
  is_valid: boolean;
  issues: string[];
  suggestions: string[];
}

interface EvaluationRow {
  index: number;
  input: string;
  parser_output: ParseMessageResult | null;
  score: number;
  is_valid: boolean;
  issues: string[];
  suggestions: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeJudgeResult(raw: unknown): JudgeResult {
  if (!isRecord(raw)) {
    return {
      score: 0,
      is_valid: false,
      issues: ["Judge output is not a valid object"],
      suggestions: ["Check judge output format"]
    };
  }

  const score = typeof raw.score === "number" ? raw.score : 0;
  return {
    score: Math.max(0, Math.min(10, score)),
    is_valid: typeof raw.is_valid === "boolean" ? raw.is_valid : false,
    issues: toStringArray(raw.issues),
    suggestions: toStringArray(raw.suggestions)
  };
}

async function judgeOutput(input: string, output: ParseMessageResult): Promise<JudgeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const payload = {
    input,
    output
  };

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Judge OpenAI request failed with status ${response.status}`);
  }

  const parsedResponse = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = parsedResponse.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Judge response content missing");
  }

  let parsedJudge: unknown;
  try {
    parsedJudge = JSON.parse(content);
  } catch {
    throw new Error("Judge response is not valid JSON");
  }

  return normalizeJudgeResult(parsedJudge);
}

async function runEvaluation(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  console.log("Parser LLM Evaluation");
  console.log(`Total inputs: ${evalInputs.length}\n`);

  let totalScore = 0;
  const rows: EvaluationRow[] = [];

  for (let i = 0; i < evalInputs.length; i += 1) {
    const input = evalInputs[i]!;
    console.log("=".repeat(80));
    console.log(`Case ${i + 1}/${evalInputs.length}`);
    console.log(`Input: ${input}`);

    try {
      const output = await parseMessage(input);
      const judge = await judgeOutput(input, output);
      totalScore += judge.score;
      rows.push({
        index: i + 1,
        input,
        parser_output: output,
        score: judge.score,
        is_valid: judge.is_valid,
        issues: judge.issues,
        suggestions: judge.suggestions
      });

      console.log("Parser output:");
      console.log(JSON.stringify(output, null, 2));
      console.log(`Score: ${judge.score.toFixed(1)} / 10`);
      console.log(`Valid: ${judge.is_valid ? "YES" : "NO"}`);
      if (judge.issues.length > 0) {
        console.log("Issues:");
        for (const issue of judge.issues) {
          console.log(`- ${issue}`);
        }
      } else {
        console.log("Issues: none");
      }
      if (judge.suggestions.length > 0) {
        console.log("Suggestions:");
        for (const suggestion of judge.suggestions) {
          console.log(`- ${suggestion}`);
        }
      } else {
        console.log("Suggestions: none");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Evaluation error: ${message}`);
      rows.push({
        index: i + 1,
        input,
        parser_output: null,
        score: 0,
        is_valid: false,
        issues: [message],
        suggestions: ["Check parser/judge response and rerun"]
      });
    }
    console.log("");
  }

  const average = totalScore / evalInputs.length;
  console.log("=".repeat(80));
  console.log(`Average score: ${average.toFixed(2)} / 10`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.resolve(process.cwd(), "src/eval/results");
  await mkdir(outputDir, { recursive: true });

  const summary = {
    generated_at: new Date().toISOString(),
    total_inputs: evalInputs.length,
    average_score: Number(average.toFixed(2)),
    rows
  };
  const jsonPath = path.join(outputDir, `evaluation-${timestamp}.json`);
  await writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");

  const csvHeader = "index,input,parser_output,score,is_valid,issues,suggestions";
  const csvLines = rows.map((row) => {
    const issues = row.issues.join(" | ");
    const suggestions = row.suggestions.join(" | ");
    const cells = [
      row.index,
      row.input,
      row.parser_output ? JSON.stringify(row.parser_output) : "",
      row.score.toFixed(1),
      row.is_valid ? "true" : "false",
      issues,
      suggestions
    ];
    return cells
      .map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`)
      .join(",");
  });
  const csvPath = path.join(outputDir, `evaluation-${timestamp}.csv`);
  await writeFile(csvPath, [csvHeader, ...csvLines].join("\n"), "utf8");

  console.log(`Saved JSON report: ${jsonPath}`);
  console.log(`Saved CSV report: ${csvPath}`);
}

runEvaluation().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
