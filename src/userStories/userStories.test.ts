/**
 * User-story acceptance tests — real OpenAI parser + full CRM pipeline (no parser mocks).
 * Requires OPENAI_API_KEY (e.g. in `.env` via dotenv). Suite skips when the key is missing.
 */

import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { resetChatTranscript } from "../chat/chatTranscriptStore";
import { processDemoChatTurn } from "../chat/processDemoChatTurn";
import { runCrmAgent } from "../pipeline/runCrmAgent";
import { getDemoCrmState, resetDemoCrmStore } from "../crm/demoCrmStore";
import { getFakeCrmState, resetFakeCrm } from "../crm/fakeCrmAdapter";
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

const apiKeyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());

async function runStoryHebrewPrompt(pipelineInput: string): Promise<PipelineStoryContext> {
  const result = await runCrmAgent({
    rawMessage: pipelineInput,
    pipelineInput,
    historyCount: 0
  });
  return {
    result,
    fakeCrm: getFakeCrmState(),
    demoCrm: getDemoCrmState()
  };
}

describe.skipIf(!apiKeyPresent)("user stories (live LLM)", () => {
  beforeEach(() => {
    resetFakeCrm();
    resetDemoCrmStore();
    resetChatTranscript();
  });

  it(
    "US-001: פרטי קונה מפייסבוק, העדפות אזור/תקציב/תכונות ומשימות שליחת הצעות ופולואפ",
    async () => {
      const input = US_001_BUYER_FROM_FACEBOOK;
      const expected = US_001_LIVE_EXPECTED;
      const ctx = await runStoryHebrewPrompt(input);
      expect(() => assertUs001PipelineLive(ctx, expected)).not.toThrow();
    },
    120_000
  );

  it(
    "US-002: מוכרת — מחיר בכרטיס לקוח, פרטי נכס נפרדים, הערות מחיר/כללי ופגישה בנכס",
    async () => {
      const input = US_002_SELLER_LISTING_MEETING;
      const expected = US_002_LIVE_EXPECTED;
      const ctx = await runStoryHebrewPrompt(input);
      expect(() => assertUs002PipelineLive(ctx, expected)).not.toThrow();
    },
    120_000
  );

  it(
    "US-003: פוסט־ביקור רוכש יחיד בהירדן 12 — משוב, נכס, סטטוס מתלבט ופולואפ מחר בערב",
    async () => {
      const input = US_003_VISIT_JORDAN_12;
      const expected = US_003_LIVE_EXPECTED;
      const ctx = await runStoryHebrewPrompt(input);
      expect(() => assertUs003PipelineLive(ctx, expected)).not.toThrow();
    },
    120_000
  );

  it(
    "US-004: יוסי כפול ברמת גן — הבהרה בסיבוב 1 ומשימה אחרי בחירת שם מלא (זיכרון שיחה בשרת)",
    async () => {
      seedUs004AmbiguousYossiRamatGan();

      const result1 = await processDemoChatTurn(US_004_AMBIGUOUS_YOSSI_TURN1);
      const ctx1: PipelineStoryContext = {
        result: result1,
        fakeCrm: getFakeCrmState(),
        demoCrm: getDemoCrmState()
      };

      const result2 = await processDemoChatTurn(US_004_AMBIGUOUS_YOSSI_TURN2);
      const ctx2: PipelineStoryContext = {
        result: result2,
        fakeCrm: getFakeCrmState(),
        demoCrm: getDemoCrmState()
      };

      expect(() => assertUs004AmbiguousYossiLive(ctx1, ctx2, US_004_LIVE_EXPECTED)).not.toThrow();
    },
    120_000
  );
});
