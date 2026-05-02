/**
 * User-story acceptance tests — real OpenAI parser + full CRM pipeline (no parser mocks).
 * Requires OPENAI_API_KEY (e.g. in `.env` via dotenv). Suite skips when the key is missing.
 */

import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { runCrmAgent } from "../pipeline/runCrmAgent";
import { getDemoCrmState, resetDemoCrmStore } from "../crm/demoCrmStore";
import { getFakeCrmState, resetFakeCrm } from "../crm/fakeCrmAdapter";
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

const apiKeyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());

describe.skipIf(!apiKeyPresent)("user stories (live LLM)", () => {
  beforeEach(() => {
    resetFakeCrm();
    resetDemoCrmStore();
  });

  it(
    "US-001: פרטי קונה מפייסבוק, העדפות אזור/תקציב/תכונות ומשימות שליחת הצעות ופולואפ",
    async () => {
      const result = await runCrmAgent({
        rawMessage: US_001_BUYER_FROM_FACEBOOK,
        pipelineInput: US_001_BUYER_FROM_FACEBOOK,
        historyCount: 0
      });

      const ctx: PipelineStoryContext = {
        result,
        fakeCrm: getFakeCrmState(),
        demoCrm: getDemoCrmState()
      };
      expect(() => assertUs001PipelineLive(ctx)).not.toThrow();
    },
    120_000
  );

  it(
    "US-002: מוכרת — מחיר בכרטיס לקוח, פרטי נכס נפרדים, הערות מחיר/כללי ופגישה בנכס",
    async () => {
      const result = await runCrmAgent({
        rawMessage: US_002_SELLER_LISTING_MEETING,
        pipelineInput: US_002_SELLER_LISTING_MEETING,
        historyCount: 0
      });

      const ctx: PipelineStoryContext = {
        result,
        fakeCrm: getFakeCrmState(),
        demoCrm: getDemoCrmState()
      };
      expect(() => assertUs002PipelineLive(ctx)).not.toThrow();
    },
    120_000
  );

  it(
    "US-003: פוסט־ביקור רוכש יחיד בהירדן 12 — משוב, נכס, סטטוס מתלבט ופולואפ מחר בערב",
    async () => {
      const result = await runCrmAgent({
        rawMessage: US_003_VISIT_JORDAN_12,
        pipelineInput: US_003_VISIT_JORDAN_12,
        historyCount: 0
      });

      const ctx: PipelineStoryContext = {
        result,
        fakeCrm: getFakeCrmState(),
        demoCrm: getDemoCrmState()
      };

      expect(() => assertUs003PipelineLive(ctx)).not.toThrow();
    },
    120_000
  );
});
