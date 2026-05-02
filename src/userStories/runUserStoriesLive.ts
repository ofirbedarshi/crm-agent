/**
 * Manual live check: runs user-story prompts through the real OpenAI parser + full CRM pipeline.
 * Requires OPENAI_API_KEY. Does not use Vitest mocks.
 *
 * Usage: npm run eval:user-stories
 */

import "dotenv/config";
import { getDemoCrmState, resetDemoCrmStore } from "../crm/demoCrmStore";
import { getFakeCrmState, resetFakeCrm } from "../crm/fakeCrmAdapter";
import { runCrmAgent } from "../pipeline/runCrmAgent";
import {
  assertUs001PipelineLive,
  assertUs002PipelineLive,
  assertUs003PipelineLive,
  type PipelineStoryContext
} from "./assertUserStoryPipeline";
import {
  US_001_BUYER_FROM_FACEBOOK,
  US_002_SELLER_LISTING_MEETING,
  US_003_VISIT_JORDAN_12
} from "./userStoryPrompts";

interface StoryRun {
  id: string;
  prompt: string;
  /** Run after reset — e.g. seed CRM so the real parser sees "### מצב CRM נוכחי". */
  seed?: () => void;
  assert: (ctx: PipelineStoryContext) => void;
}

const STORIES: StoryRun[] = [
  { id: "US-001", prompt: US_001_BUYER_FROM_FACEBOOK, assert: assertUs001PipelineLive },
  { id: "US-002", prompt: US_002_SELLER_LISTING_MEETING, assert: assertUs002PipelineLive },
  { id: "US-003", prompt: US_003_VISIT_JORDAN_12, assert: assertUs003PipelineLive }
];

function printJson(label: string, value: unknown): void {
  console.log(`${label}:\n${JSON.stringify(value, null, 2)}`);
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("Missing OPENAI_API_KEY. Set it in the environment or .env, then rerun.");
    process.exit(1);
  }

  console.log("User story live evaluation (real parseMessage → runCrmAgent)\n");

  let failures = 0;

  for (const story of STORIES) {
    console.log("\n" + "=".repeat(80));
    console.log(`${story.id}`);
    console.log("-".repeat(80));
    console.log("PROMPT:\n" + story.prompt + "\n");

    resetFakeCrm();
    resetDemoCrmStore();
    story.seed?.();

    const started = Date.now();
    const result = await runCrmAgent({
      rawMessage: story.prompt,
      pipelineInput: story.prompt,
      historyCount: 0
    });
    const elapsed = Date.now() - started;

    printJson("parsed (actions + questions)", {
      actions: result.parsed.actions,
      missing_info: result.parsed.missing_info,
      clarification_questions: result.parsed.clarification_questions
    });
    printJson("validActions (post validation + resolve)", result.validActions);
    printJson("fakeCrm snapshot", getFakeCrmState());
    printJson("demoCrm snapshot", getDemoCrmState());
    console.log(`\nreply (${elapsed}ms):\n${result.response}\n`);

    const ctx: PipelineStoryContext = {
      result,
      fakeCrm: getFakeCrmState(),
      demoCrm: getDemoCrmState()
    };

    try {
      story.assert(ctx);
      console.log(`✓ ${story.id} PASS`);
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ ${story.id} FAIL: ${message}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  if (failures > 0) {
    console.error(`Done: ${failures} story/stories failed.`);
    process.exit(1);
  }
  console.log("Done: all user stories passed (live LLM).");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
