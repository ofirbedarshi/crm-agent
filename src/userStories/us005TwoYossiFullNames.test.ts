/**
 * US-005: Two prompts with same first name but different last names.
 * Expects "יוסי כהן" and "יוסי לוי" to land as separate clients.
 * Requires OPENAI_API_KEY.
 */

import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { resetFakeCrm, getFakeCrmState } from "../crm/fakeCrmAdapter";
import { resetDemoCrmStore } from "../crm/demoCrmStore";
import { runCrmAgent } from "../pipeline/runCrmAgent";

const apiKeyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());

describe.skipIf(!apiKeyPresent)("US-005: two yossi full names (live LLM)", () => {
  beforeEach(() => {
    resetFakeCrm();
    resetDemoCrmStore();
  });

  it(
    "creates יוסי כהן and יוסי לוי as separate clients from two sequential prompts",
    async () => {
      const PROMPT_1 = "תעדכן את יוסי כהן שצריך לחזור אליו מחר לגבי הדירה ברמת גן.";
      const PROMPT_2 = "תעדכן את יוסי לוי שצריך לחזור אליו מחר לגבי הדירה ברמת גן.";
      const PROMPT_3 = "תעדכן את יוסי שצריך לחזור אליו מחר לגבי הדירה ברמת גן.";

      // --- Turn 1 ---
      const result1 = await runCrmAgent({
        rawMessage: PROMPT_1,
        pipelineInput: PROMPT_1,
        historyCount: 0
      });

      const parsedActions1 = result1.parsed.actions.map((a) => ({
        type: a.type,
        name: a.type === "create_or_update_client"
          ? a.data.name
          : a.type === "create_task"
          ? `[task] client_name=${a.data.client_name}`
          : a.type === "create_or_update_property"
          ? `[property] owner=${a.data.owner_client_name}`
          : "?"
      }));

      console.log("=== Turn 1 ===");
      console.log("Parsed actions:", JSON.stringify(parsedActions1, null, 2));
      console.log("Valid actions:", JSON.stringify(result1.validActions.map(a => ({ type: a.type, name: a.type === "create_or_update_client" ? a.data.name : a.type === "create_task" ? a.data.client_name : "?" })), null, 2));
      console.log("Clarifications:", result1.trace.validation?.clarificationQuestions);
      console.log("Rejected:", result1.trace.validation?.rejectedActions);
      console.log("Response:", result1.response);
      console.log("CRM clients after turn 1:", getFakeCrmState().clients.map(c => c.name));

      // --- Turn 2 (CRM now contains whatever turn 1 created) ---
      const result2 = await runCrmAgent({
        rawMessage: PROMPT_2,
        pipelineInput: PROMPT_2,
        historyCount: 0
      });

      const parsedActions2 = result2.parsed.actions.map((a) => ({
        type: a.type,
        name: a.type === "create_or_update_client"
          ? a.data.name
          : a.type === "create_task"
          ? `[task] client_name=${a.data.client_name}`
          : a.type === "create_or_update_property"
          ? `[property] owner=${a.data.owner_client_name}`
          : "?"
      }));

      console.log("=== Turn 2 ===");
      console.log("Parsed actions:", JSON.stringify(parsedActions2, null, 2));
      console.log("Valid actions:", JSON.stringify(result2.validActions.map(a => ({ type: a.type, name: a.type === "create_or_update_client" ? a.data.name : a.type === "create_task" ? a.data.client_name : "?" })), null, 2));
      console.log("Clarifications:", result2.trace.validation?.clarificationQuestions);
      console.log("Rejected:", result2.trace.validation?.rejectedActions);
      console.log("Response:", result2.response);

      const clientsAfterTurn2 = getFakeCrmState().clients;
      console.log("=== CRM after turn 2 ===");
      console.log("Clients:", clientsAfterTurn2.map(c => c.name));

      // --- Turn 3: ambiguous first-name only ---
      const result3 = await runCrmAgent({
        rawMessage: PROMPT_3,
        pipelineInput: PROMPT_3,
        historyCount: 0
      });

      const parsedActions3 = result3.parsed.actions.map((a) => ({
        type: a.type,
        name: a.type === "create_or_update_client"
          ? a.data.name
          : a.type === "create_task"
          ? `[task] client_name=${a.data.client_name}`
          : "?"
      }));

      console.log("=== Turn 3 ===");
      console.log("Parsed actions:", JSON.stringify(parsedActions3, null, 2));
      console.log("Valid actions:", JSON.stringify(result3.validActions.map(a => ({ type: a.type, name: a.type === "create_or_update_client" ? a.data.name : a.type === "create_task" ? a.data.client_name : "?" })), null, 2));
      console.log("Clarifications:", result3.trace.validation?.clarificationQuestions);
      console.log("Rejected:", result3.trace.validation?.rejectedActions);
      console.log("Response:", result3.response);

      const finalClients = getFakeCrmState().clients;
      console.log("=== Final CRM state ===");
      console.log("Clients:", finalClients.map(c => c.name));

      // Turn 1 + 2: both named clients must exist
      const hasYossiCohen = finalClients.some((c) => c.name === "יוסי כהן");
      const hasYossiLevi = finalClients.some((c) => c.name === "יוסי לוי");

      expect(
        hasYossiCohen,
        `Expected "יוסי כהן" in CRM. Clients found: ${finalClients.map(c => c.name).join(", ") || "(none)"}\n` +
        `Turn 1 parser output: ${JSON.stringify(parsedActions1)}\n` +
        `Turn 1 clarifications: ${result1.trace.validation?.clarificationQuestions?.join(" | ")}\n` +
        `Turn 1 rejected: ${JSON.stringify(result1.trace.validation?.rejectedActions)}`
      ).toBe(true);

      expect(
        hasYossiLevi,
        `Expected "יוסי לוי" in CRM. Clients found: ${finalClients.map(c => c.name).join(", ") || "(none)"}\n` +
        `Turn 2 parser output: ${JSON.stringify(parsedActions2)}\n` +
        `Turn 2 clarifications: ${result2.trace.validation?.clarificationQuestions?.join(" | ")}\n` +
        `Turn 2 rejected: ${JSON.stringify(result2.trace.validation?.rejectedActions)}`
      ).toBe(true);

      // Turn 3: single first-name "יוסי" with two matching clients → must return clarification, no new actions
      expect(
        result3.validActions.length,
        `Turn 3: expected 0 valid actions (ambiguous "יוסי"). Got ${result3.validActions.length}. ` +
        `Parser output: ${JSON.stringify(parsedActions3)}`
      ).toBe(0);

      const clarification3 = result3.response;
      expect(
        clarification3.includes("יוסי כהן") && clarification3.includes("יוסי לוי"),
        `Turn 3: expected clarification naming both יוסי כהן and יוסי לוי. Got:\n"${clarification3}"\n` +
        `Clarification questions: ${result3.trace.validation?.clarificationQuestions?.join(" | ")}`
      ).toBe(true);
    },
    120_000
  );
});
