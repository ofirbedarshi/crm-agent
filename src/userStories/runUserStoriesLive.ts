/**
 * Manual live check: runs user-story prompts through the real OpenAI parser + full CRM pipeline.
 * Requires OPENAI_API_KEY. Does not use Vitest mocks.
 *
 * Usage: npm run eval:user-stories
 */

import "dotenv/config";
import { resetChatTranscript } from "../chat/chatTranscriptStore";
import { processDemoChatTurn } from "../chat/processDemoChatTurn";
import { getDemoCrmState, resetDemoCrmStore } from "../crm/demoCrmStore";
import { getFakeCrmState, resetFakeCrm } from "../crm/fakeCrmAdapter";
import { runCrmAgent } from "../pipeline/runCrmAgent";
import {
  assertUs001PipelineLive,
  assertUs002PipelineLive,
  assertUs003PipelineLive,
  assertUs004AmbiguousYossiLive,
  type PipelineStoryContext
} from "./assertUserStoryPipeline";
import {
  US_001_LIVE_EXPECTED,
  US_002_LIVE_EXPECTED,
  US_003_LIVE_EXPECTED,
  US_004_LIVE_EXPECTED
} from "./userStoryLiveExpectations";
import {
  US_001_BUYER_FROM_FACEBOOK,
  US_002_SELLER_LISTING_MEETING,
  US_003_VISIT_JORDAN_12,
  US_004_AMBIGUOUS_YOSSI_TURN1,
  US_004_AMBIGUOUS_YOSSI_TURN2
} from "./userStoryPrompts";
import { seedUs004AmbiguousYossiRamatGan } from "./seedUs004AmbiguousYossiRamatGan";

interface StorySingle {
  id: string;
  mode: "single";
  prompt: string;
  seed?: () => void;
  assert: (ctx: PipelineStoryContext) => void;
}

interface StoryDual {
  id: string;
  mode: "dual";
  prompts: readonly [string, string];
  seed?: () => void;
  assert: (ctx1: PipelineStoryContext, ctx2: PipelineStoryContext) => void;
}

type StoryRun = StorySingle | StoryDual;

const STORIES: StoryRun[] = [
  {
    id: "US-001",
    mode: "single",
    prompt: US_001_BUYER_FROM_FACEBOOK,
    assert: (ctx) => assertUs001PipelineLive(ctx, US_001_LIVE_EXPECTED)
  },
  {
    id: "US-002",
    mode: "single",
    prompt: US_002_SELLER_LISTING_MEETING,
    assert: (ctx) => assertUs002PipelineLive(ctx, US_002_LIVE_EXPECTED)
  },
  {
    id: "US-003",
    mode: "single",
    prompt: US_003_VISIT_JORDAN_12,
    assert: (ctx) => assertUs003PipelineLive(ctx, US_003_LIVE_EXPECTED)
  },
  {
    id: "US-004",
    mode: "dual",
    prompts: [US_004_AMBIGUOUS_YOSSI_TURN1, US_004_AMBIGUOUS_YOSSI_TURN2],
    seed: seedUs004AmbiguousYossiRamatGan,
    assert: (ctx1, ctx2) => assertUs004AmbiguousYossiLive(ctx1, ctx2, US_004_LIVE_EXPECTED)
  }
];

function printJson(label: string, value: unknown): void {
  console.log(`${label}:\n${JSON.stringify(value, null, 2)}`);
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("Missing OPENAI_API_KEY. Set it in the environment or .env, then rerun.");
    process.exit(1);
  }

  console.log("User story live evaluation (real parseMessage → pipeline)\n");

  let failures = 0;

  for (const story of STORIES) {
    console.log("\n" + "=".repeat(80));
    console.log(`${story.id}`);
    console.log("-".repeat(80));

    resetFakeCrm();
    resetDemoCrmStore();
    resetChatTranscript();
    story.seed?.();

    if (story.mode === "single") {
      console.log("PROMPT:\n" + story.prompt + "\n");

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
      continue;
    }

    console.log("PROMPT (turn 1):\n" + story.prompts[0] + "\n");
    const t1 = Date.now();
    const result1 = await processDemoChatTurn(story.prompts[0]);
    console.log(`reply turn 1 (${Date.now() - t1}ms):\n${result1.response}\n`);
    const fakeAfterTurn1 = getFakeCrmState();
    const demoAfterTurn1 = getDemoCrmState();

    console.log("PROMPT (turn 2):\n" + story.prompts[1] + "\n");
    const t2 = Date.now();
    const result2 = await processDemoChatTurn(story.prompts[1]);
    console.log(`reply turn 2 (${Date.now() - t2}ms):\n${result2.response}\n`);

    printJson("parsed turn 2", {
      actions: result2.parsed.actions,
      clarification_questions: result2.parsed.clarification_questions
    });
    printJson("validActions turn 2", result2.validActions);
    printJson("fakeCrm snapshot", getFakeCrmState());

    const ctx1: PipelineStoryContext = {
      result: result1,
      fakeCrm: fakeAfterTurn1,
      demoCrm: demoAfterTurn1
    };

    try {
      story.assert(ctx1, {
        result: result2,
        fakeCrm: getFakeCrmState(),
        demoCrm: getDemoCrmState()
      });
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
