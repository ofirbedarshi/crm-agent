/**
 * Client use-case acceptance tests — real OpenAI parser + full CRM pipeline.
 * Requires OPENAI_API_KEY (e.g. in `.env` via dotenv). Suite skips when the key is missing.
 *
 * Use cases covered:
 *   UC-01  Create a client (full name, role)
 *   UC-02  Create without a last name → clarification, no client persisted
 *   UC-03  Create with basic details (role, lead_source, preferences)
 *   UC-04  Update a detail on an existing client (lead_temperature)
 */

import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { getFakeCrmState, resetFakeCrm } from "../crm/fakeCrmAdapter";
import { resetDemoCrmStore } from "../crm/demoCrmStore";
import { runCrmAgent } from "../pipeline/runCrmAgent";

const apiKeyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());

async function run(prompt: string) {
  return runCrmAgent({ rawMessage: prompt, pipelineInput: prompt, historyCount: 0 });
}

describe.skipIf(!apiKeyPresent)("client use cases (live LLM)", () => {
  beforeEach(() => {
    resetFakeCrm();
    resetDemoCrmStore();
  });

  it(
    "UC-01: creates a new client from a simple Hebrew prompt",
    async () => {
      const PROMPT = "תוסיף לקוח חדש בשם ישראל כהן, קונה.";
      const result = await run(PROMPT);

      const { clients } = getFakeCrmState();
      const client = clients.find((c) => c.name === "ישראל כהן");

      expect(
        client,
        `Expected "ישראל כהן" in CRM. Found: ${clients.map((c) => c.name).join(", ") || "(none)"}\n` +
          `validActions: ${JSON.stringify(result.validActions)}\n` +
          `rejected: ${JSON.stringify(result.trace.validation?.rejectedActions)}`
      ).toBeDefined();

      expect(client?.role).toBe("buyer");
    },
    120_000
  );

  it(
    "UC-02: prompting only a first name yields a clarification and no persisted client",
    async () => {
      const PROMPT = "תוסיף לקוח בשם ישראל.";
      const result = await run(PROMPT);

      const { clients } = getFakeCrmState();

      // No client row should have been written — either the name was rejected for missing last
      // name, or the parser asked for more context before producing an action at all.
      expect(
        clients.length,
        `Expected 0 clients in CRM after single-name prompt. Found: ${clients.map((c) => c.name).join(", ")}\n` +
          `validActions: ${JSON.stringify(result.validActions)}`
      ).toBe(0);

      // No action should have been executed
      expect(
        result.validActions.length,
        `Expected 0 valid actions. Got: ${JSON.stringify(result.validActions)}`
      ).toBe(0);

      // The pipeline must have surfaced at least one clarification question (could be about last
      // name, role, or any other missing field — the exact wording is LLM-dependent)
      const clarifications = result.trace.validation?.clarificationQuestions ?? [];
      expect(
        clarifications.length > 0,
        `Expected at least one clarification question. Got none.\nresponse: "${result.response}"`
      ).toBe(true);
    },
    120_000
  );

  it(
    "UC-03: creates a client with lead source and city preference",
    async () => {
      const PROMPT =
        "תוסיף לקוחה בשם רונה לוי, קונה, הגיעה מפייסבוק, מחפשת דירה בתל אביב עם תקציב של 2,000,000.";
      const result = await run(PROMPT);

      const { clients } = getFakeCrmState();
      const client = clients.find((c) => c.name === "רונה לוי");

      expect(
        client,
        `Expected "רונה לוי" in CRM. Found: ${clients.map((c) => c.name).join(", ") || "(none)"}\n` +
          `validActions: ${JSON.stringify(result.validActions)}\n` +
          `rejected: ${JSON.stringify(result.trace.validation?.rejectedActions)}`
      ).toBeDefined();

      expect(client?.role, `Expected role "buyer" on רונה לוי`).toBe("buyer");

      expect(
        client?.lead_source,
        `Expected lead_source to mention פייסבוק. Got: "${client?.lead_source}"`
      ).toMatch(/פייסבוק/i);

      expect(
        client?.preferences?.city,
        `Expected preferences.city "תל אביב". Got: "${client?.preferences?.city}"`
      ).toBe("תל אביב");

      expect(
        client?.preferences?.budget,
        `Expected preferences.budget 2000000. Got: ${client?.preferences?.budget}`
      ).toBe(2_000_000);
    },
    120_000
  );

  it(
    "UC-04: updates an existing client's lead temperature in a follow-up prompt",
    async () => {
      const CREATE_PROMPT = "תוסיף לקוחה בשם רונה לוי, קונה, הגיעה מפייסבוק.";
      const UPDATE_PROMPT = "עדכן את רונה לוי — הליד שלה חם מאוד.";

      // Turn 1: create the client
      await run(CREATE_PROMPT);

      const afterCreate = getFakeCrmState().clients.find((c) => c.name === "רונה לוי");
      expect(
        afterCreate,
        `Expected "רונה לוי" after create turn. Found: ${getFakeCrmState().clients.map((c) => c.name).join(", ") || "(none)"}`
      ).toBeDefined();

      // Turn 2: update lead temperature (CRM state carries over — no reset between turns)
      const result2 = await run(UPDATE_PROMPT);

      const afterUpdate = getFakeCrmState().clients.find((c) => c.name === "רונה לוי");

      expect(
        afterUpdate?.lead_temperature,
        `Expected lead_temperature "hot" after update. Got: "${afterUpdate?.lead_temperature}"\n` +
          `validActions: ${JSON.stringify(result2.validActions)}\n` +
          `rejected: ${JSON.stringify(result2.trace.validation?.rejectedActions)}`
      ).toBe("hot");
    },
    120_000
  );
});
