import { executeActions } from "../orchestrator/executeActions";

/**
 * Listing owner + property + buyer already in CRM before the US‑003 Hebrew message.
 * Used by Vitest (mocked parser) and by `eval:user-stories` (real LLM).
 */
export function seedUs003PreExistingCrm(): void {
  executeActions([
    { type: "create_or_update_client", data: { name: "דני בעלים", role: "owner" } },
    {
      type: "create_or_update_property",
      data: {
        address: "הירדן 12",
        asking_price: 3_000_000,
        owner_client_name: "דני בעלים",
        general_notes: "נכס רשום במערכת לפני סיור המתעניין"
      }
    },
    { type: "create_or_update_client", data: { name: "איתי", role: "buyer", lead_temperature: "cold" } }
  ]);
}
