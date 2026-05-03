/**
 * US-006: Two sequential reminders for two different "אבי"s.
 *
 * Reproduces the screenshot bug:
 *   Turn 1 (empty CRM): "תזכיר לי מחר לדבר עם אבי לוי בנוגע לאופציה שדיברנו עליה."
 *     → expect: client card "אבי לוי" + task for tomorrow.
 *   Turn 2 (CRM has אבי לוי): "תזכיר לי מחר לדבר עם אבי כהן בנוגע לאופציה שדיברנו עליה."
 *     → expect: NEW client card "אבי כהן" + a task for אבי כהן tomorrow.
 *       MUST NOT produce a "על איזה אבי מדובר" clarification — the user gave a full,
 *       unambiguous name that is not in CRM.
 *
 * Requires OPENAI_API_KEY.
 */

import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { resetFakeCrm, getFakeCrmState } from "../crm/fakeCrmAdapter";
import { resetDemoCrmStore } from "../crm/demoCrmStore";
import { runCrmAgent } from "../pipeline/runCrmAgent";

const apiKeyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());

describe.skipIf(!apiKeyPresent)("US-006: avi cohen after avi levi (live LLM)", () => {
  beforeEach(() => {
    resetFakeCrm();
    resetDemoCrmStore();
  });

  it(
    "creates אבי כהן as a NEW client when CRM already has אבי לוי, without asking which אבי",
    async () => {
      const PROMPT_1 = "תזכיר לי מחר לדבר עם אבי לוי בנוגע לאופציה שדיברנו עליה.";
      const PROMPT_2 = "תזכיר לי מחר לדבר עם אבי כהן בנוגע לאופציה שדיברנו עליה.";

      // --- Turn 1: empty CRM, full name "אבי לוי" ---
      const result1 = await runCrmAgent({
        rawMessage: PROMPT_1,
        pipelineInput: PROMPT_1,
        historyCount: 0
      });

      const clientsAfter1 = getFakeCrmState().clients.map((c) => c.name);
      expect(
        clientsAfter1.includes("אבי לוי"),
        `Turn 1 expected "אבי לוי" in CRM. Got: ${clientsAfter1.join(", ") || "(none)"}\n` +
          `Parsed: ${JSON.stringify(result1.parsed.actions)}\n` +
          `Clarifications: ${result1.trace.validation?.clarificationQuestions?.join(" | ")}\n` +
          `Response: ${result1.response}`
      ).toBe(true);

      // --- Turn 2: CRM now has אבי לוי, user names a DIFFERENT full name "אבי כהן" ---
      const result2 = await runCrmAgent({
        rawMessage: PROMPT_2,
        pipelineInput: PROMPT_2,
        historyCount: 0
      });

      const finalClients = getFakeCrmState().clients;
      const finalNames = finalClients.map((c) => c.name);

      // Both clients exist after turn 2.
      expect(
        finalNames.includes("אבי כהן"),
        `Expected "אבי כהן" in CRM after turn 2. Got: ${finalNames.join(", ") || "(none)"}\n` +
          `Turn 2 parsed: ${JSON.stringify(result2.parsed.actions)}\n` +
          `Turn 2 valid: ${JSON.stringify(result2.validActions)}\n` +
          `Turn 2 clarifications: ${result2.trace.validation?.clarificationQuestions?.join(" | ")}\n` +
          `Turn 2 rejected: ${JSON.stringify(result2.trace.validation?.rejectedActions)}\n` +
          `Turn 2 response: ${result2.response}`
      ).toBe(true);

      expect(finalNames.includes("אבי לוי")).toBe(true);

      // A task for אבי כהן tomorrow exists.
      const tasks = getFakeCrmState().tasks;
      const cohenTask = tasks.find((t) => t.client_name === "אבי כהן");
      expect(
        cohenTask,
        `Expected a task with client_name="אבי כהן" after turn 2. Tasks: ${JSON.stringify(tasks)}`
      ).toBeDefined();

      // No disambiguation question surfaced; the response describes the executed actions.
      expect(
        result2.response,
        `Turn 2 response unexpectedly asked which אבי. Got:\n"${result2.response}"`
      ).not.toMatch(/על איזה אבי מדובר/);
      expect(result2.trace.response?.replyType).toBe("actions");
    },
    120_000
  );
});
